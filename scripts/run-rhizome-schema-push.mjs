import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { findRhizomeRepo } from "./lib/find-rhizome.mjs";

const APP_SCHEMA = "cubefsrs";
const BASH = "/bin/bash";
const INITIAL_MIGRATION_VERSION = "20260315000001";
const INITIAL_MIGRATION_NAME = "cubefsrs_schema";
const INITIAL_SCHEMA_TABLES = [
	"alg_category",
	"alg_subset",
	"alg_case",
	"user_alg_annotation",
	"user_alg_selection",
	"fsrs_card_state",
	"practice_time_entry",
	"user_settings",
];
const INITIAL_SCHEMA_TRIGGERS = [
	["alg_case", "alg_case_updated_at"],
	["user_alg_annotation", "user_alg_annotation_updated_at"],
	["fsrs_card_state", "fsrs_card_state_updated_at"],
	["user_settings", "user_settings_updated_at"],
];
const INITIAL_SCHEMA_POLICIES = [
	["alg_category", "alg_category_select"],
	["alg_category", "alg_category_insert"],
	["alg_category", "alg_category_update"],
	["alg_category", "alg_category_delete"],
	["alg_subset", "alg_subset_select"],
	["alg_subset", "alg_subset_insert"],
	["alg_subset", "alg_subset_update"],
	["alg_subset", "alg_subset_delete"],
	["alg_case", "alg_case_select"],
	["alg_case", "alg_case_insert"],
	["alg_case", "alg_case_update"],
	["alg_case", "alg_case_delete"],
	["user_alg_annotation", "user_alg_annotation_select"],
	["user_alg_annotation", "user_alg_annotation_insert"],
	["user_alg_annotation", "user_alg_annotation_update"],
	["user_alg_annotation", "user_alg_annotation_delete"],
	["user_alg_selection", "user_alg_selection_select"],
	["user_alg_selection", "user_alg_selection_insert"],
	["user_alg_selection", "user_alg_selection_delete"],
	["fsrs_card_state", "fsrs_card_state_select"],
	["fsrs_card_state", "fsrs_card_state_insert"],
	["fsrs_card_state", "fsrs_card_state_update"],
	["fsrs_card_state", "fsrs_card_state_delete"],
	["practice_time_entry", "practice_time_entry_select"],
	["practice_time_entry", "practice_time_entry_insert"],
	["practice_time_entry", "practice_time_entry_delete"],
	["user_settings", "user_settings_select"],
	["user_settings", "user_settings_insert"],
	["user_settings", "user_settings_update"],
	["user_settings", "user_settings_delete"],
];

function fail(message) {
	console.error(message);
	process.exit(1);
}

function requireEnv(name) {
	const value = process.env[name];
	if (!value) fail(`Missing required environment variable: ${name}`);
	return value;
}

