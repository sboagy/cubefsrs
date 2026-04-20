/**
 * tests/fixtures/test-data.ts
 *
 * Hardcoded UUIDs for test fixtures. All UUIDs match the shared workspace
 * test users and the CubeFSRS global catalog seed in
 * `supabase/seeds/01_global_catalog.sql`.
 *
 * Test users are shared with TuneTrees — they authenticate against the same
 * shared local Supabase instance during development. Their UUIDs follow the
 * same convention as TuneTrees (`00000000-0000-4000-8000-00000000900x`).
 */

// ============================================================
// TEST USERS
// ============================================================

export const TEST_USER_ALICE_ID = "00000000-0000-4000-8000-000000009001";
export const TEST_USER_ALICE_EMAIL = "alice.test@tunetrees.test";

export const TEST_USER_BOB_ID = "00000000-0000-4000-8000-000000009002";
export const TEST_USER_BOB_EMAIL = "bob.test@tunetrees.test";

export const TEST_USER_DAVE_ID = "00000000-0000-4000-8000-000000009004";
export const TEST_USER_DAVE_EMAIL = "dave.test@tunetrees.test";

export const TEST_USER_EVE_ID = "00000000-0000-4000-8000-000000009005";
export const TEST_USER_EVE_EMAIL = "eve.test@tunetrees.test";

export const TEST_USER_FRANK_ID = "00000000-0000-4000-8000-000000009006";
export const TEST_USER_FRANK_EMAIL = "frank.test@tunetrees.test";

export const TEST_USER_GRACE_ID = "00000000-0000-4000-8000-000000009007";
export const TEST_USER_GRACE_EMAIL = "grace.test@tunetrees.test";

export const TEST_USER_HENRY_ID = "00000000-0000-4000-8000-000000009008";
export const TEST_USER_HENRY_EMAIL = "henry.test@tunetrees.test";

export const TEST_USER_IRIS_ID = "00000000-0000-4000-8000-000000009009";
export const TEST_USER_IRIS_EMAIL = "iris.test@tunetrees.test";

// ============================================================
// CATALOG CATEGORIES (from 01_global_catalog.sql)
// ============================================================

export const CATALOG_CATEGORY_PLL_ID = "25f97041-5a6a-5644-884d-8e3234cf6e29";
export const CATALOG_CATEGORY_OLL_ID = "33f387e4-7cfc-5de9-a1e2-6160d58373ed";
export const CATALOG_CATEGORY_2LOOK_PLL_ID =
	"fc9ae381-fea6-57a3-aedc-4339a2835720";
export const CATALOG_CATEGORY_2LOOK_OLL_ID =
	"0759f83f-2307-5134-84f8-38408e8114e2";
export const CATALOG_CATEGORY_F2L_ID = "a44996a0-3166-54a3-92c1-579a3a4c5323";

// ============================================================
// CATALOG SUBSETS (from 01_global_catalog.sql)
// ============================================================

export const CATALOG_SUBSET_PLL_ADJACENT_CORNERS_ID =
	"94ca7e8a-923e-54d2-877e-ddac411b481d";
export const CATALOG_SUBSET_OLL_T_SHAPE_ID =
	"ad3e3f7d-dcc1-585f-967c-831c4c0d64bd";

// ============================================================
// CATALOG CASES (from 01_global_catalog.sql)
// ============================================================

/** T Perm — PLL Adjacent Corners. Alg: (R U R' U') (R' F R2) (U' R' U') (R U R' F'') */
export const CATALOG_CASE_PLL_T_PERM_ID =
	"3bb546d5-0f08-5a9d-8063-9132813266c3";

/** OLL-33 Key/Shoelaces — OLL T-Shape. Alg: (R U R' U') (R' F R F') */
export const CATALOG_CASE_OLL_33_ID = "42479c02-beb7-5010-a5ef-dcb9216e176d";
