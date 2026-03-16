/**
 * store-loaders.ts
 *
 * Reads the per-user data from local SQLite and pushes it into the Solid stores.
 * Called once in onSignIn (after initializeDb + optional catalog seed).
 */

import { eq, isNull, or } from "drizzle-orm";
import type { SqliteDatabase } from "@/lib/db/client-sqlite";
import { schema } from "@/lib/db/client-sqlite";
import type { FSRSState, FsrsUserParams } from "@/services/scheduler/fsrs";
import { getFsrsConfig } from "@/services/scheduler/fsrs";
import { setAlgs } from "@/stores/algs";
import { setFsrs } from "@/stores/fsrs";
import { setPractice } from "@/stores/practice";
import type { AlgCase, AlgCategory } from "@/types/algs";

// Valid values for the practice order mode (mirrors PracticeState["orderMode"])
type OrderMode = "sequential" | "random" | "fsrs";
/**
 * Load the full catalog + user selections + annotations from SQLite into
 * the algs store.
 */
export async function loadAlgsFromDb(
	db: SqliteDatabase,
	userId: string,
): Promise<void> {
	// --- Load categories (global + user-owned) ---
	const dbCats = await db
		.select()
		.from(schema.algCategory)
		.where(
			or(
				isNull(schema.algCategory.userId),
				eq(schema.algCategory.userId, userId),
			),
		)
		.orderBy(schema.algCategory.sortOrder);

	// --- Load subsets ---
	const dbSubsets = await db
		.select()
		.from(schema.algSubset)
		.where(
			or(isNull(schema.algSubset.userId), eq(schema.algSubset.userId, userId)),
		)
		.orderBy(schema.algSubset.sortOrder);

	// --- Load cases ---
	const dbCases = await db
		.select()
		.from(schema.algCase)
		.where(or(isNull(schema.algCase.userId), eq(schema.algCase.userId, userId)))
		.orderBy(schema.algCase.sortOrder);

	// --- Load user annotations ---
	const dbAnnotations = await db
		.select()
		.from(schema.userAlgAnnotation)
		.where(eq(schema.userAlgAnnotation.userId, userId));
	const annotByCase = new Map(dbAnnotations.map((a) => [a.caseId, a]));

	// --- Load user selections ---
	const dbSelections = await db
		.select({ caseId: schema.userAlgSelection.caseId })
		.from(schema.userAlgSelection)
		.where(eq(schema.userAlgSelection.userId, userId));
	const selectedDbIds = new Set(dbSelections.map((s) => s.caseId));

	// --- Build in-memory AlgCase record (keyed by case.name for backward compat) ---
	const cases: Record<string, AlgCase> = {};
	for (const c of dbCases) {
		const annotation = annotByCase.get(c.id);
		cases[c.name] = {
			id: c.name, // in-memory id = human-readable name
			dbId: c.id, // UUID for DB writes
			name: c.name,
			alg: c.alg,
			recognition: annotation?.recognition ?? undefined,
			mnemonic: annotation?.mnemonic ?? undefined,
			notes: annotation?.notes ?? undefined,
		} as AlgCase;
	}

	// --- Build subset → caseIds map ---
	const subsetCases = new Map<string, string[]>();
	for (const c of dbCases) {
		const arr = subsetCases.get(c.subsetId) ?? [];
		arr.push(c.name);
		subsetCases.set(c.subsetId, arr);
	}

	// --- Build category → subsets map ---
	const catSubsets = new Map<string, typeof dbSubsets>();
	for (const s of dbSubsets) {
		const arr = catSubsets.get(s.categoryId) ?? [];
		arr.push(s);
		catSubsets.set(s.categoryId, arr);
	}

	// --- Build AlgCatalog ---
	const categories: AlgCategory[] = dbCats.map((cat) => {
		const subs = catSubsets.get(cat.id) ?? [];
		return {
			name: cat.name,
			subsets: subs.map((s) => ({
				name: s.name,
				caseIds: subsetCases.get(s.id) ?? [],
			})),
		};
	});

	if (categories.length === 0) {
		// DB has no catalog yet (sync hasn't completed) — leave stores empty.
		// The first forceFullSyncDown in onSignIn will populate SQLite and
		// a follow-up loadAlgsFromDb call will fill the stores.
		console.warn(
			"[store-loaders] loadAlgsFromDb: catalog is empty; sync may not have completed yet",
		);
		return;
	}

	// --- selectedIds: map DB UUIDs back to in-memory names ---
	const dbIdToName = new Map(dbCases.map((c) => [c.id, c.name]));
	const selectedIds = Array.from(selectedDbIds)
		.map((dbId) => dbIdToName.get(dbId))
		.filter((n): n is string => Boolean(n));

	setAlgs("catalog", { categories });
	setAlgs("cases", cases);
	setAlgs("selectedIds", selectedIds);
}

/**
 * Load per-user FSRS card states from SQLite into the fsrs store.
 */
