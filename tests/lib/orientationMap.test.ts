/**
 * tests/lib/orientationMap.test.ts
 *
 * Unit tests for the `mapTokenByZ2` orientation-mapping function.
 * These are pure functions with no external dependencies.
 */

import { describe, expect, it } from "vitest";
import { mapTokenByZ2 } from "@/lib/orientationMap";

describe("mapTokenByZ2 — face moves", () => {
	it("maps U → D", () => expect(mapTokenByZ2("U")).toBe("D"));
	it("maps D → U", () => expect(mapTokenByZ2("D")).toBe("U"));
	it("maps R → L", () => expect(mapTokenByZ2("R")).toBe("L"));
	it("maps L → R", () => expect(mapTokenByZ2("L")).toBe("R"));
	it("maps F → F (unchanged)", () => expect(mapTokenByZ2("F")).toBe("F"));
	it("maps B → B (unchanged)", () => expect(mapTokenByZ2("B")).toBe("B"));
});

describe("mapTokenByZ2 — prime suffix", () => {
	it("maps U' → D'", () => expect(mapTokenByZ2("U'")).toBe("D'"));
	it("maps R' → L'", () => expect(mapTokenByZ2("R'")).toBe("L'"));
	it("maps F' → F'", () => expect(mapTokenByZ2("F'")).toBe("F'"));
});

describe("mapTokenByZ2 — double (2) suffix", () => {
	it("maps U2 → D2", () => expect(mapTokenByZ2("U2")).toBe("D2"));
	it("maps R2 → L2", () => expect(mapTokenByZ2("R2")).toBe("L2"));
	it("maps F2 → F2", () => expect(mapTokenByZ2("F2")).toBe("F2"));
	// '2' is never toggled — the double suffix stays
});

describe("mapTokenByZ2 — lowercase wide moves", () => {
	it("maps u → d", () => expect(mapTokenByZ2("u")).toBe("d"));
	it("maps r' → l'", () => expect(mapTokenByZ2("r'")).toBe("l'"));
	it("maps f → f (unchanged)", () => expect(mapTokenByZ2("f")).toBe("f"));
});

describe("mapTokenByZ2 — Rw-style wide moves", () => {
	it("maps Rw → Lw", () => expect(mapTokenByZ2("Rw")).toBe("Lw"));
	it("maps Uw' → Dw'", () => expect(mapTokenByZ2("Uw'")).toBe("Dw'"));
	it("maps Fw2 → Fw2 (unchanged)", () => expect(mapTokenByZ2("Fw2")).toBe("Fw2"));
});

describe("mapTokenByZ2 — slice moves", () => {
	it("maps M → M' (prime toggled)", () => expect(mapTokenByZ2("M")).toBe("M'"));
	it("maps M' → M (prime toggled)", () => expect(mapTokenByZ2("M'")).toBe("M"));
	it("maps E → E' (prime toggled)", () => expect(mapTokenByZ2("E")).toBe("E'"));
	it("maps S → S (unchanged)", () => expect(mapTokenByZ2("S")).toBe("S"));
	it("maps S' → S'", () => expect(mapTokenByZ2("S'")).toBe("S'"));
	it("maps M2 → M2 (2 preserved)", () => expect(mapTokenByZ2("M2")).toBe("M2"));
});

describe("mapTokenByZ2 — rotations", () => {
	it("maps x → x' (prime toggled)", () => expect(mapTokenByZ2("x")).toBe("x'"));
	it("maps x' → x", () => expect(mapTokenByZ2("x'")).toBe("x"));
	it("maps y → y' (prime toggled)", () => expect(mapTokenByZ2("y")).toBe("y'"));
	it("maps z → z (unchanged)", () => expect(mapTokenByZ2("z")).toBe("z"));
	it("maps z' → z'", () => expect(mapTokenByZ2("z'")).toBe("z'"));
});

describe("mapTokenByZ2 — unknown tokens pass through", () => {
	it("returns empty string as-is", () => expect(mapTokenByZ2("")).toBe(""));
	it("preserves unknown tokens", () => expect(mapTokenByZ2("Q")).toBe("Q"));
});
