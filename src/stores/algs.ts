import { and, eq } from "drizzle-orm";
import { createStore } from "solid-js/store";
import { getDb, schema } from "@/lib/db/client-sqlite";
import { getCurrentUserId } from "@/lib/db/db-state";
import type { AlgCase, AlgCatalog, AlgCategory } from "@/types/algs";

type LibraryOptions = {
	randomAUF: boolean;
	randomOrder: boolean;
	slowFirst: boolean;
	prioritizeFailed: boolean;
};

type AlgsState = {
	catalog: AlgCatalog;
	cases: Record<string, AlgCase>;
	selectedIds: string[];
	currentCategory: string;
	options: LibraryOptions;
};

const [algs, setAlgs] = createStore<AlgsState>({
	catalog: { categories: [] },
	cases: {},
	selectedIds: [],
	currentCategory: "",
	options: {
		randomAUF: false,
		randomOrder: false,
		slowFirst: false,
		prioritizeFailed: false,
	},
});

export { algs, setAlgs };

// Derived helpers (computed equivalents)
export function allCategories() {
	return algs.catalog.categories;
}
export function currentCategoryObj(): AlgCategory | undefined {
	return algs.catalog.categories.find((c) => c.name === algs.currentCategory);
}
export function currentSubsets() {
	return currentCategoryObj()?.subsets ?? [];
}
export function isSelected(id: string) {
	return algs.selectedIds.includes(id);
}

export function setCategory(name: string) {
	setAlgs("currentCategory", name);
	// Persist current category to SQLite
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;
		const catRows = await db
			.select({ id: schema.algCategory.id })
			.from(schema.algCategory)
			.where(eq(schema.algCategory.name, name))
			.limit(1);
		const catId = catRows[0]?.id;
		await db
			.insert(schema.userSettings)
			.values({ userId, currentCategoryId: catId ?? null })
			.onConflictDoUpdate({
				target: schema.userSettings.userId,
				set: {
					currentCategoryId: catId ?? null,
					updatedAt: new Date().toISOString(),
				},
			});
	})();
}

export function setOptions(opts: Partial<LibraryOptions>) {
	setAlgs("options", { ...algs.options, ...opts });
	// Persist lib options to SQLite
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;
		await db
			.insert(schema.userSettings)
			.values({ userId, libOptions: JSON.stringify(algs.options) })
			.onConflictDoUpdate({
				target: schema.userSettings.userId,
				set: {
					libOptions: JSON.stringify(algs.options),
					updatedAt: new Date().toISOString(),
				},
			});
	})();
}

export function toggleCase(id: string) {
	const idx = algs.selectedIds.indexOf(id);
	const adding = idx < 0;
	if (idx >= 0) {
		setAlgs(
			"selectedIds",
			algs.selectedIds.filter((x) => x !== id),
		);
	} else {
		setAlgs("selectedIds", [...algs.selectedIds, id]);
	}
	// Persist selection change to SQLite
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		const caseDbId = algs.cases[id]?.dbId;
		if (!db || !userId || !caseDbId) return;
		if (adding) {
			await db
				.insert(schema.userAlgSelection)
				.values({ userId, caseId: caseDbId })
				.onConflictDoNothing();
		} else {
			await db
				.delete(schema.userAlgSelection)
				.where(
					and(
						eq(schema.userAlgSelection.userId, userId),
						eq(schema.userAlgSelection.caseId, caseDbId),
					),
				);
		}
	})();
}

export function selectSubset(name: string) {
	const cat = currentCategoryObj();
	const subset = cat?.subsets.find((s) => s.name === name);
	if (!subset) return;
	const toAdd = subset.caseIds.filter((id) => !algs.selectedIds.includes(id));
	setAlgs("selectedIds", [...algs.selectedIds, ...toAdd]);
	// Persist bulk selection to SQLite
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;
		for (const id of toAdd) {
			const caseDbId = algs.cases[id]?.dbId;
			if (!caseDbId) continue;
			await db
				.insert(schema.userAlgSelection)
				.values({ userId, caseId: caseDbId })
				.onConflictDoNothing();
		}
	})();
}

