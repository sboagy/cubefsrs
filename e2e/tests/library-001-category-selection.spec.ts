/**
 * e2e/tests/library-001-category-selection.spec.ts
 *
 * Verify that the Alg Library category selector works correctly:
 * - `#category-select` contains the standard algorithm categories
 * - Changing the  selected category updates the subset checkbox list
 */

import { expect } from "@playwright/test";
import { setupForLibraryTestsParallel } from "../helpers/alg-scenarios";
import { test as cfTest } from "../helpers/test-fixture";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";

cfTest.describe("library-001: category selection", () => {
	cfTest.beforeEach(async ({ page, testUser }) => {
		await setupForLibraryTestsParallel(page, testUser);
	});

	cfTest(
		"#category-select contains standard algorithm categories",
		async ({ page }) => {
			const cfPage = new CubeFSRSPage(page);

			// Verify the category selector is present.
			await expect(cfPage.categorySelect).toBeVisible({ timeout: 10_000 });

			// Catalog data loads asynchronously; wait for options before reading.
			await expect(
				cfPage.categorySelect.locator("option").first(),
			).toBeAttached({ timeout: 10_000 });

			// Confirm PLL, OLL, and F2L options are in the list.
			const options = await cfPage.categorySelect
				.locator("option")
				.allTextContents();
			expect(options).toContain("PLL");
			expect(options).toContain("OLL");
			expect(options).toContain("F2L");
		},
	);

	cfTest("changing category updates the subsets shown", async ({ page }) => {
		const cfPage = new CubeFSRSPage(page);

		// Switch to OLL.
		await cfPage.categorySelect.selectOption("OLL");

		// OLL should show T-Shape subset (or at least one relevant OLL subset).
		// We wait for at least one subset checkbox to become visible.
		await expect(
			page
				.locator("label")
				.filter({ hasText: /T-Shape|Dot|Line|Cross/i })
				.first(),
		).toBeVisible({ timeout: 5_000 });
	});

	cfTest(
		"switching back to PLL shows PLL-specific subsets",
		async ({ page }) => {
			const cfPage = new CubeFSRSPage(page);

			// Switch away then back to PLL.
			await cfPage.categorySelect.selectOption("OLL");
			await cfPage.categorySelect.selectOption("PLL");

			// PLL should show Adjacent Corners or similar PLL subset.
			await expect(
				page
					.locator("label")
					.filter({ hasText: /Adjacent|Diagonal|Corners/i })
					.first(),
			).toBeVisible({ timeout: 5_000 });
		},
	);
});
