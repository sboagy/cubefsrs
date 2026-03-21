/**
 * e2e/helpers/alg-scenarios.ts
 *
 * Deterministic test-setup helpers for CubeFSRS E2E tests.
 *
 * Mirrors TuneTrees' `practice-scenarios.ts` for CubeFSRS. Key differences:
 * - No `repertoireId` concept — seeding is purely `userId`-scoped
 * - Uses `__cfTestApi` (not `__ttTestApi`) as the mutation boundary
 * - Catalog is algorithm cases, not tunes
 */

import type { Page } from "@playwright/test";
import type { CfTestApi } from "../../src/lib/e2e-test-api";
import type { TestUser } from "./test-users";

const SEEDED_SETUP_TIMEOUT_MS = 20_000;

/**
 * Retrieve `window.__cfTestApi` from the page.
 * Throws if the API is not attached (app not running in test mode, or user
 * not yet signed in).
 */
export async function getCfTestApi(page: Page): Promise<CfTestApi> {
	const api = await page.evaluate(
		() => (window as unknown as { __cfTestApi?: unknown }).__cfTestApi,
	);
	if (!api) {
		throw new Error(
			"[alg-scenarios] window.__cfTestApi is not attached. " +
				"Ensure the app is running with MODE=test (npm run dev:test) " +
				"and the user is signed in.",
		);
	}
	// Return a proxy so Playwright calls each method over the page boundary.
	return {
		dispose: () => page.evaluate(() => window.__cfTestApi?.dispose()),
		rehydrateStores: () =>
			page.evaluate(() => window.__cfTestApi?.rehydrateStores()),
		seedAlgSelection: (opts) =>
			page.evaluate(
				(o) => window.__cfTestApi?.seedAlgSelection(o),
				opts,
			) as Promise<void>,
		seedFsrsCardState: (opts) =>
			page.evaluate(
				(o) => window.__cfTestApi?.seedFsrsCardState(o),
				opts,
			) as Promise<void>,
		clearUserData: () =>
			page.evaluate(() => window.__cfTestApi?.clearUserData()),
		pauseAutoSync: () =>
			page.evaluate(() => window.__cfTestApi?.pauseAutoSync()),
		resumeAutoSync: () =>
			page.evaluate(() => window.__cfTestApi?.resumeAutoSync()),
		forceSyncUp: () =>
			page.evaluate(() => window.__cfTestApi?.forceSyncUp()),
		waitForSyncIdle: (timeoutMs?: number) =>
			page.evaluate(
				(t) => window.__cfTestApi?.waitForSyncIdle(t),
				timeoutMs,
			) as Promise<void>,
		getSyncOutboxCount: () =>
			page.evaluate(
				() => window.__cfTestApi?.getSyncOutboxCount(),
			) as Promise<number>,
		getPracticeQueueCount: () =>
			page.evaluate(
				() => window.__cfTestApi?.getPracticeQueueCount(),
			) as Promise<number>,
		getCatalogCaseCount: () =>
			page.evaluate(
				() => window.__cfTestApi?.getCatalogCaseCount(),
			) as Promise<number>,
		getSelectedCaseIds: () =>
			page.evaluate(
				() => window.__cfTestApi?.getSelectedCaseIds(),
			) as Promise<string[]>,
	} as CfTestApi;
}

/**
 * Base deterministic setup: clear user data and optionally seed cases.
 *
 * This is the analogue of TuneTrees' `setupDeterministicTestParallel`.
 * It should be called in `beforeEach` to guarantee a clean slate for each
 * test. Because `__cfTestApi` performs setup writes with sync triggers
 * suppressed and rehydrates stores internally, the UI immediately reflects
 * the seeded state when this function returns.
 *
 * @param page - Playwright page
 * @param _testUser - The test user (used for future Supabase-side resets if needed)
 * @param opts.selectedCaseIds - Case IDs to add to `user_alg_selection`
 * @param opts.fsrsCards - FSRS cards to seed (array of seedFsrsCardState opts)
 */
export async function setupDeterministicTestParallel(
	page: Page,
	_testUser: TestUser,
	opts: {
		selectedCaseIds?: string[];
		fsrsCards?: Array<{
			caseId: string;
			dueOffsetDays: number;
			reps?: number;
			state?: number;
		}>;
	} = {},
): Promise<void> {
	// Navigate to root so the app boots, CubeAuthProvider restores auth state
	// from storageState (localStorage/cookies), and attaches window.__cfTestApi.
	// Without this, the page is at about:blank and __cfTestApi is never defined.
	await page.goto("/");

	// Only gate on __cfTestApi when there's actual seeding to perform.
	// Tests with no seeding (e.g. practice-001 empty state) must not be forced to
	// wait for catalog sync — on a fresh IndexedDB under 8 parallel workers, that
	// sync can take > 30 s and would unconditionally time out.
	// For tests that DO seed, allow up to 20 s for auth/bootstrap and catalog
	// availability under parallel load before failing fast.
	const hasSeeding =
		(opts.selectedCaseIds?.length ?? 0) > 0 ||
		(opts.fsrsCards?.length ?? 0) > 0;
	if (hasSeeding) {
		await page.waitForFunction(
			() => !!(window as unknown as { __cfTestApi?: unknown }).__cfTestApi,
			{ timeout: SEEDED_SETUP_TIMEOUT_MS },
		);

		// Seeded scenarios need the local catalog to exist before rehydrating
		// stores. Otherwise fsrs_card_state rows are inserted, but loadFsrsFromDb()
		// cannot map case UUIDs back to names yet and the practice queue stays empty.
		await page.waitForFunction(
			async () => {
				const api = (window as unknown as { __cfTestApi?: CfTestApi }).__cfTestApi;
				if (!api) return false;
				return (await api.getCatalogCaseCount()) > 0;
			},
			{ timeout: SEEDED_SETUP_TIMEOUT_MS },
		);

		// For seeded scenarios, clear any existing user data before applying seeds.
		// autoCleanupDb already deletes IndexedDB between tests; this ensures any
		// additional user-scoped state managed by __cfTestApi is reset when seeding.
		await page.evaluate(() => window.__cfTestApi?.clearUserData());
	}
	if (opts.selectedCaseIds && opts.selectedCaseIds.length > 0) {
		await page.evaluate(
			(caseIds) =>
				window.__cfTestApi?.seedAlgSelection({ caseIds }),
			opts.selectedCaseIds,
		);
	}

	for (const card of opts.fsrsCards ?? []) {
		await page.evaluate(
			(c) => window.__cfTestApi?.seedFsrsCardState(c),
			card,
		);
	}
}

