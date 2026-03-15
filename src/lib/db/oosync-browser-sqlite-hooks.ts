import type { IBrowserSqliteHooks } from "oosync/runtime/browser-sqlite";

// Minimal hooks for CubeFSRS SQLite client.
// Expanded in Phase 4 (SQLite migration + views).
export const browserSqliteHooks: IBrowserSqliteHooks = {
  onDatabaseReady: async (_db, _context) => {
    // Phase 4: seed global catalog if first run, set up any needed indexes
  },
};
