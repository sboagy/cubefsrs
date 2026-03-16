import type { ILogger } from "oosync/runtime";
import type { IBrowserSqliteHooks } from "oosync/runtime/browser-sqlite";

const logger: ILogger = {
	debug: console.debug.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
};

// Minimal hooks for CubeFSRS SQLite client.
// Expanded in Phase 4 (SQLite migration + views).
export const browserSqliteHooks: IBrowserSqliteHooks = {
	logger,
	onDatabaseReady: async (_db, _context) => {
		// Phase 4: seed global catalog if first run, set up any needed indexes
	},
};
