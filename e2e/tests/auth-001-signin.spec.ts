/**
 * e2e/tests/auth-001-signin.spec.ts
 *
 * Verify that Alice can sign in via the login form and land on the
 * practice view with the sidebar visible.
 *
 * Runs in the `chromium-auth` project (no stored auth state), so it tests
 * the real sign-in flow rather than relying on a cached session.
 */

import { expect, test } from "@playwright/test";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";
import { BASE_URL } from "../test-config";

const ALICE_EMAIL = "alice.test@tunetrees.test";
const ALICE_PASSWORD = process.env.ALICE_TEST_PASSWORD ?? "TestPassword123!";

test.describe("auth-001: sign in", () => {
	test("Alice can sign in and see the practice view", async ({ page }) => {
		const cfPage = new CubeFSRSPage(page);

		// Navigate to the app root — should redirect to /login.
		await page.goto(`${BASE_URL}/`);
		await expect(cfPage.emailInput).toBeVisible({ timeout: 15_000 });

		// Fill in credentials and sign in.
		await cfPage.emailInput.fill(ALICE_EMAIL);
		await cfPage.passwordInput.fill(ALICE_PASSWORD);
		await cfPage.signInButton.click();

		// App should navigate to the practice view (root route `/`).
		await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

		// Sidebar navigation should be visible.
		await expect(cfPage.practiceLink).toBeVisible({ timeout: 10_000 });
		await expect(cfPage.libraryLink).toBeVisible();
	});
});
