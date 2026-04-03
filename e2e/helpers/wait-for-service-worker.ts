/**
 * e2e/helpers/wait-for-service-worker.ts
 *
 * Waits for a Workbox-managed Service Worker to register and reach the
 * 'activated' state. Required before any offline test that relies on
 * cached assets being served by the SW.
 *
 * Adapted from TuneTrees' identical helper.
 */

import type { BrowserContext, Worker } from "@playwright/test";

// Service Worker states surfaced through registration.active.state
type ServiceWorkerState = "activated" | "installing" | "redundant" | "waiting";

/**
 * Wait for a service worker at the given origin to register and reach
 * `desiredState` (default: "activated").
 *
 * @param context      Playwright BrowserContext
 * @param url          Base URL of the PWA (origin is extracted)
 * @param desiredState State to wait for (default: "activated")
 * @param timeoutMs    Maximum wait in ms (default: 15 000)
 * @returns            The Playwright Worker object for the activated SW
 */
export async function waitForServiceWorker(
	context: BrowserContext,
	url: string,
	desiredState: ServiceWorkerState = "activated",
	timeoutMs = 15_000,
): Promise<Worker> {
	const targetOrigin = new URL(url).origin;
	const startTime = Date.now();
	const pollIntervalMs = 500;

	// --- 1. Check for an already-registered worker (race-free) ---
	const existingWorkers = context.serviceWorkers();
	let worker: Worker | undefined = existingWorkers.find((sw) =>
		sw.url().startsWith(targetOrigin),
	);

	if (worker) {
		console.log("[waitForServiceWorker] Worker already registered — skipping wait.");
	} else {
		console.log(`[waitForServiceWorker] Waiting for SW registration at: ${url}`);
		try {
			worker = await context.waitForEvent("serviceworker", {
				predicate: (sw: Worker) => sw.url().startsWith(targetOrigin),
				timeout: timeoutMs,
			});
		} catch {
			throw new Error(
				`[waitForServiceWorker] Service Worker for ${url} did not register within ${timeoutMs}ms.`,
			);
		}
	}

	if (!worker) {
		throw new Error(
			"[waitForServiceWorker] Logic error: SW was neither found nor registered.",
		);
	}

	// --- 2. Poll until the worker reaches the desired state ---
	console.log(
		`[waitForServiceWorker] SW found at ${worker.url()}. Polling for state: '${desiredState}'...`,
	);
	let currentState = "unknown";

	while (currentState !== desiredState) {
		const elapsed = Date.now() - startTime;
		if (elapsed > timeoutMs) {
			throw new Error(
				`[waitForServiceWorker] SW failed to reach state '${desiredState}' within ${timeoutMs}ms. ` +
					`Final state: '${currentState}'`,
			);
		}

		try {
			// Evaluate in the SW's own context to read registration.active.state
			currentState = await worker.evaluate(() => {
				// biome-ignore lint/suspicious/noExplicitAny: SW global does not have typed registration yet
				return (self as any).registration.active?.state ?? "unknown";
			});
		} catch {
			currentState = "unknown";
		}

		if (currentState !== desiredState) {
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
		}
	}

	console.log(`[waitForServiceWorker] SW is now '${desiredState}'.`);
	return worker;
}
