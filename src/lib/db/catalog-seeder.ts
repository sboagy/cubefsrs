/**
 * catalog-seeder.ts
 *
 * Seeds the local SQLite DB with the global algorithm catalog (alg_category,
 * alg_subset, alg_case) from defaultAlgs.json on first run (offline bootstrap).
 *
 * Global catalog rows use userId = null (matching the Postgres convention where
 * NULL means "shared / admin-seeded").
 *
 * This runs inside the onSignIn lifecycle hook (after initializeDb) whenever the
 * DB has no alg_category rows.
 */

import { count, eq, isNull } from "drizzle-orm";
import defaults from "@/data/defaultAlgs.json";
import type { SqliteDatabase } from "@/lib/db/client-sqlite";
import { schema } from "@/lib/db/client-sqlite";

type DefaultsAlg = {
	name?: string;
	algorithm?: string;
	recognition?: string;
	mnemonic?: string;
	notes?: string;
};

type DefaultsSubset = { subset?: string; algorithms?: DefaultsAlg[] };
type DefaultsRoot = Record<string, DefaultsSubset[]>;

/** Returns true if this is an empty (first-run) DB that needs seeding. */
export async function needsCatalogSeed(db: SqliteDatabase): Promise<boolean> {
	const rows = await db
		.select({ n: count() })
		.from(schema.algCategory)
		.where(isNull(schema.algCategory.userId));
	return (rows[0]?.n ?? 0) === 0;
}

/**
 * Inserts the global catalog into local SQLite.
 *
 * Idempotent — skips rows that already exist via `onConflictDoNothing()`.
 * Returns a slug → UUID map for alg_case so callers can build in-memory
 * references immediately without a follow-up query.
 */
export async function seedCatalogFromDefaults(
	db: SqliteDatabase,
): Promise<Map<string, string>> {
	const data = defaults as unknown as DefaultsRoot;
	const caseSlugToId = new Map<string, string>();

	let catOrder = 0;
	for (const catName of Object.keys(data)) {
		// Insert category
		const catId = crypto.randomUUID();
		const catSlug = slugify(catName);
		await db
			.insert(schema.algCategory)
			.values({
				id: catId,
				slug: catSlug,
				userId: null,
				name: catName,
				sortOrder: catOrder++,
			})
			.onConflictDoNothing();

		// Re-fetch the actual ID (may already exist if called twice)
		const existingCat = await db
			.select({ id: schema.algCategory.id })
			.from(schema.algCategory)
			.where(eq(schema.algCategory.slug, catSlug))
			.limit(1);
		const resolvedCatId = existingCat[0]?.id ?? catId;

		const subsetsRaw: DefaultsSubset[] = Array.isArray(data[catName])
			? (data[catName] as DefaultsSubset[])
			: [];

		let subOrder = 0;
		for (const subset of subsetsRaw) {
			const subName = subset?.subset ?? "";
			if (!subName) continue;
			const subId = crypto.randomUUID();
			const subSlug = slugify(`${catSlug}-${subName}`);
			await db
				.insert(schema.algSubset)
				.values({
					id: subId,
					slug: subSlug,
					categoryId: resolvedCatId,
					userId: null,
					name: subName,
					sortOrder: subOrder++,
				})
				.onConflictDoNothing();

			const existingSub = await db
				.select({ id: schema.algSubset.id })
				.from(schema.algSubset)
				.where(eq(schema.algSubset.slug, subSlug))
				.limit(1);
			const resolvedSubId = existingSub[0]?.id ?? subId;

			const algsArr: DefaultsAlg[] = Array.isArray(subset?.algorithms)
				? (subset.algorithms as DefaultsAlg[])
				: [];

			let caseOrder = 0;
			for (const a of algsArr) {
				const caseName = String(a?.name ?? "").trim();
				if (!caseName) continue;
				const caseSlug = slugify(`${catSlug}-${caseName}`);
				const caseId = crypto.randomUUID();
				await db
					.insert(schema.algCase)
					.values({
						id: caseId,
						slug: caseSlug,
						subsetId: resolvedSubId,
						userId: null,
						name: caseName,
						alg: typeof a?.algorithm === "string" ? a.algorithm : "",
						sortOrder: caseOrder++,
					})
					.onConflictDoNothing();

				// Resolve actual ID (for the slug → uuid map)
				const existingCase = await db
					.select({ id: schema.algCase.id })
					.from(schema.algCase)
					.where(eq(schema.algCase.slug, caseSlug))
					.limit(1);
				const resolvedCaseId = existingCase[0]?.id ?? caseId;
				caseSlugToId.set(caseSlug, resolvedCaseId);
				// Also map by name for backward compat with localStorage keys
				caseSlugToId.set(caseName, resolvedCaseId);
			}
		}
	}

	return caseSlugToId;
}

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}
