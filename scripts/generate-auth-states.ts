/**
 * scripts/generate-auth-states.ts
 *
 * CLI script to regenerate `e2e/.auth/<key>.json` for all 8 shared workspace
 * test users.  Run this when auth tokens have expired or after a DB reset.
 *
 * Usage:
 *   npx tsx scripts/generate-auth-states.ts
 *   # or force DB clear first:
 *   RESET_DB=true npx tsx scripts/generate-auth-states.ts
 *
 * This is a convenience wrapper that invokes the Playwright setup project so
 * you do not need to remember the `--project=setup` flag.
 */

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load .env.local for local development
config({ path: resolve(ROOT, ".env.local") });

const resetDb = process.env.RESET_DB === "true";

console.log("🔐 Regenerating CubeFSRS auth state files…");
if (resetDb) {
	console.log("🗑️  RESET_DB=true — CubeFSRS user data will be cleared first.");
}
console.log(
	"   Requires: shared local Supabase instance running + app dev server",
);
console.log();

try {
	execSync(
		`npx playwright test --project=setup --reporter=list ${resetDb ? "--timeout=120000" : ""}`,
		{
			cwd: ROOT,
			stdio: "inherit",
			env: process.env,
		},
	);

	console.log();
	console.log("✅ Auth state files regenerated in e2e/.auth/");
} catch {
	console.error("❌ Auth state generation failed.");
	process.exit(1);
}
