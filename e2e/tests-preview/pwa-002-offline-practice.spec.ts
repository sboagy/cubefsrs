/**
 * pwa-002-offline-practice.spec.ts
 *
 * P0 — Verifies that the application shell loads correctly after the
 * browser goes offline (Workbox serve-from-cache behaviour).
 *
 * Sequence:
 *   1. Load the app — SW activates and caches the shell.
 *   2. Simulate offline (context.setOffline).
 *   3. Hard-reload the page.
 *   4. Assert the cached app shell (title + root div) is still served by
 *      the SW — no browser "You are offline" error page.
 *   5. Restore online.
 *
 * Note: this test verifies shell caching only, NOT offline data writes.
 * Data-layer offline tests belong in pwa-002-offline-data.spec.ts (future).
 *
 * Runs in the `chromium-pwa-offline` Playwright project against the built
 * preview bundle (vite preview on PREVIEW_PORT 4174).
 */

import { expect, test } from "@playwright/test";
import { goOffline, goOnline } from "../helpers/network-control";
import { waitForServiceWorker } from "../helpers/wait-for-service-worker";

test.describe("PWA-002: Offline App Shell", () => {
	test.setTimeout(60_000);

	// Restore online state even if the test fails so it doesn't affect others.
	test.afterEach(async ({ page }) => {
		await goOnline(page);
	});

	test("app shell serves correctly from SW cache after going offline", async ({
		page,
		context,
	}) => {
		const swOrigin =
			(test.info().project.use.baseURL ?? "http://localhost:4174").replace(
				/\/$/,
				"",
			);

		// --- Step 1: Load the app and wait for SW to activate ---
		await page.goto("/", { waitUntil: "networkidle" });
		await waitForServiceWorker(context, swOrigin, "activated", 30_000);

		// Give Workbox a moment to complete precaching (install event is async)
		await page.waitForTimeout(1_000);

		// --- Step 2: Go offline ---
		await goOffline(page);

		// --- Step 3: Hard-reload — must be served entirely by SW ---
		await page.reload({ waitUntil: "domcontentloaded" });

		// --- Step 4: App shell should still render (no browser offline page) ---

		// The page title is set by vite-plugin-pwa / index.html — "CubeFSRS" is
		// always visible regardless of auth state or route.
		await expect(page).toHaveTitle(/CubeFSRS/, { timeout: 15_000 });

		// Workbox serves index.html via navigateFallback; the SPA mounts here.
		const appRoot = page.locator("#app");
		await expect(appRoot).toBeAttached({ timeout: 10_000 });

		// Verify we are NOT on the browser's built-in offline error page.
		const bodyText = await page.locator("body").innerText();
		expect(bodyText).not.toMatch(/no internet|ERR_INTERNET_DISCONNECTED|offline/i);
	});
});
