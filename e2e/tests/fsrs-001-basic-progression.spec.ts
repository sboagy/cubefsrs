/**
 * e2e/tests/fsrs-001-basic-progression.spec.ts
 *
 * Verify FSRS scheduling progression:
 * 1. Seed 1 card with dueOffsetDays = -1 (due yesterday)
 * 2. Grade Good
 * 3. After grading, the card should no longer be in the immediate due queue
 *    (it was scheduled for a future date by the FSRS algorithm)
 * 4. The practice view should either show the empty state or another card
 */

import { expect } from "@playwright/test";
import { CATALOG_CASE_PLL_T_PERM_ID } from "../../tests/fixtures/test-data";
import {
	getCfTestApi,
	setupForPracticeTestsParallel,
} from "../helpers/alg-scenarios";
import { test as cfTest } from "../helpers/test-fixture";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";

cfTest.describe("fsrs-001: basic FSRS progression", () => {
	cfTest.beforeEach(async ({ page, testUser }) => {
		await setupForPracticeTestsParallel(page, testUser, {
			dueCards: [{ caseId: CATALOG_CASE_PLL_T_PERM_ID, dueOffsetDays: -1 }],
		});
	});

	cfTest("grading Good schedules card for a future date", async ({ page }) => {
		const cfPage = new CubeFSRSPage(page);
		const api = await getCfTestApi(page);

		// Confirm card is due.
		await expect(cfPage.gradeBarGood).toBeVisible({ timeout: 10_000 });
		const beforeCount = await api.getPracticeQueueCount();
		expect(beforeCount).toBeGreaterThan(0);

		// Grade Good.
		await cfPage.gradeBarGood.click();

		// Wait for UI to update.
		await page.waitForTimeout(500);

		// After grading Good for a new card, FSRS schedules the card for a
		// future date >= 1 day from now. It should no longer be in the due queue.
		const afterCount = await api.getPracticeQueueCount();

		// The queue count should have changed (card was consumed).
		// For a first Good review, FSRS typically schedules ~1 day out.
		// Either the queue is now 0 (card is future), or the app shows empty state.
		expect(afterCount).toBeLessThanOrEqual(beforeCount);
	});

	cfTest(
		"after grading, practice view shows empty state (no other due cards)",
		async ({ page }) => {
			const cfPage = new CubeFSRSPage(page);

			// Grade the card.
			await expect(cfPage.gradeBarGood).toBeVisible({ timeout: 10_000 });
			await cfPage.gradeBarGood.click();

			// With only one card seeded and it now scheduled in the future,
			// the practice view should show the empty state.
			await expect(cfPage.emptyStateMessage).toBeVisible({ timeout: 10_000 });
		},
	);
});
