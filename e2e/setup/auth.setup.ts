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
 *   - Environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
 *     must be set (via .env.local or CI secrets).
 *   - `RESET_DB=true` also requires `DATABASE_URL`, or it falls back to the
 *     standard local Supabase Postgres URL.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as setup } from "@playwright/test";
import { config } from "dotenv";
import {
	AUTH_STATE_DB_VERSION_STORAGE_KEY,
	AUTH_STATE_SNAPSHOT_VERSION_STORAGE_KEY,
	CURRENT_AUTH_STATE_DB_VERSION,
	CURRENT_AUTH_STATE_SNAPSHOT_VERSION,
	readStoredAuthStateMetadata,
} from "../helpers/auth-state";
import { getRequiredTestPassword } from "../helpers/auth-env";
import { TEST_USERS } from "../helpers/test-users";
import { BASE_URL } from "../test-config";

// Load .env.local for local development (no-op in CI where env vars come from secrets)
config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const E2E_DATABASE_URL =
	process.env.DATABASE_URL ||
	"postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Auth state files live in e2e/.auth/ (listed in e2e/.gitignore) */
const AUTH_DIR = resolve(__dirname, "../.auth");

/**
 * Supabase tables owned by CubeFSRS that are safe to truncate on RESET_DB.
 * The global catalog tables (alg_category, alg_subset, alg_case) are NEVER
 * touched — they contain seed data that is not user-specific.
 *
 * NOTE: This list must only contain tables that actually exist in the
 * `cubefsrs` schema and are user-scoped. It is used by RESET_DB to clear
 * all synced user data without touching shared catalog tables.
 */
const CUBEFSRS_USER_TABLES = [
	"user_alg_selection",
	"fsrs_card_state",
	"practice_time_entry",
	"user_alg_annotation",
	"user_settings",
] as const;

const AUTH_EXPIRY_SAFETY_WINDOW_MS = 5 * 60 * 1000;

