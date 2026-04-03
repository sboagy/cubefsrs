/**
 * pwa-003-installability.spec.ts
 *
 * P1 — Verifies that the web app manifest and PWA meta tags are correctly
 * served by the preview build.
 *
 * Checks:
 *   - Manifest link is injected by vite-plugin-pwa
 *   - Manifest JSON contains required fields (name, icons, display)
 *   - theme-color meta tag has the CubeFSRS navy value (#1e3a5f)
 *   - Icon assets respond with 200 and non-zero content
 *
 * Runs in the `chromium-pwa-offline` Playwright project against the built
 * preview bundle (vite preview on PREVIEW_PORT 4174).
 */

import { expect, test } from "@playwright/test";

test.describe("PWA-003: Installability Checks", () => {
	test.setTimeout(30_000);

	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
	});

	test("theme-color meta tag is present with CubeFSRS navy value", async ({
		page,
	}) => {
		const themeColor = await page
			.locator('meta[name="theme-color"]')
			.getAttribute("content");
		expect(themeColor).toBe("#1e3a5f");
	});

	test("vite-plugin-pwa injects a manifest link into the document head", async ({
		page,
	}) => {
		// vite-plugin-pwa injects the manifest link automatically during build.
		const manifestHref = await page
			.locator('link[rel="manifest"]')
			.getAttribute("href");
		// The href will be something like /manifest.webmanifest or /site.webmanifest
		expect(manifestHref).toBeTruthy();
		expect(manifestHref).toMatch(/manifest/i);
	});

	test("manifest JSON contains required PWA fields", async ({ page, request }) => {
		// Retrieve the manifest href from the DOM, then fetch it directly.
		const manifestHref = await page
			.locator('link[rel="manifest"]')
			.getAttribute("href");
		expect(manifestHref).toBeTruthy();

		const baseURL =
			(test.info().project.use.baseURL ?? "http://localhost:4174").replace(
				/\/$/,
				"",
			);
		const manifestUrl = `${baseURL}${manifestHref}`;
		const response = await request.get(manifestUrl);
		expect(response.status()).toBe(200);

		const manifest = await response.json();

		// Required for installability
		expect(manifest.name).toBeTruthy();
		expect(manifest.short_name).toBeTruthy();
		expect(manifest.display).toBe("standalone");
		expect(manifest.start_url).toBeTruthy();
		expect(manifest.icons).toBeInstanceOf(Array);
		expect(manifest.icons.length).toBeGreaterThan(0);

		// Verify the expected app name
		expect(manifest.name).toBe("CubeFSRS - Algorithm Trainer");
		expect(manifest.short_name).toBe("CubeFSRS");
		expect(manifest.theme_color).toBe("#1e3a5f");
	});

	test("PWA icon assets are served correctly (192×192 and 512×512)", async ({
		request,
	}) => {
		const baseURL =
			(test.info().project.use.baseURL ?? "http://localhost:4174").replace(
				/\/$/,
				"",
			);

		for (const iconPath of ["/icon-192x192.png", "/icon-512x512.png"]) {
			const response = await request.get(`${baseURL}${iconPath}`);
			expect(response.status(), `Expected ${iconPath} to respond with 200`).toBe(200);

			const body = await response.body();
			// PNG signature magic bytes: \x89PNG
			expect(body.length, `Expected ${iconPath} to be non-empty`).toBeGreaterThan(100);
			expect(body.subarray(0, 4)).toEqual(
				Buffer.from([0x89, 0x50, 0x4e, 0x47]),
			);
		}
	});
});
