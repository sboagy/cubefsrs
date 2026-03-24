/**
 * e2e/tests/sync-001-basic-push.spec.ts
 *
 * Verify the deterministic two-phase sync flow:
 *
 * Phase 1 — Baseline
 *   - Wait for initial sync idle
 *   - Verify outbox count = 0 (setup mutations suppressed sync triggers)
 *
 * Phase 2 — Produce work (local → outbox)
 *   - Pause auto-sync
 *   - Grade a card
 *   - Verify outbox count increases by at least 1
 *
 * Phase 3 — Flush (outbox → worker)
 *   - Trigger forceSyncUp()
 *   - Wait for sync idle
 *   - Verify outbox count drains to 0
 *   - Resume auto-sync before test teardown
 */

import { expect } from "@playwright/test";
import { CATALOG_CASE_PLL_T_PERM_ID } from "../../tests/fixtures/test-data";
import {
	getCfTestApi,
	setupForPracticeTestsParallel,
} from "../helpers/alg-scenarios";
import { test as cfTest } from "../helpers/test-fixture";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";

cfTest.describe("sync-001: basic push", () => {
	cfTest.beforeEach(async ({ page, testUser }) => {
		// Seed 1 due card and navigate to practice.
		await setupForPracticeTestsParallel(page, testUser, {
			dueCards: [{ caseId: CATALOG_CASE_PLL_T_PERM_ID, dueOffsetDays: -1 }],
		});
	});

	cfTest(
		"grading a card survives a push plus full pull round-trip",
		async ({ page }) => {
			const cfPage = new CubeFSRSPage(page);
			const api = await getCfTestApi(page);

			// Phase 1: Baseline — outbox should be empty after seeding.
			await api.waitForSyncIdle(10_000);
			const baselineCount = await api.getSyncOutboxCount();
			expect(baselineCount).toBe(0);

			// Phase 2: Pause background sync and grade a card.
			await api.pauseAutoSync();

			await expect(cfPage.gradeBarGood).toBeVisible({ timeout: 10_000 });
			await cfPage.gradeBarGood.click();

			// Verify at least 1 outbox row was added (the grade mutation is queued).
			await expect
				.poll(() => api.getSyncOutboxCount(), { timeout: 10_000 })
				.toBeGreaterThan(0);
			const outboxAfterGrade = await api.getSyncOutboxCount();
			expect(outboxAfterGrade).toBeGreaterThan(0);

			// Phase 3: Flush — trigger an explicit sync and verify the outbox drains.
			await api.forceSyncUp();
			await api.waitForSyncIdle(15_000);

			const outboxAfterSync = await api.getSyncOutboxCount();
			expect(outboxAfterSync).toBe(0);

			const syncedFsrsCard = await api.getFsrsCardState(
				CATALOG_CASE_PLL_T_PERM_ID,
			);
			expect(syncedFsrsCard).not.toBeNull();
			expect(syncedFsrsCard?.reps ?? 0).toBeGreaterThan(0);

			// Phase 4: Prove the worker persisted the change by clearing local user data
			// and pulling it back from the server.
			await api.clearUserData();
			expect(await api.getFsrsCardState(CATALOG_CASE_PLL_T_PERM_ID)).toBeNull();

			await api.forceSyncDown({ full: true });
			await api.waitForSyncIdle(15_000);

			const restoredFsrsCard = await api.getFsrsCardState(
				CATALOG_CASE_PLL_T_PERM_ID,
			);
			expect(restoredFsrsCard).not.toBeNull();
			expect(restoredFsrsCard?.reps ?? 0).toBeGreaterThan(0);

			// Resume auto-sync before teardown.
			await api.resumeAutoSync();
		},
	);
});
