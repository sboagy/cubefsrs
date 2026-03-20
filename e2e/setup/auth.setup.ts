/**
 * e2e/setup/auth.setup.ts
 *
 * Playwright setup project that authenticates all 8 test users and saves
 * their auth state to `e2e/.auth/<key>.json`.
 *
 * Run directly to regenerate auth files:
 *   RESET_DB=true npm run db:local:reset
 *   # or just regenerate tokens without clearing data:
 *   playwright test --project=setup
 *
 * Prerequisites:
 *   - The shared local Supabase instance must be running (`supabase start`).
 *   - The app dev server must be running with MODE=test
 *     (`npm run dev:test` or launched by Playwright webServer).
 *   - Environment variables `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
 *     and `VITE_SUPABASE_ANON_KEY` must be set (via .env.local or CI secrets).
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { TEST_USERS } from "../helpers/test-users";
import { BASE_URL } from "../test-config";

// Load .env.local for local development (no-op in CI where env vars come from secrets)
config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Auth state files live in e2e/.auth/ (listed in e2e/.gitignore) */
const AUTH_DIR = resolve(__dirname, "../.auth");

/**
 * Supabase tables owned by CubeFSRS that are safe to truncate on RESET_DB.
 * The global catalog tables (alg_category, alg_subset, alg_case) are NEVER
 * touched — they contain seed data that is not user-specific.
 */
const CUBEFSRS_USER_TABLES = [
	"user_alg_selection",
	"fsrs_card_state",
	"sync_push_queue",
] as const;

/**
 * JWT expiry matches `jwt_expiry` in supabase/config.toml (604800s = 7 days).
 */
const AUTH_EXPIRY_MINUTES = 10080;

const ALICE_TEST_PASSWORD =
	process.env.ALICE_TEST_PASSWORD ||
	process.env.TEST_USER_PASSWORD ||
	"TestPassword123!";

// ── helpers ──────────────────────────────────────────────────────────────────

function ensureAuthDir(): void {
	if (!existsSync(AUTH_DIR)) {
		mkdirSync(AUTH_DIR, { recursive: true });
	}
}

function isAuthFileFresh(filePath: string): boolean {
	if (!existsSync(filePath)) return false;
	try {
		const ageMinutes = (Date.now() - statSync(filePath).mtimeMs) / 1000 / 60;
		return ageMinutes < AUTH_EXPIRY_MINUTES;
	} catch {
		return false;
	}
}

/**
 * Clear all user-owned CubeFSRS data from Supabase Postgres for every test
 * user.  Only called when `RESET_DB=true`.  Never touches catalog tables.
 */
async function resetCubefsrsUserData(): Promise<void> {
	const supabaseUrl = process.env.VITE_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error(
			"[auth.setup] RESET_DB=true requires VITE_SUPABASE_URL and " +
				"SUPABASE_SERVICE_ROLE_KEY to be set.",
		);
	}

	const adminClient = createClient(supabaseUrl, serviceRoleKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});

	const userIds = Object.values(TEST_USERS).map((u) => u.userId);

	for (const table of CUBEFSRS_USER_TABLES) {
		const { error } = await adminClient
			.schema("cubefsrs")
			.from(table)
			.delete()
			.in("user_id", userIds);

		if (error) {
			throw new Error(
				`[auth.setup] Failed to clear cubefsrs.${table}: ${error.message}`,
			);
		}

		console.log(`  ✅ Cleared cubefsrs.${table} for ${userIds.length} users`);
	}
}

// ── main setup test ───────────────────────────────────────────────────────────

/**
 * Authenticate all 8 shared workspace test users and persist their auth state.
 */
setup("authenticate all test users", async ({ browser }) => {
	setup.setTimeout(120_000);

	ensureAuthDir();

	const shouldReset = process.env.RESET_DB === "true";
	const isCI = !!process.env.CI;

	// ── optional DB reset (CubeFSRS rows only) ───────────────────────────────
	if (shouldReset) {
		console.log("🗑️  RESET_DB=true — clearing CubeFSRS user data in Supabase…");
		await resetCubefsrsUserData();
		console.log("✅ CubeFSRS user data cleared");
	} else {
		console.log("ℹ️  Skipping DB reset (set RESET_DB=true to clear test data)");
	}

	// ── per-user auth flow ───────────────────────────────────────────────────
	for (const [userKey, testUser] of Object.entries(TEST_USERS)) {
		const authFile = `${AUTH_DIR}/${userKey}.json`;

		// Skip users whose auth state is still fresh (unless in CI or RESET_DB)
		if (!shouldReset && !isCI && isAuthFileFresh(authFile)) {
			const ageMinutes = Math.round(
				(Date.now() - statSync(authFile).mtimeMs) / 1000 / 60,
			);
			console.log(
				`✅ [${testUser.name}] Using cached auth state (${ageMinutes} min old)`,
			);
			continue;
		}

		console.log(`⏳ [${testUser.name}] Logging in as ${testUser.email}…`);

		// Each user gets an isolated browser context
		const context = await browser.newContext({
			baseURL: `${BASE_URL}/`,
		});
		const page = await context.newPage();

		try {
			// Navigate to login page
			await page.goto(`${BASE_URL}/login`);

			// Fill credentials — use id-based selectors until Rhizome lands data-testids
			await page.locator("#login-email").fill(testUser.email);
			await page.locator("#login-password").fill(ALICE_TEST_PASSWORD);
			await page.getByRole("button", { name: "Sign In" }).click();

			// Wait for redirect away from /login
			await page.waitForURL((url) => !url.pathname.includes("/login"), {
				timeout: 15_000,
			});

			// Wait for __cfTestApi to attach (requires user to be signed in and DB init complete)
			await page.waitForFunction(
				() =>
					(window as unknown as { __cfTestApi?: unknown }).__cfTestApi !==
					undefined,
				{ timeout: 30_000 },
			);

			// Wait for sync to reach idle before saving state, so tests begin
			// from a known sync baseline rather than mid-sync.
			await page
				.evaluate(() => window.__cfTestApi?.waitForSyncIdle(10_000))
				.catch(() => {
					// Non-fatal: sync idle may not be implemented yet or worker may be down.
					console.warn(
						`⚠️  [${testUser.name}] waitForSyncIdle timed out — continuing`,
					);
				});

			// Remove sync timestamp localStorage keys so tests perform a fresh
			// initial sync rather than an incremental one.
			await page.evaluate(() => {
				const keysToRemove: string[] = [];
				for (let i = 0; i < localStorage.length; i++) {
					const key = localStorage.key(i);
					if (key?.startsWith("CF_LAST_SYNC_TIMESTAMP")) {
						keysToRemove.push(key);
					}
				}
				for (const key of keysToRemove) {
					localStorage.removeItem(key);
				}
			});

			// Verify we're on a non-login page (quick sanity check)
			await expect(page).not.toHaveURL(/\/login/, { timeout: 2_000 });

			// Persist auth state
			await context.storageState({ path: authFile });

			console.log(`✅ [${testUser.name}] Auth state saved to ${authFile}`);
		} finally {
			await context.close();
		}
	}

	console.log("🎉 All test users authenticated");
});

// Type augment so page.evaluate can see __cfTestApi.
// Must match the CfTestApi declaration in alg-scenarios.ts to avoid a
// "Subsequent property declarations must have the same type" TS error.
declare global {
	interface Window {
		__cfTestApi?: import("../../src/lib/e2e-test-api").CfTestApi;
	}
}
