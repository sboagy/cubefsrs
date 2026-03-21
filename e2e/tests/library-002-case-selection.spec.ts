/**
 * e2e/tests/library-002-case-selection.spec.ts
 *
 * Verify case selection/deselection in the Alg Library:
 * - Seeds 1 selected case via `__cfTestApi`
 * - Navigates to the library and confirms the Enabled checkbox is checked
 * - Toggles the case off and verifies the checkbox reflects the change
 * - Verifies `__cfTestApi.getSelectedCaseIds()` is updated
 */

import { expect } from "@playwright/test";
import { CATALOG_CASE_PLL_T_PERM_ID } from "../../tests/fixtures/test-data";
import { setupForLibraryTestsParallel } from "../helpers/alg-scenarios";
import { test as cfTest } from "../helpers/test-fixture";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";

cfTest.describe("library-002: case selection", () => {
	cfTest(
		"seeded selected case shows Enabled checkbox as checked",
		async ({ page, testUser }) => {
			const cfPage = new CubeFSRSPage(page);

			// Seed T Perm as selected and navigate to PLL library.
			await setupForLibraryTestsParallel(page, testUser, {
				selectedCaseIds: [CATALOG_CASE_PLL_T_PERM_ID],
				category: "PLL",
			});

			// Verify the category shows PLL.
			await expect(cfPage.categorySelect).toHaveValue("PLL", {
				timeout: 10_000,
			});

			// Verify T Perm tile shows Enabled checked.
			const tPermCheckbox = cfPage.caseEnabledCheckbox("T Perm");
			await expect(tPermCheckbox).toBeChecked({ timeout: 5_000 });
		},
	);

	cfTest(
		"unchecking Enabled removes the case from selection",
		async ({ page, testUser }) => {
			const cfPage = new CubeFSRSPage(page);

			await setupForLibraryTestsParallel(page, testUser, {
				selectedCaseIds: [CATALOG_CASE_PLL_T_PERM_ID],
				category: "PLL",
			});

			// Uncheck T Perm.
			const tPermCheckbox = cfPage.caseEnabledCheckbox("T Perm");
			await expect(tPermCheckbox).toBeChecked({ timeout: 5_000 });
			await tPermCheckbox.uncheck();

			// Verify the checkbox is now unchecked.
			await expect(tPermCheckbox).not.toBeChecked({ timeout: 3_000 });

			// Verify via __cfTestApi that the case is deselected.
			const selectedIds: string[] = await page.evaluate(
				() => window.__cfTestApi?.getSelectedCaseIds() ?? [],
			);
			expect(selectedIds).not.toContain(CATALOG_CASE_PLL_T_PERM_ID);
		},
	);

	cfTest(
		"checking Enabled adds the case to selection",
		async ({ page, testUser }) => {
			const cfPage = new CubeFSRSPage(page);

			// Start with NO selected cases.
			await setupForLibraryTestsParallel(page, testUser, {
				selectedCaseIds: [],
				category: "PLL",
			});

			// T Perm should be unchecked.
			const tPermCheckbox = cfPage.caseEnabledCheckbox("T Perm");
			await expect(tPermCheckbox).not.toBeChecked({ timeout: 5_000 });

			// Check it.
			await tPermCheckbox.check();
			await expect(tPermCheckbox).toBeChecked({ timeout: 3_000 });
		},
	);
});