function quoteSqlLiteral(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function formatExecFileErrorOutput(error: unknown): string {
	if (!error || typeof error !== "object") {
		return "";
	}

	const execError = error as {
		stdout?: string | Buffer;
		stderr?: string | Buffer;
	};
	const details: string[] = [];

	const stdout = Buffer.isBuffer(execError.stdout)
		? execError.stdout.toString("utf8")
		: execError.stdout;
	if (typeof stdout === "string" && stdout.trim().length > 0) {
		details.push(`stdout:\n${stdout.trim()}`);
	}

	const stderr = Buffer.isBuffer(execError.stderr)
		? execError.stderr.toString("utf8")
		: execError.stderr;
	if (typeof stderr === "string" && stderr.trim().length > 0) {
		details.push(`stderr:\n${stderr.trim()}`);
	}

	if (details.length === 0) {
		return "";
	}

	return `\n${details.join("\n")}`;
}

function ensurePsqlAvailable(): void {
	try {
		execFileSync("psql", ["--version"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		});
	} catch (error) {
		const execError = error as NodeJS.ErrnoException;
		if (execError.code === "ENOENT") {
			throw new Error(
				"[auth.setup] RESET_DB=true requires the PostgreSQL CLI (`psql`), but it was not found in PATH. Install PostgreSQL client tools and verify `psql --version` works before re-running this setup.",
			);
		}

		const message = execError.message ?? String(error);
		const output = formatExecFileErrorOutput(error);
		throw new Error(
			`[auth.setup] Unable to run \`psql --version\` before RESET_DB cleanup: ${message}${output}`,
		);
	}
}

function ensureAuthDir(): void {
	if (!existsSync(AUTH_DIR)) {
		mkdirSync(AUTH_DIR, { recursive: true });
	}
}

function isAuthFileFresh(filePath: string): boolean {
	if (!existsSync(filePath)) return false;
	const metadata = readStoredAuthStateMetadata(filePath);
	if (!metadata?.hasIndexedDbSnapshot) return false;
	if (metadata.expiresAtMs == null) return false;
	if (metadata.snapshotVersion !== CURRENT_AUTH_STATE_SNAPSHOT_VERSION) {
		return false;
	}
	if (
		CURRENT_AUTH_STATE_DB_VERSION != null &&
		metadata.dbVersion !== CURRENT_AUTH_STATE_DB_VERSION
	) {
		return false;
	}
	return metadata.expiresAtMs - Date.now() > AUTH_EXPIRY_SAFETY_WINDOW_MS;
}

async function waitForCatalogSnapshotReady(
	page: import("@playwright/test").Page,
	timeoutMs: number,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastCount = 0;

	while (Date.now() < deadline) {
		lastCount = await page.evaluate(async () => {
			const api = (
				window as unknown as {
					__cfTestApi?: import("../../src/lib/e2e-test-api").CfTestApi;
				}
			).__cfTestApi;
			if (!api) return 0;
			return await api.getCatalogCaseCount();
		});

		if (lastCount > 0) {
			return;
		}

		await page.waitForTimeout(100);
	}

	const timeoutDiagnostics = await page.evaluate(async () => {
		const clientSqlite = await import("../../src/lib/db/client-sqlite.ts");
		const sqlite = await clientSqlite.getSqliteInstance();
		const execCount = (tableName: string) => {
			const result = sqlite?.exec(`SELECT COUNT(*) FROM "${tableName}"`);
			return Number(result?.[0]?.values?.[0]?.[0] ?? 0);
		};
		const algCaseColumns = (
			sqlite?.exec("PRAGMA table_info('alg_case')")?.[0]?.values ?? []
		)
			.map((row) => String(row[1] ?? ""))
			.filter(Boolean);

		return {
			algCaseCount: execCount("alg_case"),
			algCategoryCount: execCount("alg_category"),
			algSubsetCount: execCount("alg_subset"),
			algCaseColumns,
		};
	});

	throw new Error(
		`[auth.setup] Timed out waiting for local catalog snapshot (last count: ${lastCount}, diagnostics: ${JSON.stringify(timeoutDiagnostics)})`,
	);
}

/**
 * Clear all user-owned CubeFSRS data from Supabase Postgres for every test
 * user.  Only called when `RESET_DB=true`.  Never touches catalog tables.
 */
async function resetCubefsrsUserData(): Promise<void> {
	const userIds = Object.values(TEST_USERS).map((u) => u.userId);
	const userIdList = userIds.map(quoteSqlLiteral).join(", ");
	ensurePsqlAvailable();

	for (const table of CUBEFSRS_USER_TABLES) {
		try {
			execFileSync(
				"psql",
				[
					"-d",
					E2E_DATABASE_URL,
					"--no-psqlrc",
					"-v",
					"ON_ERROR_STOP=1",
					"-c",
					`DELETE FROM cubefsrs.${table} WHERE user_id IN (${userIdList});`,
				],
				{
					cwd: REPO_ROOT,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
					env: process.env,
				},
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const output = formatExecFileErrorOutput(error);
			throw new Error(
				`[auth.setup] Failed to clear cubefsrs.${table}: ${message}${output}`,
			);
		}

		console.log(`  ✅ Cleared cubefsrs.${table} for ${userIds.length} users`);
	}
}

async function getCfModeWithRetry(
	page: import("@playwright/test").Page,
	timeoutMs: number,
): Promise<string | null> {
	const deadline = Date.now() + timeoutMs;
	let lastMode: string | null = null;

	while (Date.now() < deadline) {
		try {
			lastMode = await page.evaluate(
				() =>
					((window as unknown as Record<string, unknown>).__cfMode as
						| string
						| undefined) ?? null,
			);

			if (lastMode === "test") {
				return lastMode;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!message.includes("Execution context was destroyed")) {
				throw error;
			}
		}

		await page.waitForTimeout(100);
	}

	return lastMode;
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
	const sharedTestPassword = getRequiredTestPassword("auth.setup");

	// ── pre-check: dev server must be running with --mode test ───────────────
	// window.__cfMode is set synchronously at app startup (main.tsx) only when
	// MODE === "test". Detecting it here (before the per-user login loop) fails
	// fast with a clear message instead of silently hanging ~30s per user while
	// waitForFunction polls for __cfTestApi that will never appear.
	{
		const probePage = await browser.newPage();
		try {
			await probePage.goto(`${BASE_URL}/`, {
				waitUntil: "domcontentloaded",
				timeout: 10_000,
			});
			const cfMode = await getCfModeWithRetry(probePage, 2_000);
			if (cfMode !== "test") {
				throw new Error(
					"[auth.setup] Dev server is NOT running in test mode " +
						`(window.__cfMode = ${JSON.stringify(cfMode ?? null)}).\n` +
						"Kill the existing dev server and start it with:\n" +
						"  npm run dev:test\n" +
						"Then re-run the E2E tests.",
				);
			}
		} finally {
			await probePage.close();
		}
	}

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
			const metadata = readStoredAuthStateMetadata(authFile);
			const remainingMinutes = metadata?.expiresAtMs
				? Math.round((metadata.expiresAtMs - Date.now()) / 1000 / 60)
				: 0;
			console.log(
				`✅ [${testUser.name}] Using cached auth state (${remainingMinutes} min until expiry)`,
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
			await page.locator("#login-password").fill(sharedTestPassword);
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

			// Auth snapshots must include a populated local catalog. Otherwise later
			// tests can restore a signed-in session whose IndexedDB is structurally
			// valid but unusable for seeded practice scenarios.
			await waitForCatalogSnapshotReady(page, 30_000);

			// Remove sync timestamp localStorage keys so tests perform a fresh
			// initial sync rather than an incremental one.
			await page.evaluate(() => {
				const keysToRemove: string[] = [];
				const prefixes = ["CF_LAST_SYNC_TIMESTAMP", "TT_LAST_SYNC_TIMESTAMP"];
				for (let i = 0; i < localStorage.length; i++) {
					const key = localStorage.key(i);
					if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
						keysToRemove.push(key);
					}
				}
				for (const key of keysToRemove) {
					localStorage.removeItem(key);
				}
			});

			if (CURRENT_AUTH_STATE_DB_VERSION != null) {
				await page.evaluate(
					({ key, value }) => {
						localStorage.setItem(key, String(value));
					},
					{
						key: AUTH_STATE_DB_VERSION_STORAGE_KEY,
						value: CURRENT_AUTH_STATE_DB_VERSION,
					},
				);
			}

			await page.evaluate(
				({ key, value }) => {
					localStorage.setItem(key, String(value));
				},
				{
					key: AUTH_STATE_SNAPSHOT_VERSION_STORAGE_KEY,
					value: CURRENT_AUTH_STATE_SNAPSHOT_VERSION,
				},
			);

			// Verify we're on a non-login page (quick sanity check)
			await expect(page).not.toHaveURL(/\/login/, { timeout: 2_000 });

			// Persist auth state, including IndexedDB so isAuthFresh() accepts it
			await context.storageState({ path: authFile, indexedDB: true });

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
