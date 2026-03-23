import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AUTH_STORAGE_KEY = "cubefsrs-auth";
export const AUTH_STATE_DB_VERSION_STORAGE_KEY = "cubefsrs-e2e-db-version";
export const AUTH_STATE_SNAPSHOT_VERSION_STORAGE_KEY =
	"cubefsrs-e2e-auth-snapshot-version";
export const CURRENT_AUTH_STATE_SNAPSHOT_VERSION = 2;

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEGEN_CONFIG_PATH = resolve(
	__dirname,
	"../../oosync.codegen.config.json",
);

function readCurrentAuthStateDbVersion(): number | null {
	try {
		const raw = JSON.parse(readFileSync(CODEGEN_CONFIG_PATH, "utf-8")) as {
			browserSqlite?: { databaseVersion?: unknown };
		};
		const version = raw.browserSqlite?.databaseVersion;
		return typeof version === "number" ? version : null;
	} catch {
		return null;
	}
}

export const CURRENT_AUTH_STATE_DB_VERSION = readCurrentAuthStateDbVersion();

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
	dbVersion: number | null;
	snapshotVersion: number | null;
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
		let storedUserEmail: string | null = null;
		let expiresAtMs: number | null = null;
		let dbVersion: number | null = null;
		let snapshotVersion: number | null = null;

		for (const origin of origins) {
			for (const entry of origin.localStorage ?? []) {
				if (entry.name === AUTH_STORAGE_KEY && entry.value) {
					const session = parseStoredSession(entry.value);
					if (session) {
						expiresAtMs =
							typeof session.expires_at === "number"
								? session.expires_at * 1000
								: null;
						storedUserEmail =
							typeof session.user?.email === "string"
								? session.user.email
								: null;
					}
				}

				if (entry.name === AUTH_STATE_DB_VERSION_STORAGE_KEY && entry.value) {
					const parsed = Number(entry.value);
					dbVersion = Number.isFinite(parsed) ? parsed : null;
				}

				if (
					entry.name === AUTH_STATE_SNAPSHOT_VERSION_STORAGE_KEY &&
					entry.value
				) {
					const parsed = Number(entry.value);
					snapshotVersion = Number.isFinite(parsed) ? parsed : null;
				}
			}
		}

		return {
			hasIndexedDbSnapshot,
			storedUserEmail,
			expiresAtMs,
			dbVersion,
			snapshotVersion,
		};
	} catch {
		return null;
	}
}
