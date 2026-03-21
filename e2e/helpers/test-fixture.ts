/**
 * e2e/helpers/test-fixture.ts
 *
 * Extended Playwright `test` fixture for CubeFSRS E2E tests.
 *
 * Mirrors TuneTrees' `test-fixture.ts`. Key differences:
 * - No `repertoireId` — user data is scoped purely by `userId`
 * - IndexedDB name: `cubefsrs-storage`
 * - `autoStubTwisty` — verifies TwistyPlayer stub is active (since the stub
 *   is built into the app via `createTwistyPlayerMount`, this is a no-op most
 *   of the time but explicitly signals test intent)
 */

import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test as base } from "@playwright/test";
import log from "loglevel";
import { readStoredAuthStateMetadata } from "./auth-state";
import { clearCubefsrsClientStorage, gotoCfOrigin } from "./local-db-lifecycle";
import {
	getTestUserByWorkerIndex,
	TEST_USERS,
	type TestUser,
} from "./test-users";

export interface TestUserFixture {
	testUser: TestUser;
	testUserKey: string;
}

const E2E_CLEANUP_DIAGNOSTICS = process.env.E2E_CLEANUP_DIAGNOSTICS === "true";

function isExpectedPlaywrightTeardownError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message : String(error);
	return (
		msg.includes("Test ended") ||
		msg.includes("Target closed") ||
		msg.includes("Execution context was destroyed")
	);
}
const AUTH_EXPIRY_SAFETY_WINDOW_MS = 5 * 60 * 1000;

/**
 * Check whether an auth state file exists and is still fresh.
 */
function isAuthFresh(authFile: string, userEmail: string): boolean {
	if (!existsSync(authFile)) {
		console.log(`⚠️  Auth file missing: ${authFile}`);
		return false;
	}

	try {
		const metadata = readStoredAuthStateMetadata(authFile);
		if (!metadata) {
			console.log(`⚠️  Invalid auth file: ${authFile}`);
			return false;
		}

		const hasUserData = metadata.storedUserEmail === userEmail;

		if (!hasUserData) {
			console.log(`⚠️  Auth file is not for ${userEmail}: ${authFile}`);
			return false;
		}

		if (!metadata.hasIndexedDbSnapshot) {
			console.log(
				`⚠️  Auth file has no IndexedDB snapshot: ${authFile} (regenerate with npm run db:local:reset)`,
			);
			return false;
		}

		// Skip age check in CI — files were freshly generated in that job.
		if (process.env.CI) {
			return true;
		}

		if (metadata.expiresAtMs == null) {
			console.log(`⚠️  Auth file has no session expiry metadata: ${authFile}`);
			return false;
		}

		const msUntilExpiry = metadata.expiresAtMs - Date.now();

		if (msUntilExpiry <= AUTH_EXPIRY_SAFETY_WINDOW_MS) {
			console.log(
				`⚠️  Auth file token is expired or near expiry (${Math.round(msUntilExpiry / 1000 / 60)} min remaining): ${authFile}`,
			);
			return false;
		}

		return true;
	} catch (error) {
		console.log(`⚠️  Invalid auth file: ${authFile}`, error);
		return false;
	}
}

type ICubeFSRSFixtures = TestUserFixture & {
	consoleLogs: string[];
	autoCleanupDb: undefined;
	autoStubTwisty: undefined;
};

/**
 * Extended test with automatic user assignment by worker index.
 *
 * Every worker gets a dedicated test user to avoid conflicts across parallel
 * tests. The `storageState` fixture provides per-worker auth state.
 */
