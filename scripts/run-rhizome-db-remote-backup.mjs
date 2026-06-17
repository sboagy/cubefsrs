import { execSync, spawnSync } from "node:child_process";
import { findRhizomeRepo } from "./lib/find-rhizome.mjs";

function resolveBin(name) {
	const resolved = execSync(`command -v ${name}`, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	}).trim();
	if (!resolved) throw new Error(`Could not resolve binary: ${name}`);
	return resolved;
}

function main() {
	const rhizomeRepo = findRhizomeRepo(process.cwd());
	console.log(
		`[cubefsrs] Delegating remote DB backup to rhizome at ${rhizomeRepo}`,
	);

	const result = spawnSync(
		resolveBin("npm"),
		["run", "db:remote:backup", "--", ...process.argv.slice(2)],
		{ cwd: rhizomeRepo, stdio: "inherit" },
	);

	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

main();
