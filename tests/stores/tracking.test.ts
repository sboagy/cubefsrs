/**
 * tests/stores/tracking.test.ts
 *
 * Unit tests for the `tracking` store: `setAlgorithm`, `resetTracking`, and
 * `ingestMove`.
 *
 * `tracking.ts` uses cubing/alg for simplified bad-alg display and
 * cubing/puzzles for kpuzzle-based pattern verification.  Both are mocked:
 * - cubing/alg: `Alg.fromString()` returns a trivial object whose
 *   `experimentalSimplify()` echoes the input (sufficient for bad-alg tests).
 * - cubing/puzzles: `cube3x3x3.kpuzzle()` rejects, forcing the store to use
 *   its built-in SeqPattern fallback indefinitely. This makes tests
 *   deterministic and avoids async pattern-state overwrite races.
 *
 * State is reset between tests via `setAlgorithm` (or `resetTracking`), which
 * clears all in-flight move buffers and pending-moves queues.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock DB layer (algs store dependency) ─────────────────────────────────────
vi.mock("@/lib/db/client-sqlite", () => ({
	getDb: () => null,
	schema: {},
	persistDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/db-state", () => ({
	getCurrentUserId: () => "test-user-id",
}));

// ── Mock cubing/alg ───────────────────────────────────────────────────────────
// experimentalSimplify must be present; it echoes the input so bad-alg state
// is preserved rather than collapsed to an empty string.
vi.mock("cubing/alg", () => ({
	Alg: {
		fromString(s: string) {
			return {
				experimentalSimplify: () => ({ toString: () => s }),
				toString: () => s,
			};
		},
	},
}));

// ── Mock cubing/puzzles ───────────────────────────────────────────────────────
// Reject so `initPatterns` never replaces the SeqPattern fallback state,
// ensuring all tests use the same deterministic in-memory pattern comparison.
vi.mock("cubing/puzzles", () => ({
	cube3x3x3: {
		kpuzzle: () => Promise.reject(new Error("mock: kpuzzle not available")),
	},
}));

// ── Import store after mocks ──────────────────────────────────────────────────
import {
	ingestMove,
	resetTracking,
	setAlgorithm,
	tracking,
} from "@/stores/tracking";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset tracking before each test by loading a fresh algorithm. */
function loadAlg(alg: string) {
	setAlgorithm(alg);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("setAlgorithm", () => {
	it("resets state to initial conditions", () => {
		loadAlg("R U R'");
		// Partially advance the algorithm
		ingestMove("R");
		expect(tracking.currentMoveIndex).toBe(0);

		// Re-loading the same algorithm resets everything
		loadAlg("R U R'");
		expect(tracking.currentMoveIndex).toBe(-1);
		expect(tracking.badAlg).toHaveLength(0);
	});

	it("parses the algorithm into userAlg tokens", () => {
		loadAlg("R U R'");
		expect(tracking.userAlg).toEqual(["R", "U", "R'"]);
	});

	it("auto-advances past a leading rotation token", () => {
		// When the first token is a rotation (y), it should be skipped
		loadAlg("y R U R'");
		// y is auto-advanced; currentMoveIndex should point past it
		expect(tracking.currentMoveIndex).toBe(0);
		expect(tracking.userAlg[1]).toBe("R");
	});
});

describe("resetTracking", () => {
	it("clears move index and errors mid-algorithm", () => {
		loadAlg("R U R'");
		// R' is a wrong-direction move that rotation calibration cannot rescue
		// (same letter as R, so calibration accepts the letter match, but
		// R' ≠ R in the pattern comparison, so the move is recorded as an error).
		ingestMove("R'");
		expect(tracking.badAlg).not.toHaveLength(0);

		resetTracking();
		expect(tracking.currentMoveIndex).toBe(-1);
		expect(tracking.badAlg).toHaveLength(0);
	});

	it("still skips leading rotations after reset before accepting a move", () => {
		loadAlg("y R U");
		resetTracking();

		ingestMove("R");

		expect(tracking.currentMoveIndex).toBe(1);
		expect(tracking.badAlg).toHaveLength(0);
	});
});

describe("ingestMove – white-up orientation", () => {
	beforeEach(() => {
		loadAlg("R U R'");
	});

	it("accepts the first correct move and advances index", () => {
		ingestMove("R");
		expect(tracking.currentMoveIndex).toBe(0);
		expect(tracking.badAlg).toHaveLength(0);
	});

	it("steps through a full sequence successfully", () => {
		ingestMove("R");
		ingestMove("U");
		ingestMove("R'");
		expect(tracking.currentMoveIndex).toBe(2);
		expect(tracking.badAlg).toHaveLength(0);
	});

	it("records a wrong move as badAlg", () => {
		// R' (primed) when R (unprimed) is expected: rotation calibration cannot
		// rescue this because all rotations preserve the prime suffix, so no
		// rotated R' can equal the expected pattern SeqPattern(["R"]).
		ingestMove("R'");
		expect(tracking.badAlg).not.toHaveLength(0);
	});

	it("undoes the last wrong move when its inverse is sent", () => {
		ingestMove("R'"); // wrong direction
		expect(tracking.badAlg).not.toHaveLength(0);

		ingestMove("R"); // inverse of R' undoes it
		expect(tracking.badAlg).toHaveLength(0);
	});
});

describe("ingestMove – yellow-up orientation", () => {
	it("accepts U (logical) mapped from hardware D in yellow-up mode", () => {
		loadAlg("U R U'");
		// In yellow-up, PracticeView pre-translates: hardware D → logical U
		ingestMove("U");
		expect(tracking.currentMoveIndex).toBe(0);
		expect(tracking.badAlg).toHaveLength(0);
	});

	it("full sequence accepted with pre-translated moves", () => {
		loadAlg("U R");
		ingestMove("U"); // pre-translated from hardware D
		ingestMove("R"); // pre-translated from hardware L
		expect(tracking.currentMoveIndex).toBe(1);
		expect(tracking.badAlg).toHaveLength(0);
	});
});

describe("ingestMove – double turns", () => {
	it("buffers the first quarter turn into pendingDouble", () => {
		// The full U2-acceptance path requires kpuzzle's mathematical equivalence
		// (U*U = U2 in group theory), which SeqPattern cannot verify.
		// We test the buffering mechanism: one U puts the move in pendingDouble.
		loadAlg("U2 R");
		ingestMove("U");
		expect(tracking.pendingDouble).not.toBeNull();
		expect(tracking.pendingDouble?.face).toBe("U");
		// Move is buffered, not yet accepted at the expected index
		expect(tracking.currentMoveIndex).toBe(-1);
	});

	it("requires two opposite quarter turns to undo a wrong-direction double turn", () => {
		loadAlg("U2 R");

		ingestMove("U'");
		ingestMove("U'");
		expect(tracking.badAlg).toEqual(["U'", "U'"]);
		expect(tracking.currentMoveIndex).toBe(-1);

		ingestMove("U");
		expect(tracking.badAlg).toEqual(["U'"]);
		expect(tracking.currentMoveIndex).toBe(-1);

		ingestMove("U");
		expect(tracking.badAlg).toHaveLength(0);
		expect(tracking.currentMoveIndex).toBe(-1);
	});
});

describe("ingestMove – slice composites", () => {
	it("accepts M from the correct R + L' composite", () => {
		loadAlg("M U");
		ingestMove("R");
		ingestMove("L'");
		expect(tracking.currentMoveIndex).toBe(0);
		expect(tracking.badAlg).toHaveLength(0);
	});

	it("rejects the wrong-direction R' + L composite when M is expected", () => {
		loadAlg("M U");
		ingestMove("R'");
		ingestMove("L");
		expect(tracking.currentMoveIndex).toBe(-1);
		expect(tracking.badAlg).not.toHaveLength(0);
	});
});

describe("ingestMove – rotation auto-advance", () => {
	it("auto-advances past an inline rotation token", () => {
		loadAlg("R y R'");
		ingestMove("R");
		// After accepting R, the y token should be auto-skipped
		// currentMoveIndex should now be 1 (past y), so R' is next
		expect(tracking.currentMoveIndex).toBe(1);
	});

	it("accepts the move after an auto-advanced rotation", () => {
		loadAlg("R y R'");
		ingestMove("R");
		ingestMove("R'");
		expect(tracking.currentMoveIndex).toBe(2);
		expect(tracking.badAlg).toHaveLength(0);
	});

	it("auto-advances past consecutive rotations", () => {
		loadAlg("R y x R'");
		ingestMove("R");
		// Both y and x should be skipped automatically
		expect(tracking.currentMoveIndex).toBe(2); // past R(0), y(1), x(2)
	});
});

describe("ingestMove – AUF prefix tracking", () => {
	it("accepts U as the AUF move at the start of the alg", () => {
		loadAlg("U R U'"); // U is the AUF, R U' is the base
		ingestMove("U");
		expect(tracking.currentMoveIndex).toBe(0);
		expect(tracking.badAlg).toHaveLength(0);
	});

	it("accepts U (pre-translated from hardware D in yellow-up) as AUF U", () => {
		loadAlg("U R U'");
		// PracticeView translates hardware D → logical U before calling ingestMove
		ingestMove("U");
		expect(tracking.currentMoveIndex).toBe(0);
		expect(tracking.badAlg).toHaveLength(0);
	});
});
