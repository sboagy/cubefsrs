// Legacy orientation mapping logic (parity with original cubefsrs implementation)
// Rules derived from original orientation.ts:
//  - Faces: U<->D, R<->L swap; F/B unchanged (z2 about y-axis in training convention)
//  - Lowercase wide faces follow same mapping preserving case
//  - Rw-style wide: letter maps, 'w' preserved
//  - Slices: M & E toggle prime, S preserves suffix
//  - Rotations: x & y toggle prime, z preserves suffix (visual canonical)
//  - '2' suffix never toggled
//  - Unknown tokens returned unchanged

function togglePrime(suf: string): string {
	if (!suf) return "'"; // add prime
	if (suf === "'") return ""; // remove prime
	return suf; // '2' remains '2'
}

export function mapTokenByZ2(token: string): string {
	if (!token) return token;
	const t = token.trim();
	const suf = /(['2])$/.test(t) ? t.slice(-1) : "";
	const base = suf ? t.slice(0, -1) : t;

	const upper = base.toUpperCase();

	// Rotations
	if (upper === "X" || upper === "Y" || upper === "Z") {
		const mapped = upper === "Z" ? "z" : upper.toLowerCase();
		const mappedSuf = upper === "Z" ? suf : togglePrime(suf);
		return mapped + mappedSuf;
	}

	// Slices
	if (upper === "M" || upper === "E" || upper === "S") {
		const mappedSuf = upper === "S" ? suf : togglePrime(suf);
		return upper + mappedSuf;
	}

	const mapFace = (c: string): string => {
		switch (c) {
			case "U":
				return "D";
			case "D":
				return "U";
			case "R":
				return "L";
			case "L":
				return "R";
			case "F":
				return "F";
			case "B":
				return "B";
			default:
				return c;
		}
	};

	// Lowercase wide (single letter)
	if (/^[rufdlb]$/.test(base)) {
		const mapped = mapFace(base.toUpperCase()).toLowerCase();
		return mapped + suf;
	}

	// Rw style (two chars, second w/W)
	if (/^[RUFDLB][wW]$/.test(base)) {
		const mapped = mapFace(base[0]);
		return mapped + "w" + suf;
	}

	// Single face
	if (/^[URFDLB]$/.test(base)) {
		return mapFace(base) + suf;
	}

	return token;
}
