import { eq } from "drizzle-orm";
import { createStore } from "solid-js/store";
import { getDb, schema } from "@/lib/db/client-sqlite";
import { getCurrentUserId } from "@/lib/db/db-state";
import type { FSRSState, Rating } from "@/services/scheduler/fsrs";
import {
	createInitialState,
	type FsrsUserParams,
	review as fsrsReview,
	getFsrsConfig,
	pickNextDue,
	reconfigureFsrs,
} from "@/services/scheduler/fsrs";
import { algs } from "@/stores/algs";

type FsrsState = {
	params: FsrsUserParams;
	states: Record<string, FSRSState>;
	queue: string[];
};

const [fsrs, setFsrs] = createStore<FsrsState>({
	params: {} as FsrsUserParams,
	states: {},
	queue: [],
});

export { fsrs, setFsrs };

export function initFsrs() {
	setFsrs("params", getFsrsConfig());
	setFsrs("states", {});
	refreshQueue();
}

export function applyParams(p: Partial<FsrsUserParams>) {
	reconfigureFsrs(p);
	setFsrs("params", getFsrsConfig());
	// Persist FSRS params to SQLite user_settings
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;
		await db
			.insert(schema.userSettings)
			.values({ userId, fsrsParams: JSON.stringify(fsrs.params) })
			.onConflictDoUpdate({
				target: schema.userSettings.userId,
				set: {
					fsrsParams: JSON.stringify(fsrs.params),
					updatedAt: new Date().toISOString(),
				},
			});
	})();
}

export function clearReviews() {
	setFsrs("states", {});
	setFsrs("queue", []);
	// Delete all card states from SQLite
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;
		await db
			.delete(schema.fsrsCardState)
			.where(eq(schema.fsrsCardState.userId, userId));
	})();
}

export function ensureCard(id: string) {
	if (!fsrs.states[id]) {
		setFsrs("states", { ...fsrs.states, [id]: createInitialState(Date.now()) });
		// Persist new card to SQLite
		void (async () => {
			const db = getDb();
			const userId = getCurrentUserId();
			const caseDbId = algs.cases[id]?.dbId;
			if (!db || !userId || !caseDbId) return;
			const state = fsrs.states[id];
			if (!state) return;
			await db
				.insert(schema.fsrsCardState)
				.values({
					userId,
					caseId: caseDbId,
					due: state.due,
					stability: state.stability ?? null,
					difficulty: state.difficulty ?? null,
					elapsedDays: null,
					scheduledDays: null,
					reps: state.reps ?? 0,
					lapses: state.lapses ?? 0,
					state: state.reps === 0 ? 0 : 2,
					lastReview: state.lastReview ?? null,
				})
				.onConflictDoNothing();
		})();
	}
}

export function refreshQueue() {
	const now = Date.now();
	const ids = Object.keys(fsrs.states);
	const due: string[] = [];
	for (const id of ids) {
		const s = fsrs.states[id];
		if (s && s.due <= now) due.push(id);
	}
	if (!due.length) {
		const next = pickNextDue(fsrs.states, now);
		setFsrs("queue", next ? [next] : []);
	} else {
		setFsrs("queue", due);
	}
}

export function popNext(): string | null {
	if (!fsrs.queue.length) return null;
	const [first, ...rest] = fsrs.queue;
	setFsrs("queue", rest);
	return first ?? null;
}

export function reviewCase(id: string, rating: Rating) {
	ensureCard(id);
	const prev = fsrs.states[id] ?? createInitialState(Date.now());
	const now = Date.now();
	const res = fsrsReview(prev, rating, now);
	setFsrs("states", { ...fsrs.states, [id]: res.state });
	refreshQueue();
	// Persist updated card state to SQLite
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		const caseDbId = algs.cases[id]?.dbId;
		if (!db || !userId || !caseDbId) return;
		const state = res.state;
		await db
			.insert(schema.fsrsCardState)
			.values({
				userId,
				caseId: caseDbId,
				due: state.due,
				stability: state.stability ?? null,
				difficulty: state.difficulty ?? null,
				elapsedDays: null,
				scheduledDays: null,
				reps: state.reps ?? 0,
				lapses: state.lapses ?? 0,
				state: state.reps === 0 ? 0 : 2,
				lastReview: state.lastReview ?? null,
				updatedAt: new Date().toISOString(),
			})
			.onConflictDoUpdate({
				target: [schema.fsrsCardState.userId, schema.fsrsCardState.caseId],
				set: {
					due: state.due,
					stability: state.stability ?? null,
					difficulty: state.difficulty ?? null,
					elapsedDays: null,
					scheduledDays: null,
					reps: state.reps ?? 0,
					lapses: state.lapses ?? 0,
					state: state.reps === 0 ? 0 : 2,
					lastReview: state.lastReview ?? null,
					updatedAt: new Date().toISOString(),
				},
			});
	})();
	return res;
}