export function deselectSubset(name: string) {
	const cat = currentCategoryObj();
	const subset = cat?.subsets.find((s) => s.name === name);
	if (!subset) return;
	const remove = new Set(subset.caseIds);
	setAlgs(
		"selectedIds",
		algs.selectedIds.filter((id) => !remove.has(id)),
	);
	// Persist bulk deselection to SQLite
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;
		for (const id of subset.caseIds) {
			const caseDbId = algs.cases[id]?.dbId;
			if (!caseDbId) continue;
			await db
				.delete(schema.userAlgSelection)
				.where(
					and(
						eq(schema.userAlgSelection.userId, userId),
						eq(schema.userAlgSelection.caseId, caseDbId),
					),
				);
		}
	})();
}

export function createCase(
	category: string,
	subsetName: string,
	id: string,
	payload: Partial<AlgCase>,
) {
	const cats = algs.catalog.categories.map((c) => ({
		...c,
		subsets: [...c.subsets],
	}));
	let cat = cats.find((c) => c.name === category);
	if (!cat) {
		cat = { name: category, subsets: [] };
		cats.push(cat);
	}
	let subset = cat.subsets.find((s) => s.name === subsetName);
	if (!subset) {
		subset = { name: subsetName, caseIds: [] };
		cat.subsets.push(subset);
	}
	if (!subset.caseIds.includes(id)) subset.caseIds.push(id);
	const base: AlgCase = {
		id,
		name: payload.name || id,
		alg: payload.alg || "",
	};
	const newCases = { ...algs.cases, [id]: { ...base, ...payload } as AlgCase };
	setAlgs("catalog", { categories: cats });
	setAlgs("cases", newCases);
	// Persist user-owned case to SQLite
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;
		// Find or create subset
		const subsetRows = await db
			.select({ id: schema.algSubset.id })
			.from(schema.algSubset)
			.where(eq(schema.algSubset.name, subsetName))
			.limit(1);
		if (!subsetRows[0]) return; // subset must exist in DB
		const caseId = crypto.randomUUID();
		const slug = id
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");
		await db
			.insert(schema.algCase)
			.values({
				id: caseId,
				slug,
				subsetId: subsetRows[0].id,
				userId,
				name: payload.name ?? id,
				alg: payload.alg ?? "",
			})
			.onConflictDoNothing();
		// Update in-memory dbId so subsequent mutations can reference it
		setAlgs("cases", id, "dbId", caseId);
	})();
}

export function updateCase(id: string, patch: Partial<AlgCase>) {
	const existing = algs.cases[id] ?? { id, name: id, alg: "" };
	const next = { ...existing, ...patch } as AlgCase;
	const newCases = { ...algs.cases, [id]: next };
	setAlgs("cases", newCases);
	// Persist annotation fields to SQLite (recognition, mnemonic, notes)
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		const caseDbId = algs.cases[id]?.dbId;
		if (!db || !userId || !caseDbId) return;
		const hasAnnotation =
			patch.recognition !== undefined ||
			patch.mnemonic !== undefined ||
			patch.notes !== undefined;
		if (hasAnnotation) {
			await db
				.insert(schema.userAlgAnnotation)
				.values({
					userId,
					caseId: caseDbId,
					recognition: next.recognition ?? null,
					mnemonic: next.mnemonic ?? null,
					notes: next.notes ?? null,
				})
				.onConflictDoUpdate({
					target: [
						schema.userAlgAnnotation.userId,
						schema.userAlgAnnotation.caseId,
					],
					set: {
						recognition: next.recognition ?? null,
						mnemonic: next.mnemonic ?? null,
						notes: next.notes ?? null,
						updatedAt: new Date().toISOString(),
					},
				});
		}
	})();
}

