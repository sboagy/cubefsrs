/**
 * network-control.ts
 *
 * Helpers for simulating offline/online states and network conditions.
 * Adapted from TuneTrees' `e2e/helpers/network-control.ts`.
 *
 * The CubeFSRS sync worker defaults to `http://localhost:8787` (resolved from
 * `VITE_WORKER_URL`).  Use `blockWorker()` / `unblockWorker()` when a test
 * needs to assert on sync-queue state without triggering an actual push.
 */

import type { Page, Route } from "@playwright/test";

/** Default URL pattern that matches the local sync worker. */
export const WORKER_URL_PATTERN = "*://localhost:8787/**";

/**
 * Put the browser context offline.
 */
export async function goOffline(page: Page): Promise<void> {
	await page.context().setOffline(true);
	await page.waitForTimeout(300);
}

/**
 * Restore network connectivity.
 */
export async function goOnline(page: Page): Promise<void> {
	await page.context().setOffline(false);
	await page.waitForTimeout(300);
}

/**
 * Block all requests to the sync worker, simulating a worker outage without
 * fully disconnecting the browser.  Returns a cleanup function to restore.
 *
 * @example
 * ```typescript
 * const unblock = await blockWorker(page);
 * // … assert outbox grows …
 * await unblock();
 * ```
 */
export async function blockWorker(
	page: Page,
	workerUrlPattern = WORKER_URL_PATTERN,
): Promise<() => Promise<void>> {
	const handler = async (route: Route) => {
		await route.abort("failed");
	};

	await page.route(workerUrlPattern, handler);

	return async () => {
		await page.unroute(workerUrlPattern, handler);
	};
}

/**
 * Simulate a slow connection by inserting a delay before every request.
 * Returns a cleanup function.
 */
export async function simulateSlowNetwork(
	page: Page,
	delayMs: number,
): Promise<() => Promise<void>> {
	const handler = async (route: Route) => {
		await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
		await route.continue();
	};

	await page.route("**/*", handler);

	return async () => {
		await page.unroute("**/*", handler);
	};
}

/**
 * Check whether the browser context is currently offline.
 */
export async function isOffline(page: Page): Promise<boolean> {
	return await page.evaluate(() => !navigator.onLine);
}

/**
 * Wait for the browser's `navigator.onLine` to reach `targetState`.
 */
export async function waitForNetworkState(
	page: Page,
	targetState: "online" | "offline",
	timeoutMs = 5000,
): Promise<void> {
	const expectedOnline = targetState === "online";
	await page.waitForFunction(
		(expected) => navigator.onLine === expected,
		expectedOnline,
		{ timeout: timeoutMs },
	);
}
