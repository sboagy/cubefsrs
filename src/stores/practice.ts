import { and, eq } from "drizzle-orm";
import { createStore } from "solid-js/store";
import { getDb, schema } from "@/lib/db/client-sqlite";
import { getCurrentUserId } from "@/lib/db/db-state";
import { algs } from "@/stores/algs";

export type AlgorithmVisibility = "full" | "obscured" | "hidden";

type TimeEntry = { id: string; ms: number; at: number };

type PracticeState = {
	currentId: string | null;
	running: boolean;
	startAt: number | null;
	timesById: Record<string, TimeEntry[]>;
	visibility: AlgorithmVisibility;
	history: string[];
	historyIndex: number;
	orderMode: "sequential" | "random" | "fsrs";
};

function newTimeEntry(ms: number): TimeEntry {
	const now = Date.now();
	return { id: String(now), ms, at: now };
}

const [practice, setPractice] = createStore<PracticeState>({
	currentId: null,
	running: false,
	startAt: null,
	timesById: {},
	visibility: "full",
	history: [],
	historyIndex: -1,
	orderMode: "fsrs",
});

export { practice, setPractice };

export function currentTimes(): TimeEntry[] {
	const id = practice.currentId;
	return id ? (practice.timesById[id] ?? []) : [];
}
export function averageMs(): number {
	const arr = currentTimes();
	return arr.length
		? Math.round(arr.reduce((a, t) => a + t.ms, 0) / arr.length)
		: 0;
}
export function bestMs(): number {
	const arr = currentTimes();
	return arr.length ? Math.min(...arr.map((t) => t.ms)) : 0;
}

export function setOrderMode(mode: PracticeState["orderMode"]) {
	setPractice("orderMode", mode);
	// Persist order mode to SQLite user_settings
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;
		await db
			.insert(schema.userSettings)
			.values({ userId, orderMode: mode })
			.onConflictDoUpdate({
				target: schema.userSettings.userId,
				set: { orderMode: mode, updatedAt: new Date().toISOString() },
			});
	})();
}

function setCurrent(id: string | null) {
	setPractice("currentId", id);
	setPractice("running", false);
	setPractice("startAt", null);
}

export function visit(id: string) {
	if (
		practice.historyIndex >= 0 &&
		practice.history[practice.historyIndex] === id
	) {
		setCurrent(id);
		return;
	}
	const newHistory = practice.history.slice(0, practice.historyIndex + 1);
	newHistory.push(id);
	setPractice("history", newHistory);
	setPractice("historyIndex", newHistory.length - 1);
	setCurrent(id);
}

export function goPrev() {
	if (practice.historyIndex > 0) {
		setPractice("historyIndex", practice.historyIndex - 1);
		setCurrent(practice.history[practice.historyIndex] ?? null);
	}
}

export function goNext() {
	if (
		practice.historyIndex >= 0 &&
		practice.historyIndex < practice.history.length - 1
	) {
		setPractice("historyIndex", practice.historyIndex + 1);
		setCurrent(practice.history[practice.historyIndex] ?? null);
	}
}

export function startPractice() {
	if (practice.running) return;
	setPractice("running", true);
	setPractice("startAt", Date.now());
}

export function stopPractice() {
	if (!practice.running) return;
	const end = Date.now();
	const ms = Math.max(0, end - (practice.startAt ?? end));
	if (practice.currentId) {
		const arr = [...(practice.timesById[practice.currentId] ?? [])];
		arr.unshift(newTimeEntry(ms));
		if (arr.length > 100) arr.length = 100;
		const newTimesById = { ...practice.timesById, [practice.currentId]: arr };
		setPractice("timesById", newTimesById);
		// Persist time entry to SQLite
		const caseId = practice.currentId;
		const entryMs = ms;
		void (async () => {
			const db = getDb();
			const userId = getCurrentUserId();
			const caseDbId = algs.cases[caseId]?.dbId;
			if (!db || !userId || !caseDbId) return;
			await db.insert(schema.practiceTimeEntry).values({
				userId,
				caseId: caseDbId,
				ms: entryMs,
				reviewedAt: new Date().toISOString(),
			});
		})();
	}
	setPractice("running", false);
	setPractice("startAt", null);
}

export function restartRun() {
	if (!practice.running) {
		startPractice();
		return;
	}
	setPractice("startAt", Date.now());
}

export function cycleVisibility() {
	const next: AlgorithmVisibility =
		practice.visibility === "full"
			? "obscured"
			: practice.visibility === "obscured"
				? "hidden"
				: "full";
	setPractice("visibility", next);
}

export function clearTimes(id?: string) {
	if (id) {
		const newTimesById = { ...practice.timesById };
		delete newTimesById[id];
		setPractice("timesById", newTimesById);
	} else {
		setPractice("timesById", {});
	}
	// Delete time entries from SQLite
	void (async () => {
		const db = getDb();
		const userId = getCurrentUserId();
		if (!db || !userId) return;
		if (id) {
			const caseDbId = algs.cases[id]?.dbId;
			if (!caseDbId) return;
			await db
				.delete(schema.practiceTimeEntry)
				.where(
					and(
						eq(schema.practiceTimeEntry.userId, userId),
						eq(schema.practiceTimeEntry.caseId, caseDbId),
					),
				);
		} else {
			await db
				.delete(schema.practiceTimeEntry)
				.where(eq(schema.practiceTimeEntry.userId, userId));
		}
	})();
}