function parseArgs(argv) {
	const envFlagIndex = argv.indexOf("--env");
	if (envFlagIndex === -1 || !argv[envFlagIndex + 1]) {
		fail("Usage: node scripts/run-rhizome-schema-push.mjs --env staging|production");
	}
	const targetEnv = argv[envFlagIndex + 1];
	if (!["staging", "production"].includes(targetEnv)) {
		fail(`Unsupported schema push target: ${targetEnv}`);
	}
	return { targetEnv };
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

function sqlLiteral(value) {
	return `'${value.replaceAll("'", "''")}'`;
}

function sqlValues(rows) {
	return rows
		.map(
			(row) =>
				`(${row.map((value) => sqlLiteral(value)).join(", ")})`,
		)
		.join(",\n");
}

function psql(databaseUrl, sql, options = {}) {
	const result = spawnSync(
		"psql",
		["-d", databaseUrl, "--no-psqlrc", "-qAt", "-c", sql],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	const stdout = result.stdout?.trim() ?? "";
	const stderr = result.stderr?.trim() ?? "";
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${options.label ?? "psql"} failed with exit code ${result.status}${
				stderr ? `: ${stderr}` : ""
			}`,
		);
	}
	return stdout;
}

function parseProjectRefFromSupabaseUrl(value) {
	try {
		const url = new URL(value);
		const [projectRef] = url.hostname.split(".");
		if (
			!projectRef ||
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "0.0.0.0" ||
			url.hostname === "::1" ||
			projectRef === "127"
		) {
			throw new Error(`not a Supabase project host: ${url.hostname}`);
		}
		return projectRef;
	} catch (err) {
		fail(
			`Unable to parse SUPABASE_URL project ref: ${
				err instanceof Error ? err.message : String(err)
			}`,
		);
	}
}

function redactedDatabaseTarget(databaseUrl) {
	const url = new URL(databaseUrl);
	const dbName = url.pathname.replace(/^\//, "") || "(none)";
	return {
		redacted: `${url.hostname}/${dbName}`,
		hash: createHash("sha256")
			.update(`${url.hostname}/${dbName}`)
			.digest("hex")
			.slice(0, 12),
	};
}

function assertTargetEnvironment({ targetEnv, databaseUrl, supabaseUrl }) {
	const projectRef = parseProjectRefFromSupabaseUrl(supabaseUrl);
	const url = new URL(databaseUrl);
	const ref = projectRef.toLowerCase();
	const inHostname = url.hostname.toLowerCase().split(".").includes(ref);
	const inUsername = url.username.toLowerCase().split(".").includes(ref);
	if (!inHostname && !inUsername) {
		fail(
			`DATABASE_URL does not appear to target the ${targetEnv} Supabase project ref ${projectRef}.`,
		);
	}

	const target = redactedDatabaseTarget(databaseUrl);
	appendSummary(`
### CubeFSRS schema target (${targetEnv})

- Supabase project ref: \`${projectRef}\`
- App schema: \`${APP_SCHEMA}\`
- Database target hash: \`${target.hash}\`
- Database target: \`${target.redacted}\`
`);
}

function listMissingInitialSchemaObjects(databaseUrl) {
	const tableValues = sqlValues(INITIAL_SCHEMA_TABLES.map((name) => [name]));
	const triggerValues = sqlValues(INITIAL_SCHEMA_TRIGGERS);
	const policyValues = sqlValues(INITIAL_SCHEMA_POLICIES);
	const sql = `
WITH expected_tables(table_name) AS (
    VALUES
${tableValues}
),
expected_triggers(table_name, trigger_name) AS (
    VALUES
${triggerValues}
),
expected_policies(table_name, policy_name) AS (
    VALUES
${policyValues}
),
missing_tables AS (
    SELECT 'table:' || table_name AS missing
    FROM expected_tables
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = '${APP_SCHEMA}'
          AND c.relname = expected_tables.table_name
          AND c.relkind IN ('r', 'p')
    )
),
missing_triggers AS (
    SELECT 'trigger:' || table_name || '.' || trigger_name AS missing
    FROM expected_triggers
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = '${APP_SCHEMA}'
          AND c.relname = expected_triggers.table_name
          AND t.tgname = expected_triggers.trigger_name
          AND NOT t.tgisinternal
    )
),
missing_policies AS (
    SELECT 'policy:' || table_name || '.' || policy_name AS missing
    FROM expected_policies
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = '${APP_SCHEMA}'
          AND p.tablename = expected_policies.table_name
          AND p.policyname = expected_policies.policy_name
    )
),
missing_functions AS (
    SELECT 'function:set_updated_at' AS missing
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = '${APP_SCHEMA}'
          AND p.proname = 'set_updated_at'
    )
)
SELECT missing
FROM missing_tables
UNION ALL
SELECT missing
FROM missing_triggers
UNION ALL
SELECT missing
FROM missing_policies
UNION ALL
SELECT missing
FROM missing_functions
ORDER BY missing;
`;

	const output = psql(databaseUrl, sql, {
		label: "initial CubeFSRS schema baseline check",
	});
	return output ? output.split("\n").filter(Boolean) : [];
}

function baselineExistingProductionInitialMigration(databaseUrl, targetEnv) {
	if (targetEnv !== "production") {
		return;
	}

	const appliedCount = Number(
		psql(
			databaseUrl,
			`SELECT COUNT(*) FROM supabase_migrations.schema_migrations WHERE version = ${sqlLiteral(
				INITIAL_MIGRATION_VERSION,
			)}`,
			{ label: "initial CubeFSRS migration ledger check" },
		),
	);
	if (appliedCount > 0) {
		return;
	}

	const existingTableCount = Number(
		psql(
			databaseUrl,
			`SELECT COUNT(*)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = ${sqlLiteral(APP_SCHEMA)}
  AND c.relname = ANY (ARRAY[${INITIAL_SCHEMA_TABLES.map(sqlLiteral).join(", ")}])
  AND c.relkind IN ('r', 'p')`,
			{ label: "initial CubeFSRS table presence check" },
		),
	);
	if (existingTableCount === 0) {
		return;
	}

	const missingObjects = listMissingInitialSchemaObjects(databaseUrl);
	if (missingObjects.length > 0) {
		appendSummary(`
### CubeFSRS initial migration baseline (production)

- Result: \`failed\`
- Action: production has a partial initial CubeFSRS schema but ${INITIAL_MIGRATION_VERSION} is not recorded; inspect before retrying.
- Missing objects: \`${missingObjects.join("`, `")}\`
`);
		fail(
			`Production has a partial CubeFSRS initial schema but ${INITIAL_MIGRATION_VERSION} is not recorded. Missing: ${missingObjects.join(", ")}`,
		);
	}

	psql(
		databaseUrl,
		`INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES (${sqlLiteral(INITIAL_MIGRATION_VERSION)}, ${sqlLiteral(INITIAL_MIGRATION_NAME)})
ON CONFLICT (version) DO NOTHING`,
		{ label: "record initial CubeFSRS migration baseline" },
	);

	appendSummary(`
### CubeFSRS initial migration baseline (production)

- Result: \`recorded existing schema\`
- Migration: \`${INITIAL_MIGRATION_VERSION} ${INITIAL_MIGRATION_NAME}\`
- Reason: expected baseline schema objects already exist, but the migration ledger did not record the initial migration.
`);
}

function run(command, args, options = {}) {
	console.log(`Running ${options.label ?? command}...`);
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const stdout = result.stdout ?? "";
	const stderr = result.stderr ?? "";
	if (stdout) process.stdout.write(stdout);
	if (stderr) process.stderr.write(stderr);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${options.label ?? command} failed with exit code ${result.status}`,
		);
	}
	return `${stdout}\n${stderr}`;
}

function classifyMigrationOutput(output) {
	if (/Applying \d{14} /i.test(output)) return "applied migrations";
	if (/skip: \d{14} .*already applied/i.test(output)) {
		return "skipped: no pending migrations";
	}
	return "unknown";
}

function main() {
	const { targetEnv } = parseArgs(process.argv.slice(2));
	const databaseUrl = requireEnv("DATABASE_URL");
	const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
	if (!supabaseUrl) fail("Missing SUPABASE_URL or VITE_SUPABASE_URL.");

	mask(databaseUrl);
	assertTargetEnvironment({ targetEnv, databaseUrl, supabaseUrl });
	baselineExistingProductionInitialMigration(databaseUrl, targetEnv);

	const repoRoot = process.cwd();
	const rhizomeRepo = findRhizomeRepo(repoRoot);
	const scriptPath = join(rhizomeRepo, "scripts", "db-push-local.sh");
	if (!existsSync(scriptPath)) {
		fail(`Missing rhizome migration runner: ${scriptPath}`);
	}
	appendSummary(`
### CubeFSRS migration preflight (${targetEnv})

- Rhizome runner: \`${scriptPath}\`
`);

	try {
		const pushOutput = run(BASH, [scriptPath, "--migrations-only", repoRoot], {
			label: `${targetEnv} cubefsrs schema push`,
			env: { ...process.env, DB_URL: databaseUrl },
		});
		const status = classifyMigrationOutput(pushOutput);
		if (status === "unknown") {
			appendSummary(`
### CubeFSRS schema push (${targetEnv})

- Result: \`unknown output format\`
- Action: workflow failed closed; update schema-push output parsing before retrying.
`);
			fail(
				"CubeFSRS schema push completed, but the output format was not recognized. Failing closed.",
			);
		}
		appendSummary(`
### CubeFSRS schema push (${targetEnv})

- Result: \`${status}\`
`);
	} catch (err) {
		appendSummary(`
### CubeFSRS schema push (${targetEnv})

- Result: \`failed\`
- Action: inspect \`supabase_migrations.schema_migrations\` and the \`cubefsrs\` schema before retrying.
`);
		fail(err instanceof Error ? err.message : String(err));
	}
}

main();
