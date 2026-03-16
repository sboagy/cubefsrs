/**
 * catalog-seeder.ts
 *
 * Checks whether the local SQLite DB has been seeded with the global catalog.
 * Actual seeding is done by triggering a forceFullSyncDown via the SyncService,
 * which pulls the catalog from Supabase into SQLite through the worker.
 */

import { count, isNull } from "drizzle-orm";
import type { SqliteDatabase } from "@/lib/db/client-sqlite";
import { schema } from "@/lib/db/client-sqlite";

/** Returns true if this is an empty (first-run) DB that needs seeding. */
export async function needsCatalogSeed(db: SqliteDatabase): Promise<boolean> {
	const rows = await db
		.select({ n: count() })
		.from(schema.algCategory)
		.where(isNull(schema.algCategory.userId));
	return (rows[0]?.n ?? 0) === 0;
}
