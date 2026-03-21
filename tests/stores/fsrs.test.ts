/**
 * tests/stores/fsrs.test.ts
 *
 * Unit tests for the `fsrs` store: `ensureCard`, `refreshQueue`, and
 * `popNext`.
 *
 * The store writes to SQLite as a fire-and-forget side-effect.  We mock the
 * DB layer so `getDb()` returns `null` and persistence is silently skipped.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock DB layer before importing the store ──────────────────────────────────
vi.mock("@/lib/db/client-sqlite", () => ({
	getDb: () => null,
	schema: {},
	persistDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/db-state", () => ({
	getCurrentUserId: () => "test-user-id",
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { produce } from "solid-js/store";
import type { FSRSState } from "@/services/scheduler/fsrs";
import {
	ensureCard,
	fsrs,
	popNext,
	refreshQueue,
	setFsrs,
} from "@/stores/fsrs";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Build a minimal FSRSState with a custom `due` timestamp. */
function makeState(dueMs: number): FSRSState {
	return {
		due: dueMs,
		stability: 0,
		difficulty: 0,
		reps: 0,
		lapses: 0,
		lastReview: 0,
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ensureCard", () => {
	beforeEach(() => {
		// Solid store objects are merged on assignment, not replaced.
		// Use produce() to explicitly clear all keys from the states object.
		setFsrs(
			produce((s) => {
				s.states = {};
				s.queue = [];
			}),
		);
	});

	it("creates an initial state for a new case id", () => {
		ensureCard("t-perm");
		expect(fsrs.states["t-perm"]).toBeDefined();
	});

	it("does not overwrite an existing state", () => {
		const existingDue = Date.now() - DAY_MS;
		setFsrs("states", { "t-perm": makeState(existingDue) });
		ensureCard("t-perm");
		expect(fsrs.states["t-perm"].due).toBe(existingDue);
	});

	it("is idempotent — calling twice keeps first state", () => {
		ensureCard("j-perm");
		const dueBefore = fsrs.states["j-perm"].due;
		ensureCard("j-perm");
		expect(fsrs.states["j-perm"].due).toBe(dueBefore);
	});
});

describe("refreshQueue", () => {
	beforeEach(() => {
		setFsrs(
			produce((s) => {
				s.states = {};
				s.queue = [];
			}),
		);
	});

	it("queues a card that is due now", () => {
		const past = Date.now() - DAY_MS;
		setFsrs("states", { "t-perm": makeState(past) });
		refreshQueue();
		expect(fsrs.queue).toContain("t-perm");
	});

	it("queues all cards that are due", () => {
		const past = Date.now() - DAY_MS;
		setFsrs("states", {
			"t-perm": makeState(past),
			"j-perm": makeState(past),
		});
		refreshQueue();
		expect(fsrs.queue).toContain("t-perm");
		expect(fsrs.queue).toContain("j-perm");
	});

	it("does not queue a card due in the future when others are due", () => {
		const past = Date.now() - DAY_MS;
		const future = Date.now() + DAY_MS;
		setFsrs("states", {
			"t-perm": makeState(past),
			"j-perm": makeState(future),
		});
		refreshQueue();
		expect(fsrs.queue).toContain("t-perm");
		expect(fsrs.queue).not.toContain("j-perm");
	});

	it("produces an empty queue when no states exist", () => {
		refreshQueue();
		expect(fsrs.queue).toHaveLength(0);
	});

	it("produces empty queue when all cards are in the future", () => {
		// pickNextDue only returns cards where isDue() == true (due <= now).
		// When all cards are future, no card is due, so queue stays empty.
		const soon = Date.now() + 1_000;
		const later = Date.now() + DAY_MS;
		setFsrs("states", {
			"t-perm": makeState(later),
			"j-perm": makeState(soon),
		});
		refreshQueue();
		expect(fsrs.queue).toHaveLength(0);
	});
});

describe("popNext", () => {
	beforeEach(() => {
		setFsrs(
			produce((s) => {
				s.states = {};
				s.queue = [];
			}),
		);
	});

	it("returns null when the queue is empty", () => {
		expect(popNext()).toBeNull();
	});

	it("returns the first item in the queue", () => {
		setFsrs("queue", ["t-perm", "j-perm"]);
		expect(popNext()).toBe("t-perm");
	});

	it("removes the returned item from the queue", () => {
		setFsrs("queue", ["t-perm", "j-perm"]);
		popNext();
		expect(fsrs.queue).not.toContain("t-perm");
	});

	it("leaves remaining items in the queue after pop", () => {
		setFsrs("queue", ["t-perm", "j-perm", "y-perm"]);
		popNext();
		expect(fsrs.queue).toEqual(["j-perm", "y-perm"]);
	});

	it("returns null after all items are popped", () => {
		setFsrs("queue", ["t-perm"]);
		popNext();
		expect(popNext()).toBeNull();
	});
});
