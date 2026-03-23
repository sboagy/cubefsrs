/**
 * e2e-test-api.ts
 *
 * Exposes `window.__cfTestApi` when the app runs in test mode
 * (`import.meta.env.MODE === 'test'`).
 *
 * This is the *only* supported E2E mutation boundary for browser-local
 * SQLite WASM state in CubeFSRS.
 *
 * IMPORTANT: All setup writes go through the local-only wrapper which:
 *   1. Pauses auto-sync
 *   2. Waits for any in-flight sync to idle
 *   3. Disables SQLite triggers via the oosync runtime API (so writes don't
 *      populate sync_push_queue)
 *   4. Executes the writes
 *   5. Re-enables triggers (always, even on error)
 *   6. Clears sync_push_queue (defensive)
 *   7. Persists the SQLite WASM DB to IndexedDB
 *   8. Rehydrates all Solid stores from SQLite so the UI reflects seeded state
 *
 * Sync tests use explicit control methods (pauseAutoSync / resumeAutoSync /
 * forceSyncUp / waitForSyncIdle / getSyncOutboxCount) rather than relying on
 * ambient auto-sync timing.
 */

// getSyncRuntime is available after ensureSyncRuntimeConfigured() runs (wired
// in src/lib/sync/index.ts via the runtime-config side-effect import).
import { getSyncRuntime } from "@oosync/sync";
import { and, count, eq, inArray, lte } from "drizzle-orm";
import type { SqliteDatabase } from "@/lib/db/client-sqlite";
import { persistDb, schema } from "@/lib/db/client-sqlite";
import {
	loadAlgsFromDb,
	loadFsrsFromDb,
	loadPracticeFromDb,
	loadUserSettingsFromDb,
} from "@/lib/db/store-loaders";
import { setPractice } from "@/stores/practice";
import { ensureSyncRuntimeConfigured, type SyncService } from "@/lib/sync";

// ---------------------------------------------------------------------------
// Public interface exposed as window.__cfTestApi
// ---------------------------------------------------------------------------

export interface CfTestApi {
	/**
	 * Dispose: closes the active sql.js DB handles. Call before deleting
	 * IndexedDB to avoid "database is locked" errors.
	 */
	dispose(): void;

	/**
	 * Reload all Solid stores from SQLite so the UI immediately reflects
	 * any state changes made through this API.
	 */
	rehydrateStores(): Promise<void>;

	/**
	 * Seed `user_alg_selection` rows for the current user without touching
	 * `sync_push_queue`. Calls `rehydrateStores()` before returning.
	 */
	seedAlgSelection(opts: { caseIds: string[] }): Promise<void>;

	/**
	 * Seed an `fsrs_card_state` row. `dueOffsetDays` sets the due date
	 * relative to now (negative = overdue, 0 = due today, positive = future).
	 * Calls `rehydrateStores()` before returning.
	 */
	seedFsrsCardState(opts: {
		caseId: string;
		dueOffsetDays: number;
		reps?: number;
		state?: number;
	}): Promise<void>;

	/**
	 * Delete all user-owned rows for the current user across every mutable
	 * table. Calls `rehydrateStores()` before returning.
	 */
	clearUserData(): Promise<void>;

	/** Pause the background auto-sync loop. */
	pauseAutoSync(): void;

	/** Resume the background auto-sync loop. */
	resumeAutoSync(): void;

	/**
	 * Explicitly trigger a sync-up (push local outbox to the worker).
	 * Use in sync tests instead of relying on the periodic timer.
	 */
	forceSyncUp(): Promise<void>;

	/**
	 * Wait until no sync operation is in progress. Polls at 100 ms intervals.
	 */
	waitForSyncIdle(timeoutMs?: number): Promise<void>;

	/**
	 * Return the number of rows in `sync_push_queue` with status
	 * 'pending' or 'in_progress'.
	 */
	getSyncOutboxCount(): Promise<number>;

	/** Return the number of due FSRS cards in the current queue. */
	getPracticeQueueCount(): Promise<number>;

	/** Return the number of catalog cases currently loaded into local SQLite. */
	getCatalogCaseCount(): Promise<number>;

