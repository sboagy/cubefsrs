// FSRS scheduling: thin wrapper around ts-fsrs with a simple state shape
import {
	type Card,
	createEmptyCard,
	FSRS,
	generatorParameters,
	Rating as LibRating,
	type RecordLogItem,
} from "ts-fsrs";

export type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface FSRSState {
	stability: number;
	difficulty: number;
	due: number; // epoch ms
	lastReview: number; // epoch ms
	reps: number;
	lapses: number;
	_raw?: Card;
}

export interface ReviewResult {
	state: FSRSState;
	rating: Rating;
	cardId: string;
	reviewTime: number;
	scheduledIntervalMs: number;
}

// ---- Configurable parameters persisted in localStorage ----
const PARAMS_KEY = "cubedex.fsrs.params";
export type FsrsUserParams = Partial<{
	request_retention: number; // 0..1
	maximum_interval: number; // days
	enable_fuzz: boolean;
	enable_short_term: boolean;
}>;

function loadUserParams(): FsrsUserParams {
	try {
		const raw = localStorage.getItem(PARAMS_KEY);
		return raw ? (JSON.parse(raw) as FsrsUserParams) : {};
	} catch {
		return {};
	}
}
function saveUserParams(p: FsrsUserParams) {
	try {
		localStorage.setItem(PARAMS_KEY, JSON.stringify(p));
	} catch {}
}
function clampNum(n: number, lo: number, hi: number): number {
	if (Number.isNaN(n)) return lo;
	return Math.max(lo, Math.min(hi, n));
}

function effectiveParams(): FsrsUserParams {
	const user = loadUserParams();
	const enable_fuzz = user.enable_fuzz ?? true;
	const enable_short_term = user.enable_short_term ?? true;
	const out: FsrsUserParams = { enable_fuzz, enable_short_term };
	if (typeof user.request_retention === "number")
		out.request_retention = clampNum(user.request_retention, 0.01, 1.0);
	out.maximum_interval = Math.max(
		1,
		Math.round(
			typeof user.maximum_interval === "number" ? user.maximum_interval : 8,
		),
	);
	return out;
}

let fsrsEngine = new FSRS(generatorParameters(effectiveParams()));

export function getFsrsConfig(): FsrsUserParams {
	return { ...effectiveParams() };
}

export function reconfigureFsrs(params: FsrsUserParams): void {
	const current = loadUserParams();
	const next: FsrsUserParams = { ...current, ...params };
	if (typeof next.request_retention === "number")
		next.request_retention = clampNum(next.request_retention, 0.01, 1.0);
	if (typeof next.maximum_interval === "number")
		next.maximum_interval = Math.max(1, Math.round(next.maximum_interval));
	saveUserParams(next);
	fsrsEngine = new FSRS(generatorParameters(effectiveParams()));
}

function libRating(r: Rating): LibRating {
	switch (r) {
		case 1:
			return LibRating.Again;
		case 2:
			return LibRating.Hard;
		case 3:
			return LibRating.Good;
		case 4:
			return LibRating.Easy;
	}
}

export function createInitialState(now: number): FSRSState {
	const card = createEmptyCard(new Date(now));
	return {
		stability: card.stability,
		difficulty: card.difficulty,
		due: card.due.getTime(),
		lastReview: card.last_review ? card.last_review.getTime() : 0,
		reps: card.reps,
		lapses: card.lapses,
		_raw: card,
	};
}

export function review(
	prev: FSRSState,
	rating: Rating,
	now: number,
): ReviewResult {
	const card: Card = {
		due: new Date(prev.due),
		stability: prev.stability,
		difficulty: prev.difficulty,
		elapsed_days: prev.lastReview ? (now - prev.lastReview) / 86400000 : 0,
		scheduled_days: 0,
		learning_steps: 0,
		reps: prev.reps,
		lapses: prev.lapses,
		state: prev.reps === 0 ? 0 : 2,
		last_review: prev.lastReview ? new Date(prev.lastReview) : undefined,
	} as Card;

	const scheduling = fsrsEngine.repeat(
		card,
		new Date(now),
	) as unknown as Record<LibRating, RecordLogItem>;
	const item: RecordLogItem = scheduling[libRating(rating)];
	const nextCard = item.card;
	const updated: FSRSState = {
		stability: nextCard.stability,
		difficulty: nextCard.difficulty,
		due: nextCard.due.getTime(),
		lastReview: nextCard.last_review ? nextCard.last_review.getTime() : now,
		reps: nextCard.reps,
		lapses: nextCard.lapses,
		_raw: nextCard,
	};
	return {
		state: updated,
		rating,
		cardId: "",
		reviewTime: now,
		scheduledIntervalMs: nextCard.due.getTime() - now,
	};
}

export function isDue(state: FSRSState, now: number): boolean {
	return state.due <= now;
}

export function pickNextDue(
	states: Record<string, FSRSState>,
	now: number,
): string | null {
	let best: { id: string; due: number } | null = null;
	for (const id of Object.keys(states)) {
		const s = states[id];
		if (!s) continue;
		if (isDue(s, now)) {
			if (!best || s.due < best.due) best = { id, due: s.due };
		}
	}
	return best ? best.id : null;
}
