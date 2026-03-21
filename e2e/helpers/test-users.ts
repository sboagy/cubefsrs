/**
 * e2e/helpers/test-users.ts
 *
 * Shared workspace test user definitions for CubeFSRS E2E tests.
 *
 * These 8 users are the same identities used by TuneTrees tests and
 * authenticate against the shared local Supabase instance in dev, or each
 * app workflow's own isolated Supabase instance in CI.
 *
 * CubeFSRS has no `repertoireId` concept — users are identified by `userId`
 * only. Test data is scoped purely to `userId`.
 */

import {
	TEST_USER_ALICE_EMAIL,
	TEST_USER_ALICE_ID,
	TEST_USER_BOB_EMAIL,
	TEST_USER_BOB_ID,
	TEST_USER_DAVE_EMAIL,
	TEST_USER_DAVE_ID,
	TEST_USER_EVE_EMAIL,
	TEST_USER_EVE_ID,
	TEST_USER_FRANK_EMAIL,
	TEST_USER_FRANK_ID,
	TEST_USER_GRACE_EMAIL,
	TEST_USER_GRACE_ID,
	TEST_USER_HENRY_EMAIL,
	TEST_USER_HENRY_ID,
	TEST_USER_IRIS_EMAIL,
	TEST_USER_IRIS_ID,
} from "../../tests/fixtures/test-data";

export type TestUser = {
	email: string;
	name: string;
	userId: string;
};

export const TEST_USERS: Record<string, TestUser> = {
	alice: {
		email: TEST_USER_ALICE_EMAIL,
		name: "Alice",
		userId: TEST_USER_ALICE_ID,
	},
	bob: {
		email: TEST_USER_BOB_EMAIL,
		name: "Bob",
		userId: TEST_USER_BOB_ID,
	},
	dave: {
		email: TEST_USER_DAVE_EMAIL,
		name: "Dave",
		userId: TEST_USER_DAVE_ID,
	},
	eve: {
		email: TEST_USER_EVE_EMAIL,
		name: "Eve",
		userId: TEST_USER_EVE_ID,
	},
	frank: {
		email: TEST_USER_FRANK_EMAIL,
		name: "Frank",
		userId: TEST_USER_FRANK_ID,
	},
	grace: {
		email: TEST_USER_GRACE_EMAIL,
		name: "Grace",
		userId: TEST_USER_GRACE_ID,
	},
	henry: {
		email: TEST_USER_HENRY_EMAIL,
		name: "Henry",
		userId: TEST_USER_HENRY_ID,
	},
	iris: {
		email: TEST_USER_IRIS_EMAIL,
		name: "Iris",
		userId: TEST_USER_IRIS_ID,
	},
};

/**
 * Assign test users to Playwright workers by index.
 * Workers 0–7 map to alice, bob, dave, eve, frank, grace, henry, iris.
 */
export function getTestUserByWorkerIndex(workerIndex: number): TestUser {
	const userKeys = Object.keys(TEST_USERS);
	const userKey = userKeys[workerIndex % userKeys.length];
	return TEST_USERS[userKey];
}
