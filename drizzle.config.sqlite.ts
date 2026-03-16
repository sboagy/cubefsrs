import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit Configuration for SQLite WASM (client-side offline DB)
 *
 * Generate migrations:
 *   npx drizzle-kit generate --config=drizzle.config.sqlite.ts
 */
export default defineConfig({
	schema: "./drizzle/schema-sqlite.ts",
	out: "./drizzle/migrations/sqlite",
	dialect: "sqlite",
	dbCredentials: {
		url: "./cubefsrs_local.sqlite3",
	},
	verbose: true,
	strict: false,
});
