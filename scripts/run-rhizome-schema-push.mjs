import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { findRhizomeRepo } from "./lib/find-rhizome.mjs";

const APP_SCHEMA = "cubefsrs";
const BASH = "/bin/bash";

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
