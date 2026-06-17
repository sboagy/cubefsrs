#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const PSQL = "psql";

function fail(message) {
	console.error(message);
	process.exit(1);
}

function requireEnv(name) {
	const value = process.env[name]?.trim();
	if (!value) fail(`Missing required environment variable: ${name}`);
	return value;
}

function mask(value) {
	if (process.env.GITHUB_ACTIONS === "true" && value) {
		console.log(`::add-mask::${value}`);
	}
}

function appendSummary(markdown) {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (summaryPath) appendFileSync(summaryPath, `${markdown.trimEnd()}\n`);
}

function parseProjectRefFromSupabaseUrl(value) {
	const url = new URL(value);
	const [ref] = url.hostname.split(".");
	return ref;
}

function parseProjectRefFromDatabaseUrl(value) {
	const url = new URL(value);
	const hostParts = url.hostname.toLowerCase().split(".");
	if (hostParts[0] === "db" && hostParts[1]) return hostParts[1];
	const userParts = url.username.toLowerCase().split(".");
	return userParts.length > 1 ? userParts.at(-1) : null;
}

function assertTargets({
	sourceDbUrl,
	targetDbUrl,
	sourceSupabaseUrl,
	targetSupabaseUrl,
}) {
	const sourceRef = parseProjectRefFromSupabaseUrl(sourceSupabaseUrl);
	const targetRef = parseProjectRefFromSupabaseUrl(targetSupabaseUrl);
	if (!sourceRef || !targetRef) {
		fail("Unable to parse source/target Supabase refs.");
	}
	if (sourceRef === targetRef) {
		fail("Source and target Supabase project refs match.");
	}
	if (parseProjectRefFromDatabaseUrl(sourceDbUrl) !== sourceRef) {
		fail("PRODUCTION_DATABASE_URL does not match PRODUCTION_SUPABASE_URL.");
	}
	if (parseProjectRefFromDatabaseUrl(targetDbUrl) !== targetRef) {
		fail("DATABASE_URL does not match staging SUPABASE_URL.");
	}
	console.log(`Source project ref: ${sourceRef}`);
	console.log(`Target project ref: ${targetRef}`);
}

function run(command, args, options = {}) {
	console.log(`Running ${options.label ?? command}...`);
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${options.label ?? command} failed with exit code ${result.status}`,
		);
	}
}

function runSql(databaseUrl, sql, label) {
	run(
		PSQL,
		[
			databaseUrl,
			"--no-psqlrc",
			"--single-transaction",
			"-v",
			"ON_ERROR_STOP=1",
			"-q",
			"-c",
			sql,
		],
		{ label },
	);
}

function main() {
	if (requireEnv("SOURCE_ENV") !== "production" || requireEnv("TARGET_ENV") !== "staging") {
		fail("Refusing to run unless SOURCE_ENV=production and TARGET_ENV=staging.");
	}

	const sourceDbUrl = requireEnv("PRODUCTION_DATABASE_URL");
	const targetDbUrl = requireEnv("DATABASE_URL");
	const sourceSupabaseUrl = requireEnv("PRODUCTION_SUPABASE_URL");
	const targetSupabaseUrl =
		process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
	if (!targetSupabaseUrl) fail("Missing SUPABASE_URL or VITE_SUPABASE_URL.");

	mask(sourceDbUrl);
	mask(targetDbUrl);
	assertTargets({
		sourceDbUrl,
		targetDbUrl,
		sourceSupabaseUrl,
		targetSupabaseUrl,
	});

	const seedFile = join(
		process.cwd(),
		"supabase",
		"seeds",
		"01_global_catalog.sql",
	);
	if (!existsSync(seedFile)) {
		fail(`Seed file not found: ${seedFile}`);
	}

	runSql(
		targetDbUrl,
		`
TRUNCATE
  cubefsrs.user_alg_annotation,
  cubefsrs.user_alg_selection,
  cubefsrs.fsrs_card_state,
  cubefsrs.practice_time_entry,
  cubefsrs.user_settings,
  cubefsrs.alg_case,
  cubefsrs.alg_subset,
  cubefsrs.alg_category
RESTART IDENTITY CASCADE;
DELETE FROM public.sync_change_log
WHERE table_name IN (
  'alg_category',
  'alg_subset',
  'alg_case',
  'user_alg_annotation',
  'user_alg_selection',
  'fsrs_card_state',
  'practice_time_entry',
  'user_settings'
);
`,
		"clear staging cubefsrs data",
	);
	run(
		PSQL,
		[
			targetDbUrl,
			"--no-psqlrc",
			"--single-transaction",
			"-v",
			"ON_ERROR_STOP=1",
			"-q",
			"-f",
			seedFile,
		],
		{ label: "load staging global catalog seed" },
	);
	runSql(
		targetDbUrl,
		`
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM cubefsrs.user_alg_annotation) = 0,
    'staging user_alg_annotation must be empty after refresh';
  ASSERT (SELECT count(*) FROM cubefsrs.user_alg_selection) = 0,
    'staging user_alg_selection must be empty after refresh';
  ASSERT (SELECT count(*) FROM cubefsrs.fsrs_card_state) = 0,
    'staging fsrs_card_state must be empty after refresh';
  ASSERT (SELECT count(*) FROM cubefsrs.practice_time_entry) = 0,
    'staging practice_time_entry must be empty after refresh';
  ASSERT (SELECT count(*) FROM cubefsrs.user_settings) = 0,
    'staging user_settings must be empty after refresh';
  ASSERT (SELECT count(*) FROM cubefsrs.alg_category WHERE user_id IS NOT NULL) = 0,
    'staging global catalog refresh must not include user-owned categories';
  ASSERT (SELECT count(*) FROM cubefsrs.alg_subset WHERE user_id IS NOT NULL) = 0,
    'staging global catalog refresh must not include user-owned subsets';
  ASSERT (SELECT count(*) FROM cubefsrs.alg_case WHERE user_id IS NOT NULL) = 0,
    'staging global catalog refresh must not include user-owned cases';
END $$;
`,
		"validate staging cubefsrs data refresh",
	);

	appendSummary(`
### CubeFSRS staging data refresh

- Source: production schema intentionally not copied
- Target: staging \`cubefsrs\` schema
- Loaded: committed global catalog seed
- User-owned practice/notes/custom algorithm rows: \`excluded\`
`);
}

try {
	main();
} catch (err) {
	fail(err instanceof Error ? err.message : String(err));
}
