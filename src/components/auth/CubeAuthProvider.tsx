import { AuthProvider } from "@rhizome/core";
import type { ParentComponent } from "solid-js";
import {
	needsCatalogSeed,
	seedCatalogFromDefaults,
} from "@/lib/db/catalog-seeder";
import { closeDb, getDb, initializeDb } from "@/lib/db/client-sqlite";
import { setCurrentUserId, setDbReady } from "@/lib/db/db-state";
import { migrateLocalStorageToSqlite } from "@/lib/db/localStorage-migration";
import {
	loadAlgsFromDb,
	loadFsrsFromDb,
	loadPracticeFromDb,
	loadUserSettingsFromDb,
} from "@/lib/db/store-loaders";
import { getSupabaseClient } from "@/services/supabase";
import { algs } from "@/stores/algs";

/**
 * App-level auth provider for CubeFSRS.
 *
 * Thin wrapper over rhizome's AuthProvider that wires up the SQLite DB
 * lifecycle on sign-in / sign-out.
 */
const CubeAuthProvider: ParentComponent = (props) => {
	const client = getSupabaseClient();

	if (!client) {
		// Supabase not configured — render without auth (offline / dev mode)
		return <>{props.children}</>;
	}

	return (
		<AuthProvider
			supabaseClient={client}
			onSignIn={async (user) => {
				try {
					// 1. Initialise per-user SQLite DB (runs migrations if needed)
					await initializeDb(user.id);
					setCurrentUserId(user.id);

					const db = getDb();
					if (!db) return;

					// 2. Seed global catalog if this is a first-run empty DB
					let nameToDbId = new Map<string, string>();
					if (await needsCatalogSeed(db)) {
						nameToDbId = await seedCatalogFromDefaults(db);
					}

					// 3. Load data from SQLite into the Solid stores
					await loadAlgsFromDb(db, user.id);
					await loadFsrsFromDb(db, user.id);
					await loadPracticeFromDb(db, user.id);
					await loadUserSettingsFromDb(db, user.id);

					// 4. If nameToDbId is empty (catalog was already seeded), build it from the
					//    in-memory cases that loadAlgsFromDb just populated.
					if (nameToDbId.size === 0) {
						for (const [name, c] of Object.entries(algs.cases)) {
							if (c.dbId) nameToDbId.set(name, c.dbId);
						}
					}

					// 5. One-time migration from legacy localStorage keys → SQLite
					await migrateLocalStorageToSqlite(db, user.id, nameToDbId);

					setDbReady(true);
				} catch (err) {
					console.error("[CubeAuthProvider] onSignIn DB init failed:", err);
				}
			}}
			onSignOut={async () => {
				setDbReady(false);
				setCurrentUserId(null);
				try {
					closeDb();
				} catch (err) {
					console.error("[CubeAuthProvider] onSignOut closeDb failed:", err);
				}
			}}
		>
			{props.children}
		</AuthProvider>
	);
};

export default CubeAuthProvider;
