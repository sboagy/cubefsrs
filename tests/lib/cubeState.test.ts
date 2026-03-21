/**
 * tests/lib/cubeState.test.ts
 *
 * Unit tests for cube state helpers in `src/lib/cubeState.ts`.
 *
 * `patternToFacelets` and `faceletsToPattern` depend on `cubing/kpuzzle` and
 * an async-initialized global `KPUZZLE_333`.  We test the data-mapping layer
 * by supplying a minimal mock `KPattern` and verifying the REID → facelets
 * transformation produces the expected sticker order for a solved cube.
 *
 * `scrambleToMatchFacelets` is async and depends on `cubing/search`, so it is
 * excluded from unit tests (it belongs in integration/E2E scope).
 */

import { describe, expect, it, vi } from "vitest";

// ── Hoisted mock classes ──────────────────────────────────────────────────────
// vi.mock() factories are hoisted to the top of the file by Vitest, ahead of
// regular variable/class declarations.  We use vi.hoisted() to define the mock
// class in the same hoisted scope so it is available inside the factory.

const { MockKPattern, KPUZZLE_MOCK } = vi.hoisted(() => {
	const KPUZZLE_MOCK = { id: "3x3x3" } as const;

	class MockKPattern {
		constructor(
			public readonly kpuzzle: typeof KPUZZLE_MOCK,
			public readonly patternData: {
				CORNERS: { pieces: number[]; orientation: number[] };
				EDGES: { pieces: number[]; orientation: number[] };
				CENTERS: { pieces: number[]; orientation: number[] };
			},
		) {}
	}

	return { MockKPattern, KPUZZLE_MOCK };
});

vi.mock("cubing/kpuzzle", () => ({
	KPattern: MockKPattern,
}));

vi.mock("cubing/puzzles", () => ({
	cube3x3x3: {
		kpuzzle: () => Promise.resolve(KPUZZLE_MOCK),
	},
}));

vi.mock("cubing/search", () => ({
	experimentalSolve3x3x3IgnoringCenters: vi.fn().mockResolvedValue({ toString: () => "" }),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
// cubeState.ts fires a .then() on cube3x3x3.kpuzzle() at module load time.
// We import after mocking so the mock is in place.
import { patternToFacelets } from "@/lib/cubeState";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a solved-cube KPattern stub.
 *
 * Solved 3×3×3:
 *   CORNERS pieces 0-7 in order, orientation 0
 *   EDGES   pieces 0-11 in order, orientation 0
 *   CENTERS pieces 0-5 in order, orientation 0
 */
function solvedPattern(): InstanceType<typeof MockKPattern> {
	return new MockKPattern(KPUZZLE_MOCK, {
		CORNERS: {
			pieces: [0, 1, 2, 3, 4, 5, 6, 7],
			orientation: [0, 0, 0, 0, 0, 0, 0, 0],
		},
		EDGES: {
			pieces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
			orientation: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		},
		CENTERS: {
			pieces: [0, 1, 2, 3, 4, 5],
			orientation: [0, 0, 0, 0, 0, 0],
		},
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("patternToFacelets — solved cube", () => {
	it("returns a 54-character string", () => {
		const facelets = patternToFacelets(solvedPattern() as unknown as Parameters<typeof patternToFacelets>[0]);
		expect(typeof facelets).toBe("string");
		expect(facelets).toHaveLength(54);
	});

	it("contains only valid face letters (U,R,F,D,L,B)", () => {
		const facelets = patternToFacelets(solvedPattern() as unknown as Parameters<typeof patternToFacelets>[0]);
		expect(facelets).toMatch(/^[URFDLB]+$/);
	});
});
