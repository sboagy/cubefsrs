/**
 * e2e/helpers/local-db-lifecycle.ts
 *
 * Helpers for managing the CubeFSRS client-side SQLite WASM database
 * (persisted in IndexedDB `cubefsrs-storage`) during E2E tests.
 *
 * Mirrors TuneTrees' `local-db-lifecycle.ts` adapted for CubeFSRS:
 * - Different IndexedDB name: `cubefsrs-storage`
 * - Different localStorage key prefixes: `CF_LAST_SYNC_TIMESTAMP`
 * - Origin: http://localhost:5174
 */

import type { Page } from "@playwright/test";
import { BASE_URL } from "../test-config";

/**
 * Navigate to the CubeFSRS origin without loading the SPA.
 * This unloads the SPA so IndexedDB connections can be cleanly closed before
 * deletion.
 */
export async function gotoCfOrigin(page: Page): Promise<void> {
	await page.goto(`${BASE_URL}/e2e-origin.html`, {
		waitUntil: "domcontentloaded",
	});
}

/**
 * Clear all CubeFSRS client-side storage (IndexedDB, localStorage, sessionStorage).
 *
 * Options:
 * - `preserveAuth` (default: true) — keep Supabase auth tokens in localStorage
 *   so the worker-scoped user session remains valid across tests
 * - `deleteAllIndexedDbs` (default: false) — delete every IndexedDB in origin
 *   rather than just `cubefsrs-storage`; used in full-reset scenarios
 */
export async function clearCubefsrsClientStorage(
	page: Page,
	opts: {
		preserveAuth?: boolean;
		deleteAllIndexedDbs?: boolean;
	} = {},
): Promise<void> {
	await page.evaluate(async (options) => {
		const preserveAuth = options.preserveAuth ?? true;
		const deleteAllIndexedDbs = options.deleteAllIndexedDbs ?? false;

		(window as unknown as Record<string, unknown>).__cfE2eIsClearing = true;

		try {
			// 1) sessionStorage — always safe to clear.
			try {
				sessionStorage.clear();
			} catch (err) {
				console.warn("[E2ECleanup] Failed to clear sessionStorage:", err);
			}

			// 2) localStorage — preserve Supabase auth tokens by default.
			try {
				if (!preserveAuth) {
					localStorage.clear();
				} else {
					// Remove sync-state keys that can cause stale incremental syncs.
					const keysToRemove: string[] = [];
					for (let i = 0; i < localStorage.length; i++) {
						const key = localStorage.key(i);
						if (key?.startsWith("CF_LAST_SYNC_TIMESTAMP")) {
							keysToRemove.push(key);
						}
					}
					for (const key of keysToRemove) {
						localStorage.removeItem(key);
					}
				}
			} catch (err) {
				console.warn("[E2ECleanup] Failed to clear localStorage:", err);
			}

			// 3) CacheStorage (service worker / workbox caches).
			if (typeof caches !== "undefined") {
				try {
					const cacheNames = await caches.keys();
					const toDelete = cacheNames.filter(
						(n) => !n.startsWith("workbox-precache-"),
					);
					await Promise.all(toDelete.map((n) => caches.delete(n)));
				} catch (err) {
					console.warn("[E2ECleanup] Failed to clear CacheStorage:", err);
				}
			}

			// 4) IndexedDB — delete `cubefsrs-storage` with exponential-backoff retry.
			const deleteDbWithRetry = async (dbName: string): Promise<void> => {
				await new Promise<void>((resolve, reject) => {
					const maxAttempts = 5;
					let attempt = 0;

					function tryDelete() {
						attempt++;
						const req = indexedDB.deleteDatabase(dbName);

						req.onsuccess = () => resolve();

						req.onerror = () => {
							if (attempt < maxAttempts) {
								const delay = 200 * attempt;
								console.warn(
									`[E2ECleanup] IndexedDB delete error, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`,
									req.error,
								);
								setTimeout(tryDelete, delay);
							} else {
								const msg = `[E2ECleanup] IndexedDB delete failed after ${maxAttempts} attempts: ${req.error}`;
								console.error(msg);
								reject(new Error(msg));
							}
						};

						req.onblocked = () => {
							if (attempt < maxAttempts) {
								const delay = 500 * attempt;
								console.warn(
									`[E2ECleanup] IndexedDB delete blocked, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`,
								);
								setTimeout(tryDelete, delay);
							} else {
								const msg = `[E2ECleanup] IndexedDB delete blocked after ${maxAttempts} attempts`;
								console.error(msg);
								reject(new Error(msg));
							}
						};
					}

					tryDelete();
				});
			};

			if (deleteAllIndexedDbs && typeof indexedDB.databases === "function") {
				try {
					const dbs = await indexedDB.databases();
					const names = dbs.map((d) => d.name).filter((n): n is string => !!n);
					await Promise.all(names.map((n) => deleteDbWithRetry(n)));
				} catch (err) {
					console.warn(
						"[E2ECleanup] Failed to enumerate IndexedDB databases; falling back to cubefsrs-storage:",
						err,
					);
					await deleteDbWithRetry("cubefsrs-storage");
				}
			} else {
				await deleteDbWithRetry("cubefsrs-storage");
			}

			// 5) Clear in-memory test hook (best-effort).
			try {
				delete (window as unknown as Record<string, unknown>).__cfTestApi;
			} catch {
				/* ignore */
			}
		} finally {
			(window as unknown as Record<string, unknown>).__cfE2eIsClearing = false;
		}
	}, opts);
}
