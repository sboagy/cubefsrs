/**
 * pwa-001-service-worker.spec.ts
 *
 * P0 — Verifies that a Workbox service worker registers and activates
 * successfully in the production preview build.
 *
 * A failing test here means the PWA is broken at the most fundamental level
 * (SW won't install, so the app cannot work offline).
 *
 * Runs in the `chromium-pwa-offline` Playwright project against the built
 * preview bundle (vite preview on PREVIEW_PORT 4174).
 */

import { expect, test } from "@playwright/test";
import { waitForServiceWorker } from "../helpers/wait-for-service-worker";

test.describe("PWA-001: Service Worker Registration", () => {
	// SW activation can involve multiple fetch requests during install — give it
	// generous time on first run.
	test.setTimeout(45_000);

	test("service worker registers and activates on the preview build", async ({
		page,
		context,
	}) => {
		// Navigate to the preview origin so the browser downloads the SW script.
		await page.goto("/", { waitUntil: "domcontentloaded" });

		// Wait for the SW to finish activating (Workbox completes precache here).
		const swOrigin =
			(test.info().project.use.baseURL ?? "http://localhost:4174").replace(
				/\/$/,
				"",
			);
		const sw = await waitForServiceWorker(context, swOrigin, "activated", 30_000);

		// The SW URL should be relative to the preview origin — not a CDN etc.
		expect(sw.url()).toContain(swOrigin);

		// Confirm at least one SW is registered for this origin.
		const registrations = await page.evaluate(() =>
			navigator.serviceWorker.getRegistrations().then((regs) => regs.length),
		);
		expect(registrations).toBeGreaterThan(0);
	});
});