export const test = base.extend<ICubeFSRSFixtures>({
	// ---------------------------------------------------------------------------
	// autoCleanupDb — clear local SQLite WASM state after every test (auto)
	// ---------------------------------------------------------------------------
	autoCleanupDb: [
		async ({ page }: { page: Page }, use: (v: undefined) => Promise<void>) => {
			await use(undefined);

			try {
				if (page.isClosed()) return;
				await gotoCfOrigin(page);
				await clearCubefsrsClientStorage(page);
			} catch (e) {
				if (!isExpectedPlaywrightTeardownError(e) || E2E_CLEANUP_DIAGNOSTICS) {
					console.warn("[E2E] auto cleanup skipped/failed:", e);
					if (E2E_CLEANUP_DIAGNOSTICS && e instanceof Error && e.stack) {
						console.warn(`[E2E] auto cleanup stack:\n${e.stack}`);
					}
				}
			}
		},
		{ auto: true },
	],

	// ---------------------------------------------------------------------------
	// autoStubTwisty — document that cube viewer runs in stub mode (auto)
	//
	// The stub is built into the app (`createTwistyPlayerMount` in test mode),
	// so this fixture is mostly a no-op. It exists to make intent explicit in
	// each test and to provide a hook for future assertions.
	// ---------------------------------------------------------------------------
	autoStubTwisty: [
		// biome-ignore lint/correctness/noEmptyPattern: Playwright fixture pattern
		async ({}, use: (v: undefined) => Promise<void>) => {
			// Stub is already active at app level when MODE=test.
			await use(undefined);
		},
		{ auto: true },
	],

	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixture pattern
	testUser: async ({}, use, testInfo) => {
		const user = getTestUserByWorkerIndex(testInfo.parallelIndex);
		await use(user);
	},

	testUserKey: async ({ testUser }, use) => {
		const userKey = Object.keys(TEST_USERS).find(
			(key) => TEST_USERS[key].email === testUser.email,
		);
		if (!userKey) {
			throw new Error(
				`No test user key found for email "${testUser.email}". Available keys: ${Object.keys(TEST_USERS).join(", ")}`,
			);
		}
		await use(userKey);
	},

	// Override storageState to use the assigned worker's auth file.
	storageState: async ({ testUserKey, testUser }, use) => {
		const authFile = `e2e/.auth/${testUserKey}.json`;

		if (!isAuthFresh(authFile, testUser.email)) {
			console.log(
				`❌ STALE AUTH: ${authFile} — Run 'npm run db:local:reset' to regenerate`,
			);
			throw new Error(
				`Authentication expired for ${testUser.email}. Run: npm run db:local:reset`,
			);
		}

		log.debug(`🔐 Worker auth: ${authFile} (fresh)`);
		await use(authFile);
	},

	// Capture browser console logs and attach to test results.
	consoleLogs: async ({ page }, use, testInfo) => {
		const buffer: string[] = [];
		const prefix = `[Browser][${testInfo.project.name}][w${testInfo.parallelIndex}]`;

		page.on("console", (msg) => {
			try {
				const type = msg.type();
				const text = msg.text();

				// Always surface sync / DB diagnostics in stdout.
				for (const tag of [
					"[SyncDiag]",
					"[cfTestApi]",
					"[DbInitDiag]",
					"[E2E Persist",
				]) {
					if (text.startsWith(tag)) {
						console.log(`${prefix} ${text}`);
					}
				}

				if (text && !text.startsWith("Downloaded DevTools")) {
					buffer.push(`[${type}] ${text}`);
				}
			} catch {
				// Ignore extraction errors during teardown.
			}
		});

		await use(buffer);

		const failed = testInfo.status !== testInfo.expectedStatus;
		if (failed && buffer.length) {
			console.log(
				`${prefix} [FAILED TEST] dumping ${buffer.length} browser console line(s)`,
			);
			for (const line of buffer) {
				console.log(`${prefix} ${line}`);
			}
		}
		if (buffer.length) {
			await testInfo.attach("browser-console", {
				body: buffer.join("\n"),
				contentType: "text/plain",
			});
		}
	},
});

export { expect } from "@playwright/test";
export { TEST_USERS, getTestUserByWorkerIndex };
