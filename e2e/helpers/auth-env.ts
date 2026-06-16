/**
 * e2e/helpers/auth-env.ts
 *
 * Shared auth-related environment variable helpers for E2E setup/tests.
 */

export function getRequiredTestPassword(context: string): string {
	const password =
		process.env.ALICE_TEST_PASSWORD ?? process.env.TEST_USER_PASSWORD;

	if (password && password.trim().length > 0) {
		return password;
	}

	throw new Error(
		`[${context}] Missing ALICE_TEST_PASSWORD or TEST_USER_PASSWORD. Set the shared test password env var before running E2E auth tests.`,
	);
}
