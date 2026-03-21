/**
 * e2e/tests/offline-001-device-mode.spec.ts
 *
 * Verify that the app remains functional in offline / device-only mode.
 *
 * Flow:
 * 1. Sign in anonymously (no credentials, no network dependency for login).
 * 2. Simulate going offline with `networkControl.goOffline()`.
 * 3. Verify the practice view renders (app functions without network).
 * 4. Restore network before cleanup.
 */

import { expect, test } from "@playwright/test";
import { goOffline, goOnline } from "../helpers/network-control";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";
import { BASE_URL } from "../test-config";

// Use a clean browser context — this test exercises anonymous sign-in, so it
// must NOT have a pre-authenticated storageState (the custom cfTest fixture
// injects auth which would bypass the login page entirely).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("offline-001: device-only mode", () => {
	test("app remains functional in offline mode after anonymous sign-in", async ({
		page,
	}) => {
		const cfPage = new CubeFSRSPage(page);

		// Navigate to root — should see login.
		await page.goto(`${BASE_URL}/`);
		await expect(cfPage.anonymousButton).toBeVisible({ timeout: 15_000 });

		// Sign in anonymously.
		await cfPage.anonymousButton.click();
		await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
		await expect(cfPage.practiceLink).toBeVisible({ timeout: 10_000 });

		// Simulate going offline.
		await goOffline(page);

		// App should still render the practice view after going offline.
		// The empty-state or an algorithm display should be visible (depends on
		// whether any FSRS cards were seeded — anonymous users start with none).
		await expect(cfPage.emptyStateMessage).toBeVisible({ timeout: 5_000 });

		// Restore network before test cleanup.
		await goOnline(page);
	});
});
