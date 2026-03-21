/**
 * e2e/tests/auth-002-anonymous.spec.ts
 *
 * Verify that a user can launch the app in anonymous / device-only mode
 * by clicking "Use on this Device Only" on the login page, and that the
 * practice view loads without a full registration flow.
 *
 * Note: requires the shared local Supabase instance to have Anonymous
 * Sign-In enabled. If anonymous auth is disabled, this test will fail
 * at the login step.
 */

import { expect, test } from "@playwright/test";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";
import { BASE_URL } from "../test-config";

test.describe("auth-002: anonymous sign-in", () => {
	test("device-only button loads the app without login", async ({ page }) => {
		const cfPage = new CubeFSRSPage(page);

		// Start from root — should see login page.
		await page.goto(`${BASE_URL}/`);
		await expect(cfPage.anonymousButton).toBeVisible({ timeout: 15_000 });

		// Click "Use on this Device Only".
		await cfPage.anonymousButton.click();

		// App should navigate to the practice view.
		await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

		// Sidebar should render (app is functional in device-only mode).
		await expect(cfPage.practiceLink).toBeVisible({ timeout: 10_000 });
	});
});
