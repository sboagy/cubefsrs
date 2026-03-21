// Ported essential helpers from legacy cubefsrs index.ts for move tracking

export function getInverseMove(move?: string): string {
	if (!move) return "";
	const trimmed = move.replace(/\s+/g, "").trim();
	if (!trimmed) return "";
	if (trimmed.endsWith("2")) return trimmed; // double turns are self-inverse
	if (trimmed.endsWith("'")) return trimmed.slice(0, -1);
	return trimmed + "'";
}

// Very lightweight opposite mapping used in legacy logic for specific heuristic cases
export function getOppositeMove(face?: string): string | undefined {
	if (!face) return undefined;
	const f = face[0].toUpperCase();
	const map: Record<string, string> = {
		R: "L",
		L: "R",
		U: "D",
		D: "U",
		F: "B",
		B: "F",
	};
	return map[f];
}

// Candidate first part for slice composite (M/E/S) based on axis
export function isCandidateFirstPart(
	slice: "M" | "E" | "S",
	logicalMove: string,
): boolean {
	const move = logicalMove.replace(/[()]/g, "");
	const face = move[0];
	if (!face) return false;
	// M uses R/L axis, E uses U/D axis, S uses F/B axis
	switch (slice) {
		case "M":
			return /[RL]/i.test(face);
		case "E":
			return /[UD]/i.test(face);
		case "S":
			return /[FB]/i.test(face);
	}
}
