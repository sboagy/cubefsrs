/**
 * e2e/tests/practice-002-algorithm-display.spec.ts
 *
 * Verify that when a FSRS card is due, the Practice view shows:
 * - The algorithm text for the due case
 * - The TwistyPlayer stub (confirming WebGL bypass is active)
 * - The grade bar buttons
 */

import { expect } from "@playwright/test";
import { CATALOG_CASE_PLL_T_PERM_ID } from "../../tests/fixtures/test-data";
import { setupForPracticeTestsParallel } from "../helpers/alg-scenarios";
import { test as cfTest } from "../helpers/test-fixture";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";

cfTest.describe("practice-002: algorithm display", () => {
	cfTest.beforeEach(async ({ page, testUser }) => {
		// Seed T Perm as due now (dueOffsetDays: -1 means due yesterday).
		await setupForPracticeTestsParallel(page, testUser, {
			dueCards: [{ caseId: CATALOG_CASE_PLL_T_PERM_ID, dueOffsetDays: -1 }],
		});
	});

	cfTest("shows algorithm text for the due card", async ({ page }) => {
		const cfPage = new CubeFSRSPage(page);

		// Algorithm text should be visible.
		await expect(cfPage.algorithmText).toBeVisible({ timeout: 10_000 });

		// Should contain at least some move notation characters.
		const algText = await cfPage.algorithmText.textContent();
		expect(algText).toBeTruthy();
		expect(algText!.length).toBeGreaterThan(0);
	});

	cfTest(
		"renders TwistyPlayer stub (not the WebGL element)",
		async ({ page }) => {
			const cfPage = new CubeFSRSPage(page);

			// Wait for the practice view to load.
			await expect(cfPage.algorithmText).toBeVisible({ timeout: 10_000 });

			// The stub div must be visible — this confirms WebGL is bypassed in test mode.
			await expect(cfPage.cubeViewerStub).toBeVisible({ timeout: 5_000 });
		},
	);

	cfTest("shows grade bar buttons when a card is due", async ({ page }) => {
		const cfPage = new CubeFSRSPage(page);

		await expect(cfPage.algorithmText).toBeVisible({ timeout: 10_000 });

		// All four grade buttons must be visible.
		await expect(cfPage.gradeBarAgain).toBeVisible({ timeout: 5_000 });
		await expect(cfPage.gradeBarHard).toBeVisible();
		await expect(cfPage.gradeBarGood).toBeVisible();
		await expect(cfPage.gradeBarEasy).toBeVisible();
	});
});
