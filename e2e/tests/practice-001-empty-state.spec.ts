/**
 * e2e/tests/practice-001-empty-state.spec.ts
 *
 * Verify that the Practice view shows the empty-state message when no
 * FSRS cards are due (no cards have been seeded).
 */

import { expect } from "@playwright/test";
import { setupForPracticeTestsParallel } from "../helpers/alg-scenarios";
import { test as cfTest } from "../helpers/test-fixture";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";

cfTest.describe("practice-001: empty state", () => {
	cfTest.beforeEach(async ({ page, testUser }) => {
		// Setup with no due cards — this clears user data and navigates to `/`.
		await setupForPracticeTestsParallel(page, testUser, { dueCards: [] });
	});

	cfTest(
		"shows empty-state message when no cards are due",
		async ({ page }) => {
			const cfPage = new CubeFSRSPage(page);

			// The empty state message should be immediately visible.
			await expect(cfPage.emptyStateMessage).toBeVisible({ timeout: 10_000 });
		},
	);

	cfTest("grade buttons are not visible in empty state", async ({ page }) => {
		const cfPage = new CubeFSRSPage(page);

		await expect(cfPage.emptyStateMessage).toBeVisible({ timeout: 10_000 });

		// Grade buttons should not be rendered without an active card.
		await expect(cfPage.gradeBarAgain).not.toBeVisible();
		await expect(cfPage.gradeBarGood).not.toBeVisible();
	});
});
