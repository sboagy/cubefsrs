import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Returns true when dirPath contains a package.json file.
 */
export function repoHasPackageJson(dirPath) {
  return existsSync(path.join(dirPath, "package.json"));
}

/**
 * Locate the rhizome repository root.
 *
 * Resolution order:
 * 1. RHIZOME_REPO_PATH environment variable (if it contains a package.json).
 * 2. Direct candidates relative to repoRoot:
 *    - <repoRoot>/rhizome
 *    - <repoRoot>/../rhizome
 *    - <repoRoot>/../../rhizome
 * 3. A single worktree under <repoRoot>/../../rhizome.worktrees.
 *
 * Throws when the rhizome repo cannot be located.
 */
export function findRhizomeRepo(repoRoot) {
  const envPath = process.env.RHIZOME_REPO_PATH;
  if (envPath && repoHasPackageJson(envPath)) {
    return envPath;
  }

  const parent = path.resolve(repoRoot, "..");
  const grandparent = path.resolve(repoRoot, "..", "..");
  const directCandidates = [
    path.join(repoRoot, "rhizome"),
    path.join(parent, "rhizome"),
    path.join(grandparent, "rhizome"),
  ];

  for (const candidate of directCandidates) {
    if (repoHasPackageJson(candidate)) {
      return candidate;
    }
  }

  const worktreesDir = path.join(grandparent, "rhizome.worktrees");
  if (existsSync(worktreesDir)) {
    const worktreeCandidates = readdirSync(worktreesDir)
      .map((entry) => path.join(worktreesDir, entry))
      .filter(repoHasPackageJson);
    if (worktreeCandidates.length === 1) {
      return worktreeCandidates[0];
    }
  }

  throw new Error(
    "Unable to locate the rhizome repository. Set RHIZOME_REPO_PATH to the rhizome repo root."
  );
}
