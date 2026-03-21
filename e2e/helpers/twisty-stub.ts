/**
 * twisty-stub.ts
 *
 * Documents (and, if needed, reinforces) that the TwistyPlayer cube viewer is
 * replaced with a lightweight DOM stub in test mode.
 *
 * The app itself already handles this: `createTwistyPlayerMount` in
 * `src/lib/twisty/createTwistyPlayerMount.ts` returns a plain div when
 * `import.meta.env.MODE === 'test'`.  Since Playwright runs the app with
 * `npm run dev:test` (MODE=test), the stub is wired at the app level and no
 * additional `page.addInitScript` interception is required.
 *
 * Call `verifyTwistyStubPresent(page)` in a test or fixture to assert that
 * at least one stub div is rendered in the document — useful as a quick sanity
 * check that the app was started in test mode.
 */

import type { Page } from "@playwright/test";

/**
 * Assert that at least one `[data-testid="twisty-player-stub"]` element is
 * present on the page.  Throws if the app was not started in test mode.
 */
export async function verifyTwistyStubPresent(page: Page): Promise<void> {
	const count = await page
		.locator('[data-testid="twisty-player-stub"]')
		.count();
	if (count === 0) {
		throw new Error(
			"[twisty-stub] No twisty-player-stub found. " +
				"Ensure the app is running with MODE=test (npm run dev:test).",
		);
	}
}
