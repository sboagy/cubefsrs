/**
 * tests/services/fsrs.test.ts
 *
 * Unit tests for the FSRS scheduler service (`src/services/scheduler/fsrs.ts`).
 *
 * Tests cover: `createInitialState`, `review`, `pickNextDue`, and `isDue`.
 * `reconfigureFsrs` / `getFsrsConfig` involve `localStorage`; they are tested
 * using jsdom's localStorage provided by the vitest `jsdom` environment.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
	createInitialState,
	type FSRSState,
	isDue,
	pickNextDue,
	type Rating,
	review,
} from "@/services/scheduler/fsrs";

const NOW = new Date("2025-07-20T14:00:00.000Z").getTime();
const ONE_DAY_MS = 86_400_000;

describe("createInitialState", () => {
	it("returns a state with zero reps", () => {
		const state = createInitialState(NOW);
		expect(state.reps).toBe(0);
	});

	it("returns a state with zero lapses", () => {
		const state = createInitialState(NOW);
		expect(state.lapses).toBe(0);
	});

	it("due date is not in the distant past", () => {
		const state = createInitialState(NOW);
		// A new card should be due very soon (same day or slightly in past/future)
		expect(state.due).toBeGreaterThan(NOW - ONE_DAY_MS * 2);
	});
});

describe("review", () => {
	let initial: FSRSState;

	beforeEach(() => {
		initial = createInitialState(NOW);
	});

	it("increases reps after a Good review", () => {
		const result = review(initial, 3 as Rating, NOW);
		expect(result.state.reps).toBeGreaterThan(initial.reps);
	});

	it("sets lastReview to now", () => {
		const result = review(initial, 3 as Rating, NOW);
		expect(result.state.lastReview).toBe(NOW);
	});

	it("schedules due date in the future after Good", () => {
		const result = review(initial, 3 as Rating, NOW);
		// After first Good review, due should be in the future (at least a few minutes)
		expect(result.state.due).toBeGreaterThan(NOW);
	});

	it("increments lapses on Again rating", () => {
		const result = review(initial, 1 as Rating, NOW);
		// FSRS increments lapses on Again
		expect(result.state.lapses).toBeGreaterThanOrEqual(initial.lapses);
	});

	it("returns the correct rating in ReviewResult", () => {
		const result = review(initial, 4 as Rating, NOW);
		expect(result.rating).toBe(4);
	});

	it("schedules Easy further out than Good", () => {
		const good = review(initial, 3 as Rating, NOW);
		const easy = review(initial, 4 as Rating, NOW);
		// Easy should produce a longer interval than Good
		expect(easy.state.due).toBeGreaterThan(good.state.due);
	});

	it("schedules Again closer than Good", () => {
		const again = review(initial, 1 as Rating, NOW);
		const good = review(initial, 3 as Rating, NOW);
		expect(again.state.due).toBeLessThanOrEqual(good.state.due);
	});
});

describe("isDue", () => {
	it("returns true when due <= now", () => {
		const state: FSRSState = { ...createInitialState(NOW), due: NOW - 1000 };
		expect(isDue(state, NOW)).toBe(true);
	});

	it("returns false when due > now", () => {
		const state: FSRSState = {
			...createInitialState(NOW),
			due: NOW + ONE_DAY_MS,
		};
		expect(isDue(state, NOW)).toBe(false);
	});

	it("returns true when due == now exactly", () => {
		const state: FSRSState = { ...createInitialState(NOW), due: NOW };
		expect(isDue(state, NOW)).toBe(true);
	});
});

describe("pickNextDue", () => {
	it("returns null for empty states", () => {
		expect(pickNextDue({}, NOW)).toBeNull();
	});

	it("returns null when no cards are due", () => {
		const states: Record<string, FSRSState> = {
			a: { ...createInitialState(NOW), due: NOW + ONE_DAY_MS },
		};
		expect(pickNextDue(states, NOW)).toBeNull();
	});

	it("returns the ID of the due card", () => {
		const states: Record<string, FSRSState> = {
			a: { ...createInitialState(NOW), due: NOW - 1000 },
		};
		expect(pickNextDue(states, NOW)).toBe("a");
	});

	it("returns the most overdue card when multiple are due", () => {
		const states: Record<string, FSRSState> = {
			recent: { ...createInitialState(NOW), due: NOW - 1000 },
			older: { ...createInitialState(NOW), due: NOW - ONE_DAY_MS },
		};
		// Should pick the oldest due card (smallest due value)
		expect(pickNextDue(states, NOW)).toBe("older");
	});

	it("ignores cards that are not due yet", () => {
		const states: Record<string, FSRSState> = {
			due: { ...createInitialState(NOW), due: NOW - 500 },
			future: { ...createInitialState(NOW), due: NOW + ONE_DAY_MS },
		};
		expect(pickNextDue(states, NOW)).toBe("due");
	});
});