	/** Return true when all requested catalog case IDs exist in local SQLite. */
	hasCatalogCases(caseIds: string[]): Promise<boolean>;

	/** Return the `caseId` values currently in `user_alg_selection`. */
	getSelectedCaseIds(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Controls interface — constructed by CubeAuthProvider and passed here
// ---------------------------------------------------------------------------

export interface CfTestApiControls {
	db: SqliteDatabase;
	userId: string;
	syncService: SyncService;
}

// ---------------------------------------------------------------------------
// Local-only write wrapper
//
// Wraps any setup mutations with trigger suppression + outbox cleanup so that
// test setup writes never appear in sync_push_queue.
// ---------------------------------------------------------------------------

/**
 * Execute `writeFn` with SQLite sync triggers suppressed so that no rows are
 * written to sync_push_queue during test seeding.
 *
 * Steps:
 *   1. Stop auto-sync loop and wait for any in-flight sync to idle.
 *   2. Suppress triggers via getSyncRuntime().suppressSyncTriggers().
 *   3. Execute writes.
 *   4. Always re-enable triggers afterwards (even on error).
 *   5. Defensively delete any residual sync_push_queue rows.
 *   6. Persist the DB to IndexedDB.
 */
async function withLocalOnlyWrites(
	db: SqliteDatabase,
	syncService: SyncService,
	writeFn: () => Promise<void>,
): Promise<void> {
	// 1. Pause the auto-sync loop so it doesn't interfere mid-write.
	syncService.stopAutoSync();

	// 2. Wait for any in-flight sync to finish.
	const IDLE_TIMEOUT_MS = 15_000;
	const start = Date.now();
	while (syncService.syncing) {
		if (Date.now() - start > IDLE_TIMEOUT_MS) {
			throw new Error(
				"[cfTestApi] Timed out waiting for sync to become idle before local-only write",
			);
		}
		await new Promise((r) => setTimeout(r, 100));
	}

	// 3. Get the raw sql.js Database instance and suppress sync triggers.
	//    suppressSyncTriggers / enableSyncTriggers are the stable oosync API
	//    for this; they handle all mutable-table triggers without us needing to
	//    hard-code trigger names or query sqlite_master manually.
	const runtime = getSyncRuntime();
	const rawDb = await runtime.getSqliteInstance();
	if (!rawDb) throw new Error("[cfTestApi] No SQLite instance available");
	runtime.suppressSyncTriggers(rawDb);

	try {
		// 4. Execute the setup writes.
		await writeFn();
	} finally {
		// 5. Re-enable triggers — always, even if writeFn threw.
		runtime.enableSyncTriggers(rawDb);
	}

	// 6. Clear any residual sync_push_queue rows defensively.
	await db.delete(schema.syncPushQueue);

	// 7. Persist the DB to IndexedDB.
	await persistDb();
}

// ---------------------------------------------------------------------------
// attachCfTestApi — called by CubeAuthProvider after DB init, test mode only
// ---------------------------------------------------------------------------

export function attachCfTestApi(controls: CfTestApiControls): void {
	const { db, userId, syncService } = controls;

	const resetTransientPracticeState = () => {
		setPractice("currentId", null);
		setPractice("running", false);
		setPractice("startAt", null);
		setPractice("history", []);
		setPractice("historyIndex", -1);
	};

	const rehydrateStores = async () => {
		await loadAlgsFromDb(db, userId);
		await loadFsrsFromDb(db, userId);
		await loadPracticeFromDb(db, userId);
		await loadUserSettingsFromDb(db, userId);
	};

	const api: CfTestApi = {
		dispose() {
			// closeDb is already called by CubeAuthProvider on sign-out;
			// this is a no-op hook for the fixture to call without needing
			// to know the internal DB lifecycle.
		},

		async rehydrateStores() {
			await rehydrateStores();
		},

		async seedAlgSelection({ caseIds }) {
			await withLocalOnlyWrites(db, syncService, async () => {
				// Delete existing selections first so seeding is idempotent.
				await db
					.delete(schema.userAlgSelection)
					.where(eq(schema.userAlgSelection.userId, userId));

				if (caseIds.length > 0) {
					await db.insert(schema.userAlgSelection).values(
						caseIds.map((caseId) => ({
							userId,
							caseId,
						})),
					);
				}
			});
			await rehydrateStores();
		},

		async seedFsrsCardState({ caseId, dueOffsetDays, reps = 0, state = 0 }) {
			// due column is integer (Unix ms), matching the store's Date.now() comparisons
			const dueDate = Date.now() + dueOffsetDays * 24 * 60 * 60 * 1000;

			await withLocalOnlyWrites(db, syncService, async () => {
				await db
					.insert(schema.fsrsCardState)
					.values({
						userId,
						caseId,
						due: dueDate,
						stability: 1.0,
						difficulty: 5.0,
						elapsedDays: 0,
						scheduledDays: Math.max(0, dueOffsetDays),
						reps,
						lapses: 0,
						state,
						lastReview: null,
						updatedAt: new Date().toISOString(),
					})
					.onConflictDoUpdate({
						target: [schema.fsrsCardState.userId, schema.fsrsCardState.caseId],
						set: {
							due: dueDate,
							reps,
							state,
							updatedAt: new Date().toISOString(),
						},
					});
			});
			await rehydrateStores();
		},

		async clearUserData() {
			await withLocalOnlyWrites(db, syncService, async () => {
				await db
					.delete(schema.practiceTimeEntry)
					.where(eq(schema.practiceTimeEntry.userId, userId));
				await db
					.delete(schema.userAlgSelection)
					.where(eq(schema.userAlgSelection.userId, userId));
				await db
					.delete(schema.fsrsCardState)
					.where(eq(schema.fsrsCardState.userId, userId));
				await db
					.delete(schema.userAlgAnnotation)
					.where(eq(schema.userAlgAnnotation.userId, userId));
				await db
					.delete(schema.userSettings)
					.where(eq(schema.userSettings.userId, userId));
			});
			await rehydrateStores();
			resetTransientPracticeState();
		},

		pauseAutoSync() {
			syncService.stopAutoSync();
		},

		resumeAutoSync() {
			syncService.startAutoSync();
		},

		async forceSyncUp() {
			// Reassert runtime wiring before entering the oosync engine. In dev/test,
			// Vite can load the E2E API and sync engine through different module
			// identities unless we explicitly configure the shared runtime here.
			ensureSyncRuntimeConfigured();
			await syncService.syncUp();
		},

		async waitForSyncIdle(timeoutMs = 15_000) {
			const deadline = Date.now() + timeoutMs;
			while (syncService.syncing) {
				if (Date.now() > deadline) {
					throw new Error(
						`[cfTestApi] waitForSyncIdle timed out after ${timeoutMs} ms`,
					);
				}
				await new Promise((r) => setTimeout(r, 100));
			}
		},

		async getSyncOutboxCount() {
			const result = await db
				.select({ cnt: count() })
				.from(schema.syncPushQueue)
				.where(
					inArray(schema.syncPushQueue.status, ["pending", "in_progress"]),
				);
			return result[0]?.cnt ?? 0;
		},

		async getPracticeQueueCount() {
			// due column is integer (Unix ms)
			const now = Date.now();
			const result = await db
				.select({ cnt: count() })
				.from(schema.fsrsCardState)
				.where(
					and(
						eq(schema.fsrsCardState.userId, userId),
						lte(schema.fsrsCardState.due, now),
					),
				);
			return result[0]?.cnt ?? 0;
		},

		async getCatalogCaseCount() {
			const result = await db.select({ cnt: count() }).from(schema.algCase);
			return result[0]?.cnt ?? 0;
		},

		async hasCatalogCases(caseIds) {
			if (caseIds.length === 0) return true;
			const rows = await db
				.select({ id: schema.algCase.id })
				.from(schema.algCase)
				.where(inArray(schema.algCase.id, caseIds));
			return rows.length === new Set(caseIds).size;
		},

		async getSelectedCaseIds() {
			const rows = await db
				.select({ caseId: schema.userAlgSelection.caseId })
				.from(schema.userAlgSelection)
				.where(eq(schema.userAlgSelection.userId, userId));
			return rows.map((r) => r.caseId);
		},
	};

	// Attach to window
	(window as unknown as Record<string, unknown>).__cfTestApi = api;
	console.log("[cfTestApi] attached for user", userId);
}
