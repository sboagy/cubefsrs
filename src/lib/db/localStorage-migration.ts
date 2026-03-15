/**
 * localStorage-migration.ts
 *
 * One-time migration: reads legacy `cubedex.*` localStorage keys and inserts
 * them into SQLite, then tombstones the keys so the migration skips next time.
 *
 * Called during onSignIn, after catalog seed + store load, only when legacy
 * keys are present.
 */

import { eq } from "drizzle-orm";
import type { SqliteDatabase } from "@/lib/db/client-sqlite";
import { schema } from "@/lib/db/client-sqlite";

const MIGRATED_FLAG = "cubedex.migrated.v1";

function isAlreadyMigrated(): boolean {
	try {
		return localStorage.getItem(MIGRATED_FLAG) === "true";
	} catch {
		return true;
	}
}

function tombstone() {
	try {
		const keys = Object.keys(localStorage).filter(
			(k) => k.startsWith("cubedex.") && k !== MIGRATED_FLAG,
		);
		for (const k of keys) {
			localStorage.removeItem(k);
		}
		localStorage.setItem(MIGRATED_FLAG, "true");
	} catch {}
}

/**
 * Run the one-time migration.
 *
 * @param db         The initialized SQLite DB instance.
 * @param userId     Current user's ID.
 * @param nameToDbId Map from case name (legacy id) → SQLite UUID, built during
 *                   catalog seed / store load.
 */
export async function migrateLocalStorageToSqlite(
	db: SqliteDatabase,
	userId: string,
	nameToDbId: Map<string, string>,
): Promise<void> {
	if (isAlreadyMigrated()) return;

	// ── FSRS states ──────────────────────────────────────────────────────────
	try {
		const raw = localStorage.getItem("cubedex.fsrs.states.v1");
		if (raw) {
			type LegacyFSRS = {
				due: number;
				stability?: number;
				difficulty?: number;
				elapsed_days?: number;
				scheduled_days?: number;
				reps?: number;
				lapses?: number;
				state?: number;
				last_review?: number;
			};
			const states = JSON.parse(raw) as Record<string, LegacyFSRS>;
			for (const [name, state] of Object.entries(states)) {
				const caseDbId = nameToDbId.get(name);
				if (!caseDbId) continue;
				await db
					.insert(schema.fsrsCardState)
					.values({
						userId,
						caseId: caseDbId,
						due: state.due,
						stability: state.stability ?? null,
						difficulty: state.difficulty ?? null,
						elapsedDays: state.elapsed_days ?? null,
						scheduledDays: state.scheduled_days ?? null,
						reps: state.reps ?? 0,
						lapses: state.lapses ?? 0,
						state: state.state ?? 0,
						lastReview: state.last_review ?? null,
					})
					.onConflictDoNothing();
			}
		}
	} catch {}

	// ── Practice time entries ─────────────────────────────────────────────────
	try {
		const raw = localStorage.getItem("cubedex.practice.times.v1");
		if (raw) {
			type LegacyEntry = { id: string; ms: number; at: number };
			const timesById = JSON.parse(raw) as Record<string, LegacyEntry[]>;
			for (const [name, entries] of Object.entries(timesById)) {
				const caseDbId = nameToDbId.get(name);
				if (!caseDbId) continue;
				for (const entry of entries) {
					await db
						.insert(schema.practiceTimeEntry)
						.values({
							userId,
							caseId: caseDbId,
							ms: entry.ms,
							reviewedAt: new Date(entry.at ?? Date.now()).toISOString(),
						})
						.onConflictDoNothing();
				}
			}
		}
	} catch {}

	// ── Selections ─────────────────────────────────────────────────────────
	try {
		const raw = localStorage.getItem("cubedex.algs.selected.v1");
		if (raw) {
			const selectedNames = JSON.parse(raw) as string[];
			for (const name of selectedNames) {
				const caseDbId = nameToDbId.get(name);
				if (!caseDbId) continue;
				await db
					.insert(schema.userAlgSelection)
					.values({ userId, caseId: caseDbId })
					.onConflictDoNothing();
			}
		}
	} catch {}

	// ── user_settings (order_mode, lib_options, current_category_id) ────────
	try {
		const orderMode = localStorage.getItem("cubedex.practice.order") ?? "fsrs";
		const rawOptions = localStorage.getItem("cubedex.algs.options.v1");
		const libOptions = rawOptions ?? "{}";
		const currentCategory =
			localStorage.getItem("cubedex.algs.category.v1") ?? "";

		let currentCategoryId: string | null = null;
		if (currentCategory) {
			const catRows = await db
				.select({ id: schema.algCategory.id })
				.from(schema.algCategory)
				.where(eq(schema.algCategory.name, currentCategory))
				.limit(1);
			currentCategoryId = catRows[0]?.id ?? null;
		}

		await db
			.insert(schema.userSettings)
			.values({
				userId,
				orderMode,
				libOptions,
				currentCategoryId,
			})
			.onConflictDoNothing();
	} catch {}

	tombstone();
}
