/**
 * __mocks__/cubing/alg.ts
 *
 * Vitest manual mock for `cubing/alg`.
 *
 * The real `cubing/alg` module ships WASM and ESM-only internals that don't
 * run in a jsdom environment.  This mock provides a minimal `Alg` class that
 * supports the operations used by CubeViewer and CaseThumb: `fromString()`,
 * `invert()`, and `toString()`.
 */

export class Alg {
	constructor(private readonly src: string = "") {}

	static fromString(s: string): Alg {
		return new Alg(s);
	}

	invert(): Alg {
		// Return a no-op inverse (sufficient for snapshot / setup-alg tests).
		return new Alg(`(${this.src})'`);
	}

	toString(): string {
		return this.src;
	}
}