export async function loadFsrsFromDb(
	db: SqliteDatabase,
	userId: string,
): Promise<void> {
	// Load user settings for FSRS params
	const settingsRows = await db
		.select({ fsrsParams: schema.userSettings.fsrsParams })
		.from(schema.userSettings)
		.where(eq(schema.userSettings.userId, userId))
		.limit(1);
	const rawParams = settingsRows[0]?.fsrsParams;
	const params: FsrsUserParams = rawParams
		? (JSON.parse(rawParams) as FsrsUserParams)
		: getFsrsConfig();

	// Load case name lookup (UUID → name) for keying states by name
	const casesRows = await db
		.select({ id: schema.algCase.id, name: schema.algCase.name })
		.from(schema.algCase);
	const dbIdToName = new Map(casesRows.map((c) => [c.id, c.name]));

	// Load FSRS card states
	const cardRows = await db
		.select()
		.from(schema.fsrsCardState)
		.where(eq(schema.fsrsCardState.userId, userId));

	const states: Record<string, FSRSState> = {};
	for (const row of cardRows) {
		const name = dbIdToName.get(row.caseId);
		if (!name) continue;
		states[name] = {
			due: row.due,
			stability: row.stability ?? 0,
			difficulty: row.difficulty ?? 0,
			reps: row.reps ?? 0,
			lapses: row.lapses ?? 0,
			lastReview: row.lastReview ?? 0,
		} as FSRSState;
	}

	setFsrs("params", params);
	setFsrs("states", states);
}

/**
 * Load per-user practice time entries and settings from SQLite into the
 * practice store.
 */
export async function loadPracticeFromDb(
	db: SqliteDatabase,
	userId: string,
): Promise<void> {
	// Load case name lookup
	const casesRows = await db
		.select({ id: schema.algCase.id, name: schema.algCase.name })
		.from(schema.algCase);
	const dbIdToName = new Map(casesRows.map((c) => [c.id, c.name]));

	// Load practice time entries, most recent first
	const timeRows = await db
		.select()
		.from(schema.practiceTimeEntry)
		.where(eq(schema.practiceTimeEntry.userId, userId));

	type TimeEntry = { id: string; ms: number; at: number };
	const timesById: Record<string, TimeEntry[]> = {};
	for (const row of timeRows) {
		const name = dbIdToName.get(row.caseId);
		if (!name) continue;
		const arr = timesById[name] ?? [];
		arr.push({
			id: String(row.id),
			ms: row.ms,
			at: Date.parse(row.reviewedAt ?? new Date().toISOString()),
		});
		timesById[name] = arr;
	}
	// Sort each case's times descending (most recent first, cap at 100)
	for (const key of Object.keys(timesById)) {
		timesById[key] = (timesById[key] ?? [])
			.sort((a, b) => b.at - a.at)
			.slice(0, 100);
	}

	// Load order mode from user_settings
	const settingsRows = await db
		.select({ orderMode: schema.userSettings.orderMode })
		.from(schema.userSettings)
		.where(eq(schema.userSettings.userId, userId))
		.limit(1);
	const orderModeRaw = settingsRows[0]?.orderMode ?? "fsrs";
	const orderMode =
		orderModeRaw === "sequential" ||
		orderModeRaw === "random" ||
		orderModeRaw === "fsrs"
			? (orderModeRaw as "sequential" | "random" | "fsrs")
			: "fsrs";

	setPractice("timesById", timesById);
	setPractice("orderMode", orderMode);
}

/**
 * Load the current category selection and current case ID from user_settings.
 */
export async function loadUserSettingsFromDb(
	db: SqliteDatabase,
	userId: string,
): Promise<void> {
	const settingsRows = await db
		.select()
		.from(schema.userSettings)
		.where(eq(schema.userSettings.userId, userId))
		.limit(1);
	if (!settingsRows[0]) return;

	const row = settingsRows[0];

	// Load lib_options into algs store
	if (row.libOptions) {
		try {
			const opts = JSON.parse(row.libOptions) as {
				randomAUF?: boolean;
				randomOrder?: boolean;
				slowFirst?: boolean;
				prioritizeFailed?: boolean;
			};
			setAlgs("options", {
				randomAUF: opts.randomAUF ?? false,
				randomOrder: opts.randomOrder ?? false,
				slowFirst: opts.slowFirst ?? false,
				prioritizeFailed: opts.prioritizeFailed ?? false,
			});
		} catch {}
	}

	// Load current category by looking up the category UUID → name
	if (row.currentCategoryId) {
		const catRows = await db
			.select({ name: schema.algCategory.name })
			.from(schema.algCategory)
			.where(eq(schema.algCategory.id, row.currentCategoryId))
			.limit(1);
		if (catRows[0]?.name) {
			setAlgs("currentCategory", catRows[0].name);
		}
	}

	// Load practice order mode
	if (row.orderMode) {
		const mode = row.orderMode as string;
		if (mode === "sequential" || mode === "random" || mode === "fsrs") {
			setPractice("orderMode", mode as OrderMode);
		}
	}
}
