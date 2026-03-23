import { beforeEach } from "vitest";

class MemoryStorage implements Storage {
	#entries = new Map<string, string>();

	get length(): number {
		return this.#entries.size;
	}

	clear(): void {
		this.#entries.clear();
	}

	getItem(key: string): string | null {
		return this.#entries.get(key) ?? null;
	}

	key(index: number): string | null {
		return Array.from(this.#entries.keys())[index] ?? null;
	}

	removeItem(key: string): void {
		this.#entries.delete(key);
	}

	setItem(key: string, value: string): void {
		this.#entries.set(String(key), String(value));
	}
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: storage,
});

if (typeof window !== "undefined") {
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: storage,
	});
}

beforeEach(() => {
	storage.clear();
});
