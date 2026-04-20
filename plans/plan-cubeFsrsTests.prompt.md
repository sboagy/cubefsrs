# Plan: CubeFSRS Test Suite (Issue #3)

**TL;DR:** Build a complete test suite for CubeFSRS with Playwright E2E tests (mirroring TuneTrees' architecture where applicable) and Vitest unit tests. The primary technical challenge is mocking `<twisty-player>` (a WebGL custom element from `cubing.js`). Tests will run against both the dev server (port 5174) and the sync worker (port 8787). The same 8 TuneTrees test users are reused as shared workspace test identities against the single shared local Supabase instance used in dev; CubeFSRS does not provision or reset them with a full local Supabase reset.

---

## Key Decisions

- **twisty-player E2E:** use an app-owned `TwistyPlayer` construction helper shared by `CubeViewer` and `CaseThumb`; in test mode it returns a stub element with `data-testid="twisty-player-stub"` instead of constructing a real WebGL viewer
- **twisty-player unit:** `vi.mock('cubing/alg')` + `vi.mock('cubing/twisty')` entirely
- **`__cfTestApi`:** Attach in `onAuthStateChange` gated on `import.meta.env.MODE === 'test'`; the app is started manually for E2E with `npm run dev:test` so the guard is satisfied without any `.env` flag, and Playwright's app `webServer` uses that same command when it needs to launch or verify the server
- **anonymous users:** Supabase Anonymous Sign-In provides a real `userId` and fires `onAuthStateChange`, so `__cfTestApi` attaches for anonymous sessions identically to registered sessions — no separate cleanup path needed, provided the active shared local Supabase instance has anonymous auth enabled
- **test users:** Reuse TuneTrees users (alice…iris @tunetrees.test) as shared workspace test identities; in local dev both apps authenticate against one shared Supabase instance, while in CI each app workflow gets its own isolated Supabase instance. The shared auth bootstrap and Playwright auth-state refresh flow are owned by Rhizome, while CubeFSRS only consumes those users and the 1Password-injected `ALICE_TEST_PASSWORD`
- **Supabase reset scope:** CubeFSRS never runs a full `supabase db reset` as part of its normal E2E reset flow; `RESET_DB=true` clears only CubeFSRS-owned rows in the `cubefsrs` schema (`user_alg_selection`, `fsrs_card_state`, `sync_push_queue`), and the global catalog tables (`alg_category`, `alg_subset`, `alg_case`) are **never** touched
- **Rhizome-owned auth reset helper:** the CubeFSRS `db:local:reset` flow delegates to a Rhizome-owned helper for the shared auth-state/bootstrap portion of the workflow; full shared-environment resets remain separate Rhizome concerns and are out of scope for this plan
- **local dev prerequisites:** Supabase is started manually before running E2E tests; the app dev server is started manually with `npm run dev:test` so `MODE === 'test'` is guaranteed when Playwright reuses the existing server; `playwright.config.ts` includes `webServer` entries for the app (5174) and worker (8787) only, with the app entry using the same `npm run dev:test` command and the worker entry using the normal worker dev command — no `supabase start` in webServer
- **worker:** Run alongside dev server from the start (sync tests included)
- **BLE tests:** Out of scope — no Bluetooth/GAN device integration tests; BLE unit tests are also skipped (would require reverse-engineering GATT UUIDs and byte payloads for a hardware mock)
- **Rhizome testids:** Flag as cross-repo requirement; plan includes data-testid additions needed

---

## Key App Facts

- Dev server port: **5174** (not 5173 — set in `vite.config.ts`)
- Local Supabase model: **one shared local Supabase instance** is used during workspace development; app-level `supabase/config.toml` files are not the source of truth for the shared E2E workflow. In CI, each app workflow starts its own isolated Supabase instance in its own job.
- Worker port: **8787**
- Local database is **SQLite WASM in the browser** via `sql.js` + oosync browser runtime, persisted in IndexedDB; tests cannot reach it as a normal host SQLite file and must go through app-side APIs
- IndexedDB name: `cubefsrs-storage`
- Routes: `/login`, `/` (PracticeView), `/library` (AlgLibraryView), `/new`, `/options`, `/help`, `/build`
- WebGL rendering is driven by direct `TwistyPlayer` construction from `cubing/twisty` in both `CubeViewer` and `CaseThumb`
- `LoginPage` from `@rhizome/core` has `id="login-email"` and `id="login-password"` but **no** `data-testid`
- `DbStatusDropdown` from `@rhizome/core` has **no** `data-testid`
- Runtime data flow is: Supabase Postgres → worker → oosync sync engine → SQLite WASM → store loaders → Solid stores → UI
- Anonymous-auth prerequisite: the active shared local Supabase instance used for E2E must have anonymous sign-in enabled if anonymous tests are included in the run

---

## Phase 0: Package & Config Bootstrap

### Steps

1. Add devDependencies to `package.json`: `@playwright/test`, `@solidjs/testing-library`, `vitest`, `jsdom`, `@vitest/coverage-v8`, `loglevel`, `@testing-library/user-event`
2. Add test scripts to `package.json` (mirror TuneTrees script names):
   - `"dev:test": "FORCE_COLOR=1 op run --env-file=\".env.local.template\" -- vite --mode test"`
   - `"test": "vitest run"`
   - `"test:unit": "vitest run tests/"`
   - `"test:e2e": "playwright test --reporter=list"`
   - `"test:e2e:headed": "playwright test --headed"`
   - `"test:e2e:debug": "playwright test --debug"`
   - `"test:e2e:report": "playwright test --reporter=html"`
   - `"db:local:reset": "playwright clear-cache && <delegate to Rhizome-owned auth reset helper> && RESET_DB=true playwright test --reporter=list e2e/setup/auth.setup.ts --project=setup"`
   - The CubeFSRS `db:local:reset` script must not call `supabase db reset`; it delegates shared auth-state/bootstrap work to Rhizome and then runs only the CubeFSRS-scoped cleanup/setup path
3. Create `vitest.config.ts` — jsdom environment, path aliases matching `vite.config.ts` (`@` → `./src`), include `tests/**/*.test.ts(x)`
4. Create `playwright.config.ts` — mirrors TuneTrees `playwright.config.ts` exactly:
   - `baseURL` port 5174
   - `webServer` entries for **app dev server** (`npm run dev:test`, port 5174) and **sync worker** (port 8787) **only** — Supabase is a manual prerequisite, not managed by Playwright
   - Running the app via `dev:test` ensures `import.meta.env.MODE === 'test'` in the app so `__cfTestApi` is attached; because Playwright may reuse an already-running app server, the manually started app server must also use `npm run dev:test`
   - Projects: `setup`, `chromium-auth`, `chromium`; per-worker storageState via fixture; `fullyParallel: false`, `workers: 8`
   - `ALICE_TEST_PASSWORD` env var must be set (same value as TuneTrees) for auth setup to succeed
5. Create `e2e/.gitignore` — ignore `.auth/**`

**Relevant files:**
- `package.json` — add deps + scripts
- `vitest.config.ts` — new file
- `playwright.config.ts` — new file
- `e2e/.gitignore` — new file

---

## Phase 1: App-Side Test API (`__cfTestApi`)

This is the CubeFSRS equivalent of TuneTrees' `__ttTestApi`. Follow TuneTrees' approach **exactly**: attach inside the Supabase `onAuthStateChange` handler (or the equivalent `CubeAuthProvider` callback that fires for every auth state change), gated on `import.meta.env.MODE === 'test'`. For local E2E runs, the app is started manually with `npm run dev:test`, and Playwright's app `webServer` uses that same command; this avoids the mismatch where Playwright reuses a non-test-mode server. Because Supabase Anonymous Sign-In fires a real `onAuthStateChange` event with a valid `userId`, anonymous E2E sessions attach `__cfTestApi` automatically — no separate path needed.

### Steps

1. Create `src/lib/e2e-test-api.ts` — defines a `CfTestApi` interface and `attachCfTestApi(db, userId)` function exposing `window.__cfTestApi` as the only supported E2E mutation boundary for browser-local SQLite WASM state:
   - `attachCfTestApi(...)` must accept a second argument for CubeAuthProvider-owned sync/runtime controls rather than trying to discover them indirectly after attachment
   - `dispose()` — closes the sql.js DB handles (calls `closeDb()`)
   - `rehydrateStores()` — reloads the Solid stores from SQLite WASM using the same loader path used during sign-in (`loadAlgsFromDb`, `loadFsrsFromDb`, `loadPracticeFromDb`, `loadUserSettingsFromDb`)
   - `seedAlgSelection({ caseIds: string[] })` — inserts rows into `userAlgSelection` for the current user inside a local-only setup wrapper that suppresses sync triggers, clears any residual `sync_push_queue` rows, then calls `rehydrateStores()` before returning
   - `seedFsrsCardState({ caseId, dueOffsetDays, reps?, state? })` — inserts into `fsrsCardState` with a calculated due timestamp inside the same local-only setup wrapper, then calls `rehydrateStores()` before returning
   - `clearUserData()` — deletes all rows in user-owned tables for the current user (clean slate before each test) inside the same local-only setup wrapper, then calls `rehydrateStores()` before returning
   - Local-only setup wrapper contract: pause auto-sync, wait for sync idle, suppress sync triggers on the raw SQLite instance, execute the setup writes, clear/verify `sync_push_queue` is empty, re-enable triggers, persist the SQLite WASM DB, then rehydrate stores
   - `pauseAutoSync()` / `resumeAutoSync()` — deterministic test controls for background sync, so sync assertions do not race the normal auto-sync loop
   - `forceSyncUp()` — explicit upload trigger for sync tests
   - `waitForSyncIdle(timeoutMs?)` — waits until no sync operation is in progress before proceeding
   - `getSyncOutboxCount()` — returns the current pending `sync_push_queue` row count for deterministic sync assertions
   - `getPracticeQueueCount()` — returns count of due FSRS cards
   - `getSelectedCaseIds()` — returns current `userAlgSelection` row IDs
   - E2E tests do **not** mutate a host SQLite file directly; all deterministic local setup flows through `__cfTestApi`, which writes SQLite WASM state and then reloads Solid stores so the UI reflects the seeded state immediately
   - Sync tests do **not** rely on ambient auto-sync timing; they use the explicit sync-control methods above to separate local enqueue assertions from remote upload assertions
2. Edit `src/components/auth/CubeAuthProvider.tsx` — in the `onAuthStateChange` callback (or equivalent lifecycle hook), after DB init completes, conditionally call `attachCfTestApi(db, userId, controls)` when `import.meta.env.MODE === 'test'`
   - `controls` must be constructed directly in `CubeAuthProvider` from the active `SyncService` and SQLite runtime for the signed-in user: `pauseAutoSync` delegates to `svc.stopAutoSync()`, `resumeAutoSync` delegates to `svc.startAutoSync()`, `forceSyncUp` delegates to `svc.syncUp()`, and `waitForSyncIdle` polls `svc.syncing` until false
   - The same `controls` object should expose access to the raw SQLite instance plus trigger-control helpers needed for local-only setup writes, so setup mutations never populate `sync_push_queue`
   - This covers both registered sign-in and anonymous sign-in (both trigger `onAuthStateChange` with a real `userId`)
   - Mirrors TuneTrees' approach exactly — do not create a separate branch for anonymous users
3. No environment flag needed — `MODE === 'test'` comes from starting the app with `npm run dev:test`; developers do not need to add a separate `.env` switch for this feature, but they must use the test-mode dev script for manual E2E startup

**Relevant files:**
- `src/lib/e2e-test-api.ts` — new file
- `src/components/auth/CubeAuthProvider.tsx` — add test API attachment in auth state change handler

---

## Phase 2: TwistyPlayer Stub

**The primary technical challenge.** CubeFSRS uses `TwistyPlayer` from `cubing/twisty`, and the app constructs it directly with `new TwistyPlayer(...)` in both `CubeViewer` and `CaseThumb`. Because of that, E2E stubbing cannot rely only on intercepting `<twisty-player>` custom-element registration; the stable seam is the app-owned construction boundary.

### Steps

1. Create `src/lib/twisty/createTwistyPlayerMount.ts` (or equivalent app-local helper):
   - Exports a single construction helper used by both `CubeViewer` and `CaseThumb`
   - In normal mode, constructs and returns the real `TwistyPlayer` element with the existing config
   - In test mode, returns a simple stub `HTMLDivElement` marked with `data-testid="twisty-player-stub"` and skips WebGL initialization entirely
   - This helper becomes the only supported E2E seam for twisty rendering in CubeFSRS

2. Edit `src/components/practice/CubeViewer.tsx` and `src/components/practice/CaseThumb.tsx`:
   - Replace direct `new TwistyPlayer(...)` construction with the shared helper
   - Preserve the current real-player behavior in normal mode
   - Ensure the stub element mounts into the same DOM position in test mode so layout and visibility assertions remain stable

3. Create `e2e/helpers/twisty-stub.ts`:
   - Exports `addTwistyStub(page: Page): Promise<void>`
   - Uses `page.addInitScript(...)` only to establish any minimal test-mode flag needed by the app-owned helper before app modules execute
   - Does **not** rely on `customElements.define` interception as the primary stub mechanism

4. Integrate into `e2e/helpers/test-fixture.ts` as an always-on `autoStubTwisty` fixture (similar to `autoCleanupDb`) so every E2E test gets it automatically with no per-test boilerplate.

5. For unit tests, create `tests/__mocks__/cubing/alg.ts` and `tests/__mocks__/cubing/twisty.ts`:
   - `TwistyPlayer` becomes a no-op class
   - `Alg.fromString()` returns a minimal stub with `.invert().toString()` support

**Relevant files:**
- `src/lib/twisty/createTwistyPlayerMount.ts` — new file
- `src/components/practice/CubeViewer.tsx` — edit to use helper
- `src/components/practice/CaseThumb.tsx` — edit to use helper
- `e2e/helpers/twisty-stub.ts` — new file
- `e2e/helpers/test-fixture.ts` — integrate auto fixture
- `tests/__mocks__/cubing/alg.ts` — new file
- `tests/__mocks__/cubing/twisty.ts` — new file

---

## Phase 3: E2E Test Infrastructure

*All files parallel TuneTrees' `e2e/` layout. Key differences: no `repertoireId` concept, a single shared local Supabase instance in dev, and dev port 5174.*

### Steps

1. **`e2e/test-config.ts`** — `export const BASE_URL = 'http://localhost:5174'`

2. **`e2e/helpers/test-users.ts`** — same 8 users as TuneTrees (alice, bob, dave, eve, frank, grace, henry, iris at `@tunetrees.test`) but **without** `repertoireId`; import user IDs from `tests/fixtures/test-data.ts`

3. **`e2e/helpers/test-fixture.ts`** — extends Playwright `test` base with:
   - `autoCleanupDb` fixture (`auto: true`) — after each test, navigates to CF origin, calls `__cfTestApi.dispose()`, deletes `cubefsrs-storage` IndexedDB with exponential-backoff retry (same pattern as TuneTrees)
   - `autoStubTwisty` fixture (`auto: true`) — calls `addTwistyStub(page)` before each test
   - `testUser` / `testUserKey` fixtures — worker-index → test user mapping via `getTestUserByWorkerIndex()`
   - `storageState` override — per-worker `.auth/<key>.json` with freshness check (7-day expiry, CI skip)
   - Console log capture attached to test report

4. **`e2e/helpers/local-db-lifecycle.ts`** — `clearCubefsrsClientStorage(page)` and `gotoCfOrigin(page)` targeting `http://localhost:5174/`

5. **`e2e/helpers/alg-scenarios.ts`** — analogue to TuneTrees' `practice-scenarios.ts`:
   - `setupDeterministicTestParallel(page, testUser, opts)` — the base setup function; clears user data and optionally seeds cases through `__cfTestApi`. Because `__cfTestApi` performs setup writes with sync triggers suppressed, clears/verifies `sync_push_queue`, persists the DB, and rehydrates stores internally, the rendered UI reflects the seeded SQLite WASM state without leaving setup pollution in the outbox; called in `beforeEach` of most tests
   - `setupForLibraryTestsParallel(page, testUser, opts)` — navigates to `/library`, seeds N selected cases
   - `setupForPracticeTestsParallel(page, testUser, opts)` — seeds FSRS due cards; navigates to `/`
   - `seedAlgSelectionLocally(page, opts)` — thin wrapper over `window.__cfTestApi.seedAlgSelection()`
   - `seedFsrsCardLocally(page, opts)` — thin wrapper over `window.__cfTestApi.seedFsrsCardState()`
   - `clearCubefsrsStorageDB(page, opts)` — IndexedDB delete + sessionStorage/localStorage clear with retry logic (mirrors TuneTrees' `clearTunetreesStorageDB`)

6. **`e2e/helpers/clock-control.ts`** — adapt from TuneTrees (same FSRS time-travel pattern, fake timers)

7. **`e2e/helpers/network-control.ts`** — adapt from TuneTrees (route interception for offline simulation)

8. **`e2e/helpers/fsrs-test-config.ts`** — FSRS test parameter overrides for deterministic scheduling

9. **`e2e/setup/auth.setup.ts`** — runs once before all tests:
   - Checks freshness of `e2e/.auth/alice.json` (representative auth file; 7-day expiry)
   - **Rhizome helper boundary:** shared local auth-state/bootstrap work is invoked via the Rhizome-owned helper; `auth.setup.ts` does not perform a full database reset and does not own cross-app environment resets
   - **`RESET_DB=true` scope:** when set, only clears CubeFSRS-owned rows in the `cubefsrs` schema (`user_alg_selection`, `fsrs_card_state`, `sync_push_queue`); the global catalog tables (`alg_category`, `alg_subset`, `alg_case`) are **never** touched and no non-CubeFSRS schemas are modified
   - **Supabase is a manual prerequisite** — auth setup does not call `supabase start`; the developer must have the shared local Supabase instance running before tests. In CI, the app workflow starts its own isolated local Supabase instance inside that job.
   - Reads `ALICE_TEST_PASSWORD` env var (same as TuneTrees, injected from 1Password) — all 8 shared workspace test users share this password
   - Regenerates CubeFSRS auth state for each of the 8 shared test users and saves it to `e2e/.auth/<key>.json`
   - Waits for any initial sync startup work to reach an idle state before saving auth state, so later tests begin from a known sync baseline
   - Targets CubeFSRS login page at `/login`; uses `#login-email`, `#login-password`, `getByRole('button', { name: 'Sign In' })` until Rhizome gets `data-testid` attributes

10. **`e2e/page-objects/CubeFSRSPage.ts`** — page object model:
    - **Sidebar nav:** `practiceLink`, `libraryLink`, `newAlgLink`, `optionsLink`, `deviceConnectButton`, `signOutButton`
    - **Auth (from Rhizome LoginPage):** `emailInput` (`#login-email`), `passwordInput` (`#login-password`), `signInButton`, `anonymousButton` (role/text fallback until Rhizome gets testids)
    - **PracticeView:** `emptyStateMessage`, `algorithmText`, `cubeViewerStub` (`[data-testid="twisty-player-stub"]`), `gradeBarAgain`, `gradeBarHard`, `gradeBarGood`, `gradeBarEasy`
   - **LibraryView:** `categorySelect` (`#category-select`), `subsetCheckbox(name)`, `orderingStrategyRadio(nameOrValue)`, `caseTile(idOrName)`, `caseEnabledCheckbox(idOrName)`, `reviewNowButton(idOrName)`
   - **LibraryView notes:** the current CubeFSRS UI uses a category `<select>`, subset checkboxes, ordering-strategy radio inputs, and case tiles with `Enabled` checkboxes and `Review Now` buttons; it does **not** have a clickable category list, a strategy `<select>`, or a selected-count badge
    - **DbStatus:** `dbStatusButton`, `dbStatusText`
    - **Helpers:** `waitForHome()`, `navigateToLibrary()`, `navigateToPractice()`, `signIn(email, password)`

11. **`scripts/generate-auth-states.ts`** — generates `.auth/<key>.json` for all 8 shared test users after the Rhizome-owned auth reset helper has prepared the shared auth/bootstrap state for the local workspace

**Relevant files:**
- All files under `e2e/` listed above
- `scripts/generate-auth-states.ts`

---

## Phase 4: Unit Test Infrastructure

### Steps

1. Create `tests/tsconfig.json` — extends root tsconfig, adds `@solidjs/testing-library` types
2. Create `tests/fixtures/test-data.ts` — hardcoded UUIDs matching the Supabase seed:
   - `TEST_USER_ALICE_ID`, `TEST_USER_BOB_ID`, … (same values as TuneTrees `tests/fixtures/test-data.ts`)
   - `CATALOG_CASE_PLL_T_ID`, `CATALOG_CASE_OLL_1_ID`, … (UUIDs from `supabase/seeds/01_global_catalog.sql`)
3. Create `tests/__mocks__/cubing/alg.ts` — mock `Alg` class with `fromString`, `invert`, `toString`
4. Create `tests/__mocks__/cubing/twisty.ts` — mock `TwistyPlayer` as a no-op HTMLElement subclass

**Relevant files:**
- `tests/tsconfig.json`
- `tests/fixtures/test-data.ts`
- `tests/__mocks__/cubing/alg.ts`
- `tests/__mocks__/cubing/twisty.ts`

---

## Phase 5: E2E Tests — First Wave

*All tests follow the standard template from `e2e/AGENTS.md`: `describe → beforeEach(setupFn) → test`.*

1. **`e2e/tests/auth-001-signin.spec.ts`** — sign in as Alice via login form; verify sidebar visible; verify `/` route loaded. Runs in `chromium-auth` project (no stored auth state).
2. **`e2e/tests/auth-002-anonymous.spec.ts`** — click "Use on this Device Only"; verify app loads without login; sidebar shows `?` avatar.
3. **`e2e/tests/library-001-category-selection.spec.ts`** — logged in as Alice; navigate to library; verify `#category-select` contains `OLL`, `PLL`, `F2L`; change the selected category to `OLL`; verify the subset checkbox list updates for that category.
4. **`e2e/tests/library-002-case-selection.spec.ts`** — seed 2 cases selected via `__cfTestApi`; navigate to library; select the relevant category in `#category-select`; verify those case tiles show `Enabled` checked; toggle one case off via its `Enabled` checkbox or tile interaction; verify the checkbox state updates and, optionally, confirm the selected IDs via `__cfTestApi.getSelectedCaseIds()`.
5. **`e2e/tests/practice-001-empty-state.spec.ts`** — clear all FSRS cards; navigate to `/`; verify empty-state message visible (no due cards message).
6. **`e2e/tests/practice-002-algorithm-display.spec.ts`** — seed 1 FSRS card due now; navigate to `/`; verify algorithm text visible (e.g. `R U R' U'`); verify cube viewer stub renders.
7. **`e2e/tests/offline-001-device-mode.spec.ts`** — anonymous sign-in; simulate offline with `networkControl.goOffline()`; verify app remains functional in local-only mode.

---

## Phase 6: FSRS & Scheduling E2E Tests *(depends on Phase 5)*

1. **`e2e/tests/practice-003-grading.spec.ts`** — seed 1 due card; navigate to practice; click each of the 4 grade buttons (separate `test` blocks); verify FSRS queue count updates after grading.
2. **`e2e/tests/fsrs-001-basic-progression.spec.ts`** — seed 1 card scheduled in the past; grade Good; advance clock to next due date; verify card appears due again; assert interval ≥ 1 day and due > reviewed.
3. **`e2e/tests/sync-001-basic-push.spec.ts`** — deterministic two-phase sync test:
   - wait for initial sync idle
   - verify `__cfTestApi.getSyncOutboxCount()` is zero before performing the user action, confirming setup mutations did not pollute the outbox
   - pause auto-sync via `__cfTestApi`
   - grade a card
   - query `sync_push_queue` via `__cfTestApi.getSyncOutboxCount()` and verify a pending row exists
   - verify DB status indicator in the sidebar shows pending sync state while auto-sync is paused
   - trigger `__cfTestApi.forceSyncUp()`
   - wait for `__cfTestApi.waitForSyncIdle()`
   - verify the pending row count drains to zero
   - resume auto-sync before test teardown

---

## Phase 7: Unit Tests *(parallel with Phases 5 & 6)*

*Note: BLE device integration tests are **out of scope**. Simulating a GAN/Giiker cube via `web-bluetooth-mock` would require reverse-engineering GATT service UUIDs and characteristic byte payloads, effectively testing a third-party library more than app code. Skip all `tests/services/ganBluetooth.test.ts` work.*

1. **`tests/lib/orientationMap.test.ts`** — pure function unit tests for `mapTokenByZ2()` and quaternion-to-token mapping
2. **`tests/lib/cubeState.test.ts`** — pure function tests for cube state manipulation helpers in `src/lib/cubeState.ts`
3. **`tests/services/fsrs.test.ts`** — scheduler pure functions: `createInitialState`, `review`, `pickNextDue`
4. **`tests/stores/algs.test.ts`** — in-memory SQLite (sql.js or better-sqlite3) + Drizzle; test `toggleCase`, `selectSubset`, `deselectSubset`, `isSelected`
5. **`tests/stores/fsrs.test.ts`** — `ensureCard`, `refreshQueue`, `popNext` with in-memory DB and mocked cubing imports (`cubing/alg` and `cubing/twisty` mocks from `tests/__mocks__/`)

---

## Phase 8: Rhizome Changes ⚠️ *Requires Rhizome Worktree*

These changes are needed for reliable, selector-stable E2E tests. The `@rhizome/core` `LoginPage` and `DbStatusDropdown` components currently have zero `data-testid` attributes.

**`rhizome/src/auth/LoginPage.tsx`** — add:
- `data-testid="login-email-input"` on the email `<input id="login-email">`
- `data-testid="login-password-input"` on the password `<input id="login-password">`
- `data-testid="login-submit-button"` on the Sign In / Sign Up `<button type="submit">`
- `data-testid="login-anonymous-button"` on the "Use on this Device Only" `<button>`

**`rhizome/src/sync/DbStatusDropdown.tsx`** — add:
- `data-testid="db-status-trigger"` on the dropdown trigger button
- `data-testid="db-status-text"` on the status text span

*Note: Until Rhizome changes land and are published / yalc-linked, tests can use `#login-email`, `#login-password`, and `getByRole('button', { name: 'Sign In' })` as fallback selectors. Document this in `e2e/README.md`.*

---

## Further Considerations

1. **`CaseThumb` and `CubeViewer` both construct `TwistyPlayer` directly** — the E2E stub must cover the direct constructor path, not only custom-element registration. The durable solution is an app-owned helper used by both components; any `addInitScript` logic is only there to enable the helper in test mode, not to replace constructor interception by itself.

2. **Local dev uses one shared Supabase instance** — the workspace E2E workflow assumes a single shared local Supabase instance in Docker Desktop for both apps, so the reused test users authenticate against the same local `auth.users` table during development. In CI, each app workflow runs in isolation with its own Supabase instance. The CubeFSRS `db:local:reset` flow still performs only CubeFSRS schema-scoped cleanup, while the shared auth-state/bootstrap helper is owned by Rhizome. No CubeFSRS test reset path should run `supabase db reset`.

3. **No `repertoireId` analogue** — TuneTrees test-users carry a `repertoireId` because practice queue state is seeded per-repertoire. CubeFSRS has no repertoire concept; test user data is purely scoped to `userId`. The `alg-scenarios.ts` helpers seed directly by `userId`. Per-test isolation is simpler: call `clearUserData()` via `setupDeterministicTestParallel` in `beforeEach`.

4. **Anonymous user isolation** — Anonymous tests should use a dedicated (non-worker-indexed) session context to avoid contaminating the authenticated worker slots. Consider a separate `alg-scenarios-anon.ts` or handling in the fixture.

5. **Category/case IDs from seed** — The global catalog is seeded from `supabase/seeds/01_global_catalog.sql` with stable UUIDs. Tests that reference specific cases (e.g., PLL-T, OLL-1) should use constants from `tests/fixtures/test-data.ts` keyed to those seed UUIDs, not rely on database auto-assign.

6. **SQLite WASM and store hydration are part of the architecture** — CubeFSRS uses browser-local SQLite WASM persisted in IndexedDB, not a normal host SQLite file. The UI renders from Solid stores, not directly from SQLite queries. Therefore any deterministic E2E seeding must both write SQLite WASM state through `__cfTestApi` and reload the stores before assertions. The remote sync path remains Supabase Postgres → worker → oosync → SQLite WASM, while the local deterministic test setup path is Playwright → `__cfTestApi` → SQLite WASM → store loaders → Solid stores.

7. **Sync tests need explicit control boundaries** — because CubeFSRS starts background auto-sync during sign-in, tests that assert outbox state cannot rely on ambient timing. Deterministic sync tests must use `__cfTestApi` sync controls such as `pauseAutoSync()`, `forceSyncUp()`, `waitForSyncIdle()`, and `getSyncOutboxCount()` to separate “local write queued” from “remote upload completed”.

8. **Library E2E selectors must match the actual CubeFSRS UI** — the current library screen uses a category `<select>` (`#category-select`), subset checkboxes, ordering-strategy radio inputs, and per-case `Enabled` checkboxes / `Review Now` buttons. It does not currently expose a clickable category list, a strategy `<select>`, or a selected-count badge. The page object and tests should model the current UI on disk rather than TuneTrees-specific control shapes.

---

## Verification

1. `npm run typecheck` — zero errors after all changes
2. `npm run test:unit` — all 5 unit test files pass
3. `npm run test:e2e` (with the shared local Supabase instance already running in dev, or the app workflow's isolated Supabase instance running in CI) — auth setup + Phase 5 tests pass
4. Playwright console capture shows no WebGL errors (confirms twisty stub is active)
5. `RESET_DB=true npx playwright test --project=setup` — all 8 auth files regenerated cleanly

---

## Files to Create / Edit (Summary)

### Root (cubefsrs worktree)
| File | Action |
|---|---|
| `package.json` | Edit — add deps + scripts |
| `vitest.config.ts` | Create |
| `playwright.config.ts` | Create |

### `e2e/`
| File | Action |
|---|---|
| `.gitignore` | Create |
| `test-config.ts` | Create |
| `helpers/test-users.ts` | Create |
| `helpers/test-fixture.ts` | Create |
| `helpers/local-db-lifecycle.ts` | Create |
| `helpers/alg-scenarios.ts` | Create |
| `helpers/twisty-stub.ts` | Create |
| `helpers/clock-control.ts` | Create (adapt from TuneTrees) |
| `helpers/network-control.ts` | Create (adapt from TuneTrees) |
| `helpers/fsrs-test-config.ts` | Create |
| `setup/auth.setup.ts` | Create |
| `page-objects/CubeFSRSPage.ts` | Create |
| `tests/auth-001-signin.spec.ts` | Create |
| `tests/auth-002-anonymous.spec.ts` | Create |
| `tests/library-001-category-selection.spec.ts` | Create |
| `tests/library-002-case-selection.spec.ts` | Create |
| `tests/practice-001-empty-state.spec.ts` | Create |
| `tests/practice-002-algorithm-display.spec.ts` | Create |
| `tests/offline-001-device-mode.spec.ts` | Create |
| `tests/practice-003-grading.spec.ts` | Create |
| `tests/fsrs-001-basic-progression.spec.ts` | Create |
| `tests/sync-001-basic-push.spec.ts` | Create |

### `tests/`
| File | Action |
|---|---|
| `tsconfig.json` | Create |
| `fixtures/test-data.ts` | Create |
| `__mocks__/cubing/alg.ts` | Create |
| `__mocks__/cubing/twisty.ts` | Create |
| `lib/orientationMap.test.ts` | Create |
| `lib/cubeState.test.ts` | Create |
| `services/fsrs.test.ts` | Create |
| `stores/algs.test.ts` | Create |
| `stores/fsrs.test.ts` | Create |

### `src/` (app-side changes)
| File | Action |
|---|---|
| `src/lib/e2e-test-api.ts` | Create |
| `src/components/auth/CubeAuthProvider.tsx` | Edit — attach `__cfTestApi` after DB init |
| `src/lib/twisty/createTwistyPlayerMount.ts` | Create |
| `src/components/practice/CubeViewer.tsx` | Edit — replace direct `TwistyPlayer` construction with helper |
| `src/components/practice/CaseThumb.tsx` | Edit — replace direct `TwistyPlayer` construction with helper |

### `scripts/`
| File | Action |
|---|---|
| `scripts/generate-auth-states.ts` | Create |

### Rhizome *(cross-repo — requires new worktree)*
| File | Action |
|---|---|
| `rhizome/package.json` | Edit — add shared auth reset helper script consumed by CubeFSRS `db:local:reset` |
| `rhizome/scripts/reset-local-test-auth-states.ts` | Create — refresh shared local auth/bootstrap state without a full DB reset |
| `rhizome/src/auth/LoginPage.tsx` | Edit — add `data-testid` attributes |
| `rhizome/src/sync/DbStatusDropdown.tsx` | Edit — add `data-testid` attributes |

---

## Resolved Decisions

All questions from the initial planning pass have been answered. Decisions are incorporated throughout the phase steps above; this section is a quick-reference summary.

| # | Question | Decision |
|---|---|---|
| 1 | Supabase reset scope | CubeFSRS `db:local:reset` never runs `supabase db reset`; shared auth/bootstrap reset is delegated to a Rhizome helper, and `RESET_DB=true` clears only CubeFSRS-owned rows (`user_alg_selection`, `fsrs_card_state`, `sync_push_queue`) |
| 2 | Test user passwords | Reuse the 1Password-injected `ALICE_TEST_PASSWORD` env var for the shared workspace test identities |
| 3 | Worker/Supabase startup | All started manually; `playwright.config.ts` webServer covers app (`npm run dev:test`) + worker only — no supabase autostart |
| 4 | CaseThumb cubing imports | `CaseThumb` and `CubeViewer` both construct `TwistyPlayer` directly, so E2E stubbing uses a shared app-owned helper rather than custom-element interception alone |
| 5 | Bluetooth tests | Fully out of scope — BLE mock setup cost > benefit |
| 6 | Anonymous `__cfTestApi` attachment | Supabase Anonymous Sign-In fires `onAuthStateChange` with a real `userId`; attach `__cfTestApi` there for all user types with a single `import.meta.env.MODE === 'test'` guard, assuming the active Supabase instance used for the run has anonymous auth enabled |

**Overarching instruction:** Mirror TuneTrees' test harness and E2E architecture as closely as possible where the underlying app/runtime shape matches. Deliberate CubeFSRS-specific differences include the app-owned `TwistyPlayer` stub seam, the absence of a `repertoireId` concept, the Rhizome-owned auth reset helper, the single shared local Supabase instance model in dev, and selectors that follow the current CubeFSRS UI rather than TuneTrees-specific control shapes.