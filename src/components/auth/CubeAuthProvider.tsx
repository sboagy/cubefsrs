import { AuthProvider, type LocalDatabase } from "@rhizome/core";
import { createSignal, type ParentComponent } from "solid-js";
import { needsCatalogSeed } from "@/lib/db/catalog-seeder";
import { closeDb, getDb, initializeDb } from "@/lib/db/client-sqlite";
import { setCurrentUserId, setDbReady } from "@/lib/db/db-state";
import { migrateLocalStorageToSqlite } from "@/lib/db/localStorage-migration";
import {
	loadAlgsFromDb,
	loadFsrsFromDb,
	loadPracticeFromDb,
	loadUserSettingsFromDb,
} from "@/lib/db/store-loaders";
import { SyncService } from "@/lib/sync";
import { getSupabaseClient } from "@/services/supabase";
import { algs } from "@/stores/algs";

// Holds the stop function for the current sync session; cleared on sign-out.
let stopSync: (() => void) | null = null;
// The SyncService instance for the current session; used by forceSyncDown/forceSyncUp.
let syncService: SyncService | null = null;
// Tracks the user ID for the currently-running sync session so that a
// duplicate onSignIn call (getSession() races with onAuthStateChange) is
// detected and silently no-ops instead of creating a second SyncEngine.
let syncSessionUserId: string | null = null;

/**
 * App-level auth provider for CubeFSRS.
 *
 * Thin wrapper over rhizome's AuthProvider that wires up the SQLite DB
 * lifecycle on sign-in / sign-out.
 */
const CubeAuthProvider: ParentComponent = (props) => {
	const client = getSupabaseClient();

	// Reactive sync state — passed to AuthProvider so shared components
	// (DbStatusDropdown, DatabaseBrowser) can read/invoke them via useAuth().
	const [localDb, setLocalDb] = createSignal<LocalDatabase | null>(null);
	const [lastSyncTimestamp, setLastSyncTimestamp] = createSignal<string | null>(
		null,
	);
	const [lastSyncMode, setLastSyncMode] = createSignal<
		"full" | "incremental" | null
	>(null);

	/** Delegate force sync-down to the module-level SyncService instance. */
	const forceSyncDown = async (opts?: { full?: boolean }) => {
		if (!syncService) return;
		if (opts?.full) {
			await syncService.forceFullSyncDown();
		} else {
			await syncService.syncDown();
		}
		const ts = syncService.getLastSyncDownTimestamp();
		if (ts) setLastSyncTimestamp(ts);
		setLastSyncMode(syncService.getLastSyncMode());
	};

	/** Delegate force sync-up to the module-level SyncService instance. */
	const forceSyncUp = async (opts?: { allowDeletes?: boolean }) => {
		if (!syncService) return;
		await syncService.syncUp(opts);
	};

	if (!client) {
		// Supabase not configured — render without auth (offline / dev mode)
		return <>{props.children}</>;
	}

	return (
		<AuthProvider
			supabaseClient={client}
			onSignIn={async (user) => {
				// Guard against duplicate onSignIn calls for the same user.
				// Supabase fires both getSession() and onAuthStateChange(SIGNED_IN)
				// near-simultaneously on page load; the second call must be a no-op
				// to avoid creating an orphaned SyncEngine whose timers later run
				// against a closed sql.js database and produce "out of memory" errors.
				//
				// We check syncSessionUserId ONLY (not stopSync) because both calls
				// can arrive before startSyncWorker returns and sets stopSync. The
				// assignment below is synchronous and runs before the first await, so
				// any second concurrent call will see syncSessionUserId already set.
				if (syncSessionUserId === user.id) {
					return;
				}

				// Stop any previous sync session (different user or leftover timers).
				stopSync?.();
				stopSync = null;
				syncSessionUserId = user.id;

				try {
					// 1. Initialise per-user SQLite DB (runs migrations if needed)
					await initializeDb(user.id);
					setCurrentUserId(user.id);

					const db = getDb();
					if (!db) return;

					// 2. Create sync service (don't start auto-sync yet) so we can use it
					//    to seed SQLite on first run before loading stores.
					const svc = new SyncService(db, {
						supabase: client,
						userId: user.id,
						syncIntervalMs: 5000,
						realtimeEnabled: false,
						onSyncComplete: (result) => {
							if (result.errors.length > 0) {
								console.warn(
									"[CubeAuthProvider] sync errors:",
									result.errors,
								);
							}
							// Update timestamp signals so DbStatusDropdown reflects latest state
							if (syncService) {
								const ts = syncService.getLastSyncDownTimestamp();
								if (ts) setLastSyncTimestamp(ts);
								setLastSyncMode(syncService.getLastSyncMode());
							}
						},
					});
					// Store references early so onSyncComplete can read timestamps.
					syncService = svc;
					stopSync = () => svc.stopAutoSync();

					// 3. On first-run empty DB, pull the global catalog from Supabase into
					//    SQLite via the worker before loading the stores.  Data always flows
					//    Supabase → worker → SQLite → stores (never from a bundled JSON file).
					if (await needsCatalogSeed(db)) {
						await svc.forceFullSyncDown();
					}

					// 4. Load data from SQLite into the Solid stores
					await loadAlgsFromDb(db, user.id);
					await loadFsrsFromDb(db, user.id);
					await loadPracticeFromDb(db, user.id);
					await loadUserSettingsFromDb(db, user.id);

					// 5. Build nameToDbId from the in-memory cases loadAlgsFromDb just populated.
					const nameToDbId = new Map<string, string>();
					for (const [name, c] of Object.entries(algs.cases)) {
						if (c.dbId) nameToDbId.set(name, c.dbId);
					}

					// 6. One-time migration from legacy localStorage keys → SQLite
					await migrateLocalStorageToSqlite(db, user.id, nameToDbId);

					setDbReady(true);

					// 7. Start periodic background sync (initial syncDown fires internally).
					svc.startAutoSync();
					// Cast: SqliteDatabase satisfies LocalDatabase's all<T>() interface.
					setLocalDb(db as unknown as LocalDatabase);
				} catch (err) {
					console.error("[CubeAuthProvider] onSignIn DB init failed:", err);
				}
			}}
			onSignOut={async () => {
				// Stop background sync before tearing down the DB
				stopSync?.();
				stopSync = null;
				syncService = null;
				syncSessionUserId = null;

				// Clear reactive sync state
				setLocalDb(null);
				setLastSyncTimestamp(null);
				setLastSyncMode(null);

				setDbReady(false);
				setCurrentUserId(null);
				try {
					closeDb();
				} catch (err) {
					console.error("[CubeAuthProvider] onSignOut closeDb failed:", err);
				}
			}}
			syncState={{
				localDb,
				forceSyncDown,
				forceSyncUp,
				lastSyncTimestamp,
				lastSyncMode,
			}}
		>
			{props.children}
		</AuthProvider>
	);
};

export default CubeAuthProvider;