/**
 * Set up for library view tests: clear data, seed selected cases,
 * then navigate to `/library`.
 */
export async function setupForLibraryTestsParallel(
	page: Page,
	testUser: TestUser,
	opts: {
		selectedCaseIds?: string[];
		/** If provided, selects this category in the UI after navigation. */
		category?: string;
	} = {},
): Promise<void> {
	await setupDeterministicTestParallel(page, testUser, {
		selectedCaseIds: opts.selectedCaseIds,
	});
	await page.goto("/library");
	// The category list is populated asynchronously from catalog data. Wait for
	// at least one <option> to appear before trying to selectOption() or read.
	await page.waitForFunction(
		() => {
			const sel = document.querySelector(
				"#category-select",
			) as HTMLSelectElement | null;
			return (sel?.options?.length ?? 0) > 0;
		},
		{ timeout: 10_000 },
	);
	if (opts.category) {
		await page.locator("#category-select").selectOption(opts.category);
	}
}

/**
 * Set up for practice view tests: clear data, seed due FSRS cards,
 * then navigate to `/`.
 */
export async function setupForPracticeTestsParallel(
	page: Page,
	testUser: TestUser,
	opts: {
		dueCards?: Array<{
			caseId: string;
			dueOffsetDays: number;
			reps?: number;
			state?: number;
		}>;
	} = {},
): Promise<void> {
	const cards = opts.dueCards ?? [];
	const selectedCaseIds = cards.map((c) => c.caseId);

	await setupDeterministicTestParallel(page, testUser, {
		selectedCaseIds,
		fsrsCards: cards,
	});

	// setupDeterministicTestParallel already booted the app at `/` before
	// seeding. Reloading here creates a second startup path that can race with
	// local-only seeded state restoration. Keep the already-seeded page in place
	// and wait until the due queue is visible to the practice store.
	if (cards.length > 0) {
		await page.waitForFunction(
			async (expectedCount) => {
				const api = (window as unknown as { __cfTestApi?: CfTestApi }).__cfTestApi;
				if (!api) return false;
				return (await api.getPracticeQueueCount()) >= expectedCount;
			},
			cards.length,
			{ timeout: 10_000 },
		);
	}
}

/**
 * Thin wrapper: seed alg selections directly via `__cfTestApi`.
 */
export async function seedAlgSelectionLocally(
	page: Page,
	opts: { caseIds: string[] },
): Promise<void> {
	await page.evaluate(
		(o) => window.__cfTestApi?.seedAlgSelection(o),
		opts,
	);
}

/**
 * Thin wrapper: seed a single FSRS card directly via `__cfTestApi`.
 */
export async function seedFsrsCardLocally(
	page: Page,
	opts: {
		caseId: string;
		dueOffsetDays: number;
		reps?: number;
		state?: number;
	},
): Promise<void> {
	await page.evaluate(
		(o) => window.__cfTestApi?.seedFsrsCardState(o),
		opts,
	);
}

/**
 * Delete the `cubefsrs-storage` IndexedDB and clear sessionStorage /
 * relevant localStorage keys.  Mirrors TuneTrees' `clearTunetreesStorageDB`.
 */
export async function clearCubefsrsStorageDB(
	page: Page,
	opts: { preserveAuth?: boolean } = {},
): Promise<void> {
	await page.evaluate(async (options) => {
		const preserveAuth = options.preserveAuth ?? true;

		try {
			sessionStorage.clear();
		} catch {
			/* ignore */
		}

		if (!preserveAuth) {
			try {
				localStorage.clear();
			} catch {
				/* ignore */
			}
		}

		await new Promise<void>((resolve, reject) => {
			const req = indexedDB.deleteDatabase("cubefsrs-storage");
			req.onsuccess = () => resolve();
			req.onerror = () => reject(req.error);
			req.onblocked = () => reject(new Error("IndexedDB delete blocked"));
		});
	}, opts);
}

// Extend the global interface so TypeScript knows about __cfTestApi in
// page.evaluate() calls within this file.
declare global {
	interface Window {
		__cfTestApi?: import("../../src/lib/e2e-test-api").CfTestApi;
	}
}
