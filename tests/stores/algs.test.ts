/**
 * tests/stores/algs.test.ts
 *
 * Unit tests for the `algs` store: `toggleCase`, `selectSubset`,
 * `deselectSubset`, and `isSelected`.
 *
 * The store functions persist changes to SQLite, but that side-effect is
 * fire-and-forget (`void (async () => { ... })()`).  We mock the DB layer
 * to return `null` so persistence is silently skipped, letting us test the
 * in-memory Solid store state directly.
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
import {
	algs,
	currentSubsets,
	deselectSubset,
	isSelected,
	selectSubset,
	setAlgs,
	toggleCase,
} from "@/stores/algs";

// ── Test data ─────────────────────────────────────────────────────────────────

const CASE_A = "case-a";
const CASE_B = "case-b";
const CASE_C = "case-c";

function seedCatalog() {
	// Set up a minimal catalog with a PLL category and one subset
	setAlgs("catalog", {
		categories: [
			{
				name: "PLL",
				subsets: [
					{
						name: "Adjacent Corners",
						caseIds: [CASE_A, CASE_B],
					},
					{
						name: "Diagonal Corners",
						caseIds: [CASE_C],
					},
				],
			},
		],
	});
	setAlgs("currentCategory", "PLL");
	setAlgs("cases", {
		[CASE_A]: { id: CASE_A, dbId: CASE_A, name: "T Perm", alg: "R U R' U'" },
		[CASE_B]: { id: CASE_B, dbId: CASE_B, name: "J Perm", alg: "R U R' F'" },
		[CASE_C]: { id: CASE_C, dbId: CASE_C, name: "Y Perm", alg: "F R U' R'" },
	});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("isSelected", () => {
	beforeEach(() => {
		seedCatalog();
		setAlgs("selectedIds", []);
	});

	it("returns false for an unselected case", () => {
		expect(isSelected(CASE_A)).toBe(false);
	});

	it("returns true after selecting a case", () => {
		setAlgs("selectedIds", [CASE_A]);
		expect(isSelected(CASE_A)).toBe(true);
	});
});

describe("toggleCase", () => {
	beforeEach(() => {
		seedCatalog();
		setAlgs("selectedIds", []);
	});

	it("adds a case when not selected", () => {
		toggleCase(CASE_A);
		expect(isSelected(CASE_A)).toBe(true);
	});

	it("removes a case when already selected", () => {
		setAlgs("selectedIds", [CASE_A]);
		toggleCase(CASE_A);
		expect(isSelected(CASE_A)).toBe(false);
	});

	it("does not affect other selected cases when toggling one off", () => {
		setAlgs("selectedIds", [CASE_A, CASE_B]);
		toggleCase(CASE_A);
		expect(isSelected(CASE_B)).toBe(true);
	});

	it("is idempotent for a second select", () => {
		toggleCase(CASE_A);
		toggleCase(CASE_A); // second call deselects
		expect(isSelected(CASE_A)).toBe(false);
	});
});

describe("selectSubset", () => {
	beforeEach(() => {
		seedCatalog();
		setAlgs("selectedIds", []);
	});

	it("selects all cases in the subset", () => {
		selectSubset("Adjacent Corners");
		expect(isSelected(CASE_A)).toBe(true);
		expect(isSelected(CASE_B)).toBe(true);
	});

	it("does not affect cases outside the subset", () => {
		selectSubset("Adjacent Corners");
		expect(isSelected(CASE_C)).toBe(false);
	});

	it("does nothing for an unknown subset name", () => {
		selectSubset("Nonexistent Subset");
		expect(algs.selectedIds).toHaveLength(0);
	});

	it("does not duplicate already-selected cases", () => {
		setAlgs("selectedIds", [CASE_A]);
		selectSubset("Adjacent Corners");
		const count = algs.selectedIds.filter((id) => id === CASE_A).length;
		expect(count).toBe(1);
	});
});

describe("deselectSubset", () => {
	beforeEach(() => {
		seedCatalog();
		setAlgs("selectedIds", [CASE_A, CASE_B, CASE_C]);
	});

	it("deselects all cases in the subset", () => {
		deselectSubset("Adjacent Corners");
		expect(isSelected(CASE_A)).toBe(false);
		expect(isSelected(CASE_B)).toBe(false);
	});

	it("preserves cases outside the subset", () => {
		deselectSubset("Adjacent Corners");
		expect(isSelected(CASE_C)).toBe(true);
	});

	it("does nothing for an unknown subset name", () => {
		deselectSubset("Nonexistent Subset");
		expect(algs.selectedIds).toHaveLength(3);
	});
});

describe("currentSubsets", () => {
	beforeEach(() => {
		seedCatalog();
	});

	it("returns the subsets for the current category", () => {
		const subsets = currentSubsets();
		expect(subsets.length).toBe(2);
		expect(subsets[0].name).toBe("Adjacent Corners");
		expect(subsets[1].name).toBe("Diagonal Corners");
	});
});