export function deleteCase(id: string) {
	const caseDbId = algs.cases[id]?.dbId;
	const newCases = { ...algs.cases };
	delete newCases[id];
	const cats = algs.catalog.categories.map((c) => ({
		...c,
		subsets: c.subsets.map((s) => ({
			...s,
			caseIds: s.caseIds.filter((cid) => cid !== id),
		})),
	}));
	setAlgs("cases", newCases);
	setAlgs("catalog", { categories: cats });
	setAlgs(
		"selectedIds",
		algs.selectedIds.filter((sid) => sid !== id),
	);
	// Delete user-owned case from SQLite (global catalog rows are not deletable by users)
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId || !caseDbId) return;
		await db
			.delete(schema.userAlgSelection)
			.where(
				and(
					eq(schema.userAlgSelection.userId, userId),
					eq(schema.userAlgSelection.caseId, caseDbId),
				),
			);
		await db
			.delete(schema.userAlgAnnotation)
			.where(
				and(
					eq(schema.userAlgAnnotation.userId, userId),
					eq(schema.userAlgAnnotation.caseId, caseDbId),
				),
			);
		// Only delete the case row if it's user-owned (userId = current user)
		await db
			.delete(schema.algCase)
			.where(
				and(eq(schema.algCase.id, caseDbId), eq(schema.algCase.userId, userId)),
			);
	})();
}

export function resetToDefaults() {
	// Clear all user overrides from SQLite: annotations, selections, and user-owned
	// cases. The global catalog (user_id = NULL) is left untouched. Categories and
	// subsets from the global catalog remain in the in-memory store.
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;

		// Query user-owned cases first so we can sync the in-memory store after the
		// deletes (we need to know which case names to remove from the catalog).
		const userCases = await db
			.select({ id: schema.algCase.id, name: schema.algCase.name })
			.from(schema.algCase)
			.where(eq(schema.algCase.userId, userId));
		const userCaseNames = new Set(userCases.map((c) => c.name));

		// Delete user data from SQLite.
		await db
			.delete(schema.userAlgAnnotation)
			.where(eq(schema.userAlgAnnotation.userId, userId));
		await db
			.delete(schema.userAlgSelection)
			.where(eq(schema.userAlgSelection.userId, userId));
		await db.delete(schema.algCase).where(eq(schema.algCase.userId, userId));

		// Mirror the deletes in memory: strip annotations from all cases,
		// remove user-owned case entries, and clear the selection list.
		const updatedCases: Record<string, AlgCase> = {};
		for (const [key, c] of Object.entries(algs.cases)) {
			if (userCaseNames.has(key)) continue; // drop user-created cases
			updatedCases[key] = {
				...c,
				recognition: undefined,
				mnemonic: undefined,
				notes: undefined,
			};
		}
		const updatedCatalog: AlgCatalog = {
			categories: algs.catalog.categories.map((cat: AlgCategory) => ({
				...cat,
				subsets: cat.subsets.map((s) => ({
					...s,
					caseIds: s.caseIds.filter((id) => !userCaseNames.has(id)),
				})),
			})),
		};
		setAlgs("cases", updatedCases);
		setAlgs("catalog", updatedCatalog);
		setAlgs("selectedIds", []);
	})();
}

export function importFromJson(json: string) {
	const parsed = JSON.parse(json) as AlgCatalog;
	if (!parsed || !Array.isArray(parsed.categories))
		throw new Error("Invalid catalog JSON");
	const cases: Record<string, AlgCase> = {};
	for (const cat of parsed.categories) {
		for (const subset of cat.subsets) {
			for (const id of subset.caseIds) {
				// Preserve any in-memory state (e.g., annotations loaded from DB)
				cases[id] = algs.cases[id] ?? { id, name: id, alg: "" };
			}
		}
	}
	setAlgs("catalog", parsed);
	setAlgs("cases", cases);
}

export function exportToJson(): string {
	return JSON.stringify(algs.catalog, null, 2);
}
