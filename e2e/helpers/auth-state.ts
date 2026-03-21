import { existsSync, readFileSync } from "node:fs";

const AUTH_STORAGE_KEY = "cubefsrs-auth";

type StoredSession = {
	expires_at?: unknown;
	user?: {
		email?: unknown;
	};
};

type AuthStateOrigin = {
	indexedDB?: unknown[];
	localStorage?: Array<{
		name?: string;
		value?: string;
	}>;
};

export type StoredAuthStateMetadata = {
	hasIndexedDbSnapshot: boolean;
	storedUserEmail: string | null;
	expiresAtMs: number | null;
};

function parseStoredSession(value: string): StoredSession | null {
	try {
		const parsed = JSON.parse(value) as StoredSession;
		return typeof parsed === "object" && parsed !== null ? parsed : null;
	} catch {
		return null;
	}
}

export function readStoredAuthStateMetadata(
	filePath: string,
): StoredAuthStateMetadata | null {
	if (!existsSync(filePath)) return null;

	try {
		const authData = JSON.parse(readFileSync(filePath, "utf-8")) as {
			origins?: AuthStateOrigin[];
		};
		const origins = authData.origins ?? [];

		const hasIndexedDbSnapshot = origins.some(
			(origin) => (origin.indexedDB?.length ?? 0) > 0,
		);

		for (const origin of origins) {
			for (const entry of origin.localStorage ?? []) {
				if (entry.name !== AUTH_STORAGE_KEY || !entry.value) continue;

				const session = parseStoredSession(entry.value);
				if (!session) continue;

				const expiresAtMs =
					typeof session.expires_at === "number"
						? session.expires_at * 1000
						: null;
				const storedUserEmail =
					typeof session.user?.email === "string"
						? session.user.email
						: null;

				return {
					hasIndexedDbSnapshot,
					storedUserEmail,
					expiresAtMs,
				};
			}
		}

		return {
			hasIndexedDbSnapshot,
			storedUserEmail: null,
			expiresAtMs: null,
		};
	} catch {
		return null;
	}
}