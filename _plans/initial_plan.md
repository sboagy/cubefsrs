# CubeFSRS → Supabase Migration: Initial Plan

**Status**: Active — All questions resolved. Ready for implementation.
**Tracks**: PR #4 / Issue #2 (port-to-supabase branch)

---

## Decision Summary (resolved from Q&A)

| # | Decision |
|---|---|
| Q1 | **Option B** — Global catalog (`user_id = NULL`) seeded from `defaultAlgs.json`; user overrides in `user_alg_annotation`; user custom cases in `alg_case` with `user_id` set. Admin manages global catalog via Supabase console. |
| Q2 | **Sync everything EXCEPT** dark mode / pure UI visual preferences. FSRS state, timing, catalog annotations, selections, FSRS params, current category, and practice order mode all sync. |
| Q3 | **Option A** — Full Supabase anonymous users (same approach as tunetrees). Stable `user_id` through anonymous → registered conversion. |
| Q4 | **Option B** — Global seeds live as `user_id = NULL` rows in Supabase `cubefsrs` schema, seeded from `defaultAlgs.json`. |
| Q5 | **Configurable retention limit**, default `-1` (keep all). Stored in `user_settings`. |
| Q6 | **Revised phase order** — rhizome auth + cubefsrs Firebase removal first, then schema/codegen/SQLite/worker. See Section 3. |
| Q7 | **Dual strategy** — `package.json` uses `git+https://github.com/sboagy/rhizome.git#BRANCH` for CI/cloud; yalc overrides locally. `.yalc/` and `yalc.lock` in `.gitignore`. CI checks out both repos. |
| Q8 | **Tracking store persists** current case ID and relevant session state via the DB. |
| Q9 | **UUID primary keys + `slug` column** on `alg_case`, `alg_category`, `alg_subset`. Slugs are the human-readable identifiers shown in the UI; UUIDs are internal and never user-visible. |
| Q10 | **Minimal rhizome auth from scratch** (~150 lines). TuneTrees-specific sync lifecycle stays in tunetrees (to be refactored later in a separate PR). |

---

## 0. Executive Summary

CubeFSRS is transitioning from Firebase auth + localStorage persistence to:
- **Supabase auth** (via a shared `@rhizome/core` package, yalc-linked)
- **SQLite WASM** as the offline-first local data layer (backed by IndexedDB, same as tunetrees)
- **oosync** for bidirectional sync between local SQLite and Supabase (`cubefsrs` schema)
- **Cloudflare Worker + Pages** for sync endpoint and deployment

The migration is planned in incremental, non-breaking phases so the app stays functional throughout.

---

## 1. Current State Inventory

### Authentication
- Firebase `^10.14.0` — email/password, Google OAuth
- Module-level `auth` store (`src/stores/auth.ts`) holds Firebase `User` type
- `AuthPanel.tsx` subscribes to Firebase auth state; no context provider

### Persistence (all in `localStorage`)
| localStorage key | Data | Store |
|---|---|---|
| `cubedex.algs.catalog.v1` | Full `AlgCatalog` JSON | `algs.ts` |
| `cubedex.algs.cases.v1` | `Record<id, AlgCase>` | `algs.ts` |
| `cubedex.algs.selected.v1` | `string[]` (selected case IDs) | `algs.ts` |
| `cubedex.algs.category.v1` | Current category string | `algs.ts` |
| `cubedex.algs.options.v1` | `LibraryOptions` flags | `algs.ts` |
| `cubedex.fsrs.states.v1` | `Record<id, FSRSState>` | `fsrs.ts` |
| `cubedex.practice.times.v1` | `Record<id, TimeEntry[]>` | `practice.ts` |
| `cubedex.practice.*` | order mode, visibility | `practice.ts` |
| `cubedex.ui.*` | All UI settings | `settings.ts` |

### What *doesn't* exist yet
- No `@supabase/supabase-js` dependency
- No `sql.js` / SQLite WASM
- No Drizzle ORM
- No oosync integration
- No Cloudflare Worker
- No `cubefsrs` Postgres schema in Supabase

---

## 2. Target Architecture

```
cubefsrs (Vite/SolidJS PWA)
  ├── @rhizome/core (yalc link)           ← Supabase auth UI + client
  ├── oosync (generated artifacts)        ← sync engine + SQLite schema
  ├── sql.js + Drizzle ORM                ← local SQLite WASM
  └── IndexedDB                           ← SQLite persistence

Supabase (local dev → production)
  └── cubefsrs schema
      ├── alg_case
      ├── alg_category
      ├── alg_subset
      ├── fsrs_card_state
      ├── practice_time_entry
      └── user_settings (or use alg_case metadata)

Sync
  └── Cloudflare Worker (oosync runtime) ↔ Supabase cubefsrs schema
```

---

## 3. Phased Implementation Plan

### Phase 0: Bootstrap `@rhizome/core` + yalc workflow
**Goal**: Create the minimal shared auth package in rhizome and verify the yalc local-dev link.

#### 0a. Create minimal `@rhizome/core` auth package in rhizome
Write from scratch (not extracted from tunetrees) — approximately 150 lines total:

1. `src/supabase/client.ts` — factory function: takes `{ url, anonKey, storageKey }`, returns a `SupabaseClient`. No singletons; each app instantiates its own client.
2. `src/auth/types.ts` — shared `AuthState` interface: `{ user, session, loading, isAnonymous }` plus method signatures
3. `src/auth/AuthProvider.tsx` — minimal SolidJS context:
   - Manages `user`, `session`, `loading`, `isAnonymous` signals
   - Methods: `signIn(email, password)`, `signUp(email, password)`, `signInWithOAuth(provider)`, `signInAnonymously()`, `signOut()`, `convertAnonymousToRegistered(email, password)`
   - Accepts `onSignIn` / `onSignOut` callback props so cubefsrs can plug in DB init + sync lifecycle without subclassing
   - Subscribes to `supabase.auth.onAuthStateChange`
4. `src/auth/AuthPanel.tsx` — generic UI (email/password form + Google OAuth button + sign-out view). Accepts optional `class` prop for layout customization.
5. `src/auth/useAuth.ts` — `useAuth()` hook that reads the context
6. `src/index.ts` — re-exports everything above

Configure `tsup` build (already in `package.json` scripts): `cjs,esm --dts`.

#### 0b. Verify yalc workflow
See Section 6 for the full yalc + CI strategy. Steps:
```bash
# One-time global install
npm i -g yalc

# In rhizome:
npm run build
yalc publish

# In cubefsrs:
yalc add @rhizome/core
# Verify: node_modules/@rhizome/core exists and types are visible
npm run typecheck
```
Add `.yalc/` and `yalc.lock` to cubefsrs `.gitignore`.

---

### Phase 1: Replace Firebase auth with Supabase auth
**Goal**: Auth works end-to-end; app data still lives in localStorage (no schema work yet).

**In `cubefsrs`:**
1. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env.local` (local Supabase instance)
2. Create `src/services/supabase.ts` — instantiates `SupabaseClient` via the rhizome factory with `storageKey: "cubefsrs-auth"`
3. Rewrite `src/stores/auth.ts` — replace Firebase `User` type with Supabase `User` / `Session`
4. Rewrite `src/components/auth/AuthPanel.tsx` — use the rhizome `<AuthPanel>` or wire to the Supabase service directly
5. Wrap the app in cubefsrs's own `<AuthProvider>` in `App.tsx` (thin wrapper over rhizome's; provides `onSignIn`/`onSignOut` hooks for future DB/sync lifecycle)
6. Remove `firebase` from `package.json`
7. Add `package.json` git reference for CI: `"@rhizome/core": "git+https://github.com/sboagy/rhizome.git#rhizome-supabase-auth"`
8. `npm run typecheck && npm run lint`

**Checkpoint**: App builds cleanly; sign-in/out with email+password and Google OAuth work against local Supabase; anonymous sign-in works.

---

### Phase 2: `cubefsrs` Postgres schema
**Goal**: Define and migrate the Supabase schema. No app-code changes yet.

#### 2a. Add `cubefsrs` schema to local Supabase
- Local Supabase runs at the shared instance level; `tunetrees` owns the `public` schema.
- **Do not re-init or touch the `public` schema or run `supabase init` again.**
- Find or create the `supabase/` folder structure in the cubefsrs repo (separate from tunetrees's migration folder). This will require verifying with the oosync codegen how it expects migration files laid out.
- Write a single initial migration SQL file: full schema DDL (see Section 4).
- Apply via `supabase db push` or `supabase migration up` targeting the local instance — with `--schema cubefsrs` flag if supported, otherwise via the SQL file directly.

#### 2b. Seed global algorithm catalog
- Write a seed script that reads `src/data/defaultAlgs.json` and generates `INSERT` statements for `cubefsrs.alg_category`, `cubefsrs.alg_subset`, and `cubefsrs.alg_case` with `user_id = NULL`.
- These are admin-only rows; RLS will allow reads to all authenticated users but writes only to `user_id = auth.uid()` (or service role for admin).

#### 2c. Configure Row Level Security
For each table with `user_id`:
- `alg_category`, `alg_subset`, `alg_case` (global rows): `SELECT` allowed for `user_id IS NULL OR user_id = auth.uid()`; `INSERT/UPDATE/DELETE` only for `user_id = auth.uid()` (global rows protected by service role only)
- `user_alg_annotation`, `fsrs_card_state`, `practice_time_entry`, `user_alg_selection`, `user_settings`: fully owned by `auth.uid()`

---

### Phase 3: oosync codegen for cubefsrs
**Goal**: Generate SQLite schema, table-meta contract, and worker artifacts from the Postgres schema.

1. Create `oosync.codegen.config.json` in the cubefsrs repo root. Key config:
   - Target schema: `cubefsrs`
   - Exclude system tables (`schema_migrations`, sync infrastructure)
   - Pull rules for global catalog tables (pull `alg_case` etc. where `user_id IS NULL OR user_id = auth.uid()`)
   - Push rules for user-owned tables
2. Run oosync codegen: `npm run codegen:schema` (or invoke `tsx oosync/src/codegen-schema.ts` if run from workspace root)
3. Iterate on config/codegen until artifacts are generated cleanly:
   - `drizzle/schema-sqlite.ts` (generated Drizzle schema for SQLite)
   - `shared/table-meta.ts` (generated table registry / sync contract)
   - `worker/src/generated/` (worker-side config artifacts)
4. **Never hand-edit generated files.** Fix generator inputs (Postgres comments, `oosync.codegen.config.json`) if outputs are wrong.

---

### Phase 4: SQLite WASM + stores migration
**Goal**: All app state moves from `localStorage` to SQLite WASM via Drizzle. localStorage becomes write-only for UI prefs.

#### 4a. Add dependencies
```bash
npm install sql.js drizzle-orm @supabase/supabase-js
npm install -D drizzle-kit
```
(Verify exact package names match tunetrees's lockfile.)

#### 4b. Create `src/lib/db/client-sqlite.ts`
Modeled on tunetrees's version, but:
- `indexedDbName: "cubefsrs-storage"`
- `dbKeyPrefix: "cubefsrs-db"`
- `lastSyncTimestampKeyPrefix: "CF_LAST_SYNC_TIMESTAMP"`
- Import generated `schema-sqlite`, `table-meta` artifacts
- Export `initializeDb`, `getDb`, `persistDb`, `closeDb`, `clearDb`, `setupAutoPersist`

#### 4c. Wire DB lifecycle into cubefsrs's `AuthProvider`
In `src/components/auth/CubeAuthProvider.tsx` (the cubefsrs wrapper):
- `onSignIn` → `initializeDb(userId)` → populate from global catalog if first run → `setLocalDb(db)`
- `onSignOut` → `closeDb()` → `setLocalDb(null)`
- On first run (empty DB): copy global catalog from `defaultAlgs.json` seeds into SQLite (offline bootstrap without network)

#### 4d. Migrate each store to Drizzle queries

| Store | Old persistence | New SQLite table(s) |
|---|---|---|
| `algs.ts` — catalog | localStorage | `alg_category`, `alg_subset`, `alg_case` (pull from DB on init) |
| `algs.ts` — annotations | _(new)_ | `user_alg_annotation` |
| `algs.ts` — selected | localStorage | `user_alg_selection` |
| `algs.ts` — options | localStorage | `user_settings.lib_options` |
| `fsrs.ts` | localStorage | `fsrs_card_state` |
| `practice.ts` — times | localStorage | `practice_time_entry` |
| `practice.ts` — order mode | localStorage | `user_settings.order_mode` |
| `tracking.ts` — current case | _(session only today)_ | `user_settings.current_case_id` |
| `settings.ts` — UI prefs | localStorage | **Keep in localStorage** (not synced) |
| `settings.ts` — FSRS params | localStorage | `user_settings.fsrs_params` |

#### 4e. One-time localStorage → SQLite migration
On app startup, if `localStorage` keys with prefix `cubedex.` exist:
1. Read all `cubedex.*` keys
2. Insert into SQLite tables (skip if already populated)
3. Tombstone the keys (e.g., set them to `{"migrated": true}`) so they're skipped on next start

---

### Phase 5: oosync sync engine + Cloudflare Worker
**Goal**: Data syncs bidirectionally. Signed-in users' data flows to/from Supabase.

1. Create Cloudflare Worker package scaffolding in cubefsrs (adapt oosync worker scaffold)
2. Wire `startSyncWorker` in the cubefsrs `AuthProvider`'s `onSignIn` / `onSignOut` hooks
3. Configure `wrangler.toml` for the cubefsrs worker
4. Test bidirectional sync with local Supabase
5. Deploy worker to Cloudflare (deferred to post-alpha; local Supabase for now)

---

### Phase 6: Cleanup
- Remove all Firebase imports and `firebase` npm dependency
- Remove `safeGet`/`safeSet` calls from all synced stores
- Keep `src/services/persistence/localStorage.ts` only for UI settings (dark mode, etc.)
- Final `npm run typecheck && npm run lint && npm run build`

---

## 4. `cubefsrs` Postgres Schema (Final Design)

All tables live in the `cubefsrs` schema. UUID primary keys everywhere; `slug` columns on catalog entities are the human-readable identifiers shown in the UI (e.g., "oll-01", "pll-ua"). UUIDs are internal database keys, never exposed to the user.

```sql
CREATE SCHEMA IF NOT EXISTS cubefsrs;

-- ──────────────────────────────────────────────
-- GLOBAL ALGORITHM CATALOG (Option B)
-- Global rows: user_id = NULL (admin-seeded from defaultAlgs.json)
-- User custom rows: user_id = <uuid>
-- ──────────────────────────────────────────────

CREATE TABLE cubefsrs.alg_category (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       TEXT NOT NULL,                               -- e.g. "oll", "pll"
    user_id    UUID REFERENCES auth.users(id),              -- NULL = global
    name       TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(slug, user_id)
);

CREATE TABLE cubefsrs.alg_subset (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL,                              -- e.g. "oll-all"
    category_id UUID NOT NULL REFERENCES cubefsrs.alg_category(id),
    user_id     UUID REFERENCES auth.users(id),             -- NULL = global
    name        TEXT NOT NULL,
    sort_order  INT DEFAULT 0,
    UNIQUE(slug, user_id)
);

CREATE TABLE cubefsrs.alg_case (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       TEXT NOT NULL,                               -- e.g. "oll-01", "pll-ua"
    subset_id  UUID NOT NULL REFERENCES cubefsrs.alg_subset(id),
    user_id    UUID REFERENCES auth.users(id),              -- NULL = global
    name       TEXT NOT NULL,
    alg        TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(slug, user_id)
);

-- User-specific annotations on global cases (recognition, mnemonic, notes)
-- One row per (user, case). User-created custom cases store these directly
-- in alg_case since they own those rows.
CREATE TABLE cubefsrs.user_alg_annotation (
    user_id     UUID NOT NULL REFERENCES auth.users(id),
    case_id     UUID NOT NULL REFERENCES cubefsrs.alg_case(id),
    recognition TEXT,
    mnemonic    TEXT,
    notes       TEXT,
    updated_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, case_id)
);

-- ──────────────────────────────────────────────
-- USER PRACTICE DATA (all synced)
-- ──────────────────────────────────────────────

-- Which cases each user has selected for practice
CREATE TABLE cubefsrs.user_alg_selection (
    user_id UUID NOT NULL REFERENCES auth.users(id),
    case_id UUID NOT NULL REFERENCES cubefsrs.alg_case(id),
    PRIMARY KEY (user_id, case_id)
);

-- Per-user FSRS card state (one row per user+case)
CREATE TABLE cubefsrs.fsrs_card_state (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES auth.users(id),
    case_id        UUID NOT NULL REFERENCES cubefsrs.alg_case(id),
    due            BIGINT NOT NULL,           -- epoch millis (ts-fsrs)
    stability      FLOAT,
    difficulty     FLOAT,
    elapsed_days   INT,
    scheduled_days INT,
    reps           INT DEFAULT 0,
    lapses         INT DEFAULT 0,
    state          INT DEFAULT 0,             -- ts-fsrs State enum (0=New,1=Learning,2=Review,3=Relearning)
    last_review    BIGINT,
    updated_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, case_id)
);

-- Practice timing history
-- Retention limit configurable in user_settings.practice_time_limit (-1 = unlimited)
CREATE TABLE cubefsrs.practice_time_entry (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id),
    case_id     UUID NOT NULL REFERENCES cubefsrs.alg_case(id),
    ms          INT NOT NULL,
    reviewed_at TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────────────────────────────────
-- USER SETTINGS & SESSION STATE (synced, except ui_settings)
-- ──────────────────────────────────────────────

CREATE TABLE cubefsrs.user_settings (
    user_id               UUID PRIMARY KEY REFERENCES auth.users(id),
    -- Practice flow (synced)
    current_category_id   UUID REFERENCES cubefsrs.alg_category(id),
    current_case_id       UUID REFERENCES cubefsrs.alg_case(id),  -- last practiced case (Q8)
    order_mode            TEXT DEFAULT 'fsrs',                    -- 'sequential'|'random'|'fsrs'
    lib_options           JSONB DEFAULT '{}',                     -- randomAUF, randomOrder, etc.
    fsrs_params           JSONB DEFAULT '{}',                     -- retention, max_interval, fuzz, short_term
    practice_time_limit   INT DEFAULT -1,                         -- max entries per case (-1 = unlimited)
    -- NOT synced — kept only in localStorage:
    --   dark mode, backview, gyroAnimation, visualization, etc.
    updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### RLS Policies (summary)

| Table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `alg_category` | `user_id IS NULL OR user_id = auth.uid()` | `user_id = auth.uid()` only (global rows: service role) |
| `alg_subset` | same | same |
| `alg_case` | same | same |
| `user_alg_annotation` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `user_alg_selection` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `fsrs_card_state` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `practice_time_entry` | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `user_settings` | `user_id = auth.uid()` | `user_id = auth.uid()` |

---

## 5. `@rhizome/core` Shared Auth Scope (Minimal)

Built from scratch — **not** extracted from tunetrees (Q10). TuneTrees will be refactored in a later separate PR to consume this same package.

### What moves into `@rhizome/core`

| File | Responsibility |
|---|---|
| `src/supabase/client.ts` | Factory: `createSupabaseClient({ url, anonKey, storageKey })` |
| `src/auth/types.ts` | `AuthState`, `AuthContextValue` interfaces |
| `src/auth/AuthProvider.tsx` | Minimal SolidJS context: session signals + auth methods + `onSignIn`/`onSignOut` prop hooks |
| `src/auth/AuthPanel.tsx` | Generic UI: email/password form + Google OAuth + sign-out view |
| `src/auth/useAuth.ts` | `useAuth()` hook |
| `src/index.ts` | Re-exports all of the above |

### What stays in cubefsrs (app-specific)

| Concern | Location |
|---|---|
| SQLite DB init/close lifecycle | cubefsrs `CubeAuthProvider.tsx` wrapper |
| oosync sync start/stop | cubefsrs `CubeAuthProvider.tsx` |
| Error toasts / notifications | cubefsrs UI layer |
| Anonymous user conversion UX | cubefsrs (uses rhizome's `convertAnonymousToRegistered()` method) |

### `AuthProvider` extension point pattern

```tsx
// In rhizome — accepts lifecycle callbacks via props
<AuthProvider
  supabaseClient={supabaseClient}
  onSignIn={async (user, session) => { /* app hook */ }}
  onSignOut={async () => { /* app hook */ }}
>
  {props.children}
</AuthProvider>
```

This avoids inheritance/subclassing while keeping the core generic.

---

## 6. yalc Workflow + CI Strategy (Q7)

### Local development

```bash
# One-time: install yalc globally
npm i -g yalc

# In rhizome (after any change to @rhizome/core):
npm run build           # tsup build → dist/
yalc publish --push     # publishes to local store AND pushes to all linked consumers

# In cubefsrs (one-time setup):
yalc add @rhizome/core  # creates .yalc/ dir, updates node_modules
```

- `.yalc/` and `yalc.lock` are in **`.gitignore`** — never committed.
- `package.json` yalc reference (`"file:.yalc/@rhizome/core"`) is also **not committed** to git.

### Clean git state for CI

`package.json` in the committed state always references the GitHub URL:
```json
"@rhizome/core": "git+https://github.com/sboagy/rhizome.git#rhizome-supabase-auth"
```
(Branch updated to `main` once the PR merges.)

When `yalc add` is run locally, it mutates `package.json`. The developer tracks this as an unstaged change and does **not** commit it. Use `git restore package.json` (or add `@rhizome/core` to a `.gitignore`-like mechanism) to revert before committing.

> **Gotcha**: `yalc add` will overwrite the `@rhizome/core` entry in `package.json`. Remember to `git restore package.json` before committing, or use `yalc link` instead of `yalc add` to avoid mutating `package.json` altogether.

### GitHub Actions CI

```yaml
# .github/workflows/ci.yml (to be created)
- name: Checkout cubefsrs
  uses: actions/checkout@v4

- name: Checkout rhizome
  uses: actions/checkout@v4
  with:
    repository: sboagy/rhizome
    ref: rhizome-supabase-auth
    path: ../rhizome

- name: Build @rhizome/core
  working-directory: ../rhizome
  run: npm ci && npm run build

- name: Install cubefsrs deps
  run: npm ci   # uses git+https reference in package.json

- name: Typecheck + lint + build
  run: npm run typecheck && npm run lint && npm run build
```

npm's `git+https://` resolver fetches and builds rhizome at CI time without needing yalc.

### Long-term path

Once `@rhizome/core` stabilizes, publish to GitHub Packages (npm registry scoped to `@sboagy/core` or similar) and update the reference. yalc remains the local dev override tool indefinitely.

---

## 7. Open Questions

These are the questions I need answered before implementation begins. Please answer in this document, and we'll iterate.

---

### Q1: Algorithm catalog ownership model

Currently all algorithms come from `defaultAlgs.json` (global seed). Users can create, edit, and delete cases. Should the catalog model be:

**Option A** — User-owned catalog only:
Every user gets their own full copy of the algorithm catalog. Global seeds are inserted into each new user's data on signup. No "global" rows in Postgres (all `user_id` non-null).

**Option B** — Global catalog + user overrides:
A shared `user_id = NULL` catalog exists for all default algorithms. Users can override/annotate specific cases (recognition, mnemonic, notes) in a separate table. Users can add their own custom cases.

**Option C** — User catalog with import from global:
Same as A, but with a periodic "check for updates" mechanism where new cases from the global seed can be imported.

*My default leaning is Option A for simplicity, but it means algorithm updates require a migration or re-seed step per user.*

**Your answer:**

Actually, let's go with option B.  I think that's what we want to end up with anyway.  Only an admin will be able to update the global catalog (and for now that will be me via supabase console).  This catalog table should be seeded initially from `defaultAlgs.json`.

---

### Q2: Which data should sync vs stay local-only?

| Data | Sync to Supabase? | Rationale |
|---|---|---|
| FSRS card states (`fsrs_card_state`) | Likely yes | Core value prop — cross-device FSRS progress |
| Practice timing data (`practice_time_entry`) | Maybe | Useful for history, but could be large/private |
| Algorithm catalog customizations (notes, mnemonic) | Likely yes | User-created value |
| Selected case IDs (`user_alg_selection`) | Maybe | Nice to have cross-device, but optional |
| UI settings (dark mode, etc.) | Probably no | Local preference only |
| FSRS parameters (retention, max interval) | Yes? | Per-user but small |
| Current category / practice order mode | Probably no | Session-local UI state |

**Your answer:**

Yes on all but "UI settings (dark mode, etc.)".  For "Current category / practice order mode" I think anything affecting practice flow should be synced.

---

### Q3: Anonymous users

Should cubefsrs support offline/anonymous users (no account required), similar to tunetrees?

tunetrees uses Supabase's anonymous users feature, where data is synced under an anonymous session and can later be converted to a registered account.

**Option A** — Full anonymous support: user can use the app without signing in; data syncs under anonymous Supabase user; can convert to registered account later.
**Option B** — Offline-first without anonymous Supabase session: user always works locally in SQLite; sign-in is optional; on sign-in, a full sync merges local and remote.
**Option C** — Auth required: user must sign in to use the app.

*Option B seems cleanest for a gaming/practice app where the data is user-specific and there's no social/sharing feature.*

**Your answer:**

You should implement option A, which is closest to tunetrees, right?  The reason this is the right option is it allows us to create joins and views that reference a user ID, which will be stable from anonomous user to conversion to signed up user.  Whether or not we definately need these joins or views that user the user ID, I'm not certain.  But it gives us flexibility.  And I don't think it's at a real cost to the user.  Let me know if you disagree.

---

### Q4: Global seeds — where do they live?

`defaultAlgs.json` contains the default algorithm catalog (~100+ cases). Where should global seeds be managed?

**Option A** — JSON seed only (current): seeds are only applied at app startup to populate localStorage/SQLite if empty. No Postgres seed.

**Option B** — Supabase seed table: a `cubefsrs.alg_case` seed script inserts global cases with `user_id = NULL`. Requires Option B from Q1.

**Option C** — Static in the app bundle: the JSON seed is bundled; SQLite is pre-populated from it on first run per user; Supabase just stores user data, never seed data.

**Your answer:**

Option B.

---

### Q5: Practice time entries — retention policy

`practice_time_entry` could accumulate thousands of rows per user over time. Should there be a limit (e.g., keep last 50 per case)? Or is all history valuable?

**Your answer:**

Make a limit, but allow -1 which means "all", and for now default it to -1.

---

### Q6: Phase ordering preference

Given the dependency chain, the natural order is:

1. rhizome auth UI (prerequisite for auth swap)
2. cubefsrs → Supabase auth (remove Firebase)
3. `cubefsrs` Postgres schema + migrations
4. SQLite WASM + Drizzle in cubefsrs
5. oosync codegen + sync engine
6. Cloudflare Worker setup

Should we start at Phase 1 (rhizome auth UI) even though it has no Postgres schema yet (auth-only)? Or should we design the Postgres schema first, then set up rhizome, so we're clear on what we're syncing?

**Your answer:**

I think you can do 1 and 2 first, they shouldn't depend on the cubefsrs schema?  I'm a little worried about steps 3,4,5.  I think you want to:

3. First establish a `cubefsrs` Postgres schema.
4. Init the `cubefsrs` folder in local supabase.  You want to be careful not to re-init all of supabase if you can, keeping in mind the `public` folder that tunetrees owns.
5. Write `oosync.codegen.config.json`.
6. Run and debug oosync codegen.
7. Adjust access that was firebase or local to access SQLite WASM + Drizzle in cubefsrs.
8. Cloudflare Worker setup with generated oosync worker. 

Does this make sense?  If not, please push back.  I know the phasing of this work is going to be a bit tricky.

---

### Q7: yalc in CI / deployment

For CI (GitHub Actions) on the `port-to-supabase` branch, the rhizome package won't be available via yalc. Options:

**Option A** — Skip CI build for now; only local dev matters during active migration.
**Option B** — Publish `@rhizome/core` to a private npm registry (GitHub Packages or similar).
**Option C** — Use a git submodule or monorepo workspace approach instead of yalc for the long term.
**Option D** — Bundle the rhizome build artifacts directly (vendor them) until ready for proper publish.

*This is only a concern for CI/CD. For local dev, yalc is fine.*

**Your answer:**

Can we try this strategy:

**1. Update `package.json` (The Cloud Source)**
Set the `@rhizome/core` dependency to point directly to the GitHub repository. This ensures that GitHub Actions, Vercel, or any other CI tool can fetch the dependency without needing a local `yalc` registry.

* **Entry:** `"@rhizome/core": "git+https://github.com/sboagy/rhizome.git#main"` (or your specific branch).

**2. Local Development Workflow (The Local Link)**
Use `yalc` to override the GitHub URL locally. `yalc` physically injects the local package into your app's directory without permanently altering the "clean" state of your `package.json` for Git.

* **In `rhizome/packages/core`:** Run `yalc publish`.
* **In `cubefsrs`:** Run `yalc add @rhizome/core`.
* **Verification:** Your local `node_modules` will now point to a local `.yalc` folder, but your `package.json` remains deployable to the cloud.

**3. CI/CD Implementation (GitHub Actions)**
Update your `.github/workflows/ci.yml` to checkout both repositories. This allows the CI runner to build the latest version of your shared core during the test/build process.

* **Step 1:** Checkout `cubefsrs`.
* **Step 2:** Checkout `rhizome` into a sibling directory.
* **Step 3:** Build `rhizome/packages/core`.
* **Step 4:** Run `pnpm install` in `cubefsrs`. (The runner will use the version defined in your `package.json` or you can use `pnpm link` for a temporary override in the runner).

**4. Safety Check**

* Add `.yalc` and `yalc.lock` to your `.gitignore` to prevent committing local development artifacts.

Let me know if this does not make sense to you.

---

### Q8: Tracking store — does it need persistence?

`src/stores/tracking.ts` is the live "move tracking" store (monitors physical cube moves during practice). It appears to be purely ephemeral/session state (resets when algorithm changes). Does any state from `tracking.ts` need to persist across sessions? (e.g., the last algorithm configured?)

**Your answer:**

Yes, I think it needs to persist across sessions via the db.

---

### Q9: The `alg_case.id` format

Currently case IDs in `defaultAlgs.json` appear to be short string slugs (e.g., `"oll-01"`, `"pll-ua"`). Postgres UUIDs are the norm for Supabase. Should we:
- **Keep string slugs** as the primary key (simpler migration, more human-readable)
- **Migrate to UUIDs** (cleaner for Supabase/RLS, no slug collision risk)
- **Add a `slug` column** alongside a UUID primary key (best of both, but more complex)

**Your answer:**

I think you can move to UUIDs as long as they're not user visible.  However, please also leave the short string slugs in place for human reference.

---

### Q10: Concurrent cubefsrs → rhizome development

If we start building `@rhizome/core` from scratch (empty repo), do you want to:
- Start by extracting/adapting tunetrees's `AuthContext.tsx` (which is large and complex, ~1000+ lines), simplified for reuse
- OR write a minimal auth provider from scratch (just session management, no sync lifecycle), and have cubefsrs extend it with its own `AuthProvider` wrapper

The tunetrees version has significant complexity around sync lifecycle, anonymous users, catalog reconciliation, and view change signals that are TuneTrees-specific. A minimal rhizome core (~150 lines) would be safer to start with.

**Your answer:**

Start with minimal rhizome core.  Later (not in this PR session) we will have to refactor tunetrees to put that TuneTrees-specific logic in another modules, at arms length from the auth mechanism.

---

## 8. Implementation Dependency Graph

```
    ┌──────────────────────────────────────────────────────┐
    │          Phase 0: Bootstrap @rhizome/core            │
    │   (minimal auth: AuthProvider + AuthPanel + client)  │
    │              + yalc workflow verified                 │
    └─────────────────────┬────────────────────────────────┘
                          │
    ┌─────────────────────▼────────────────────────────────┐
    │          Phase 1: Supabase auth in cubefsrs          │
    │   (swap Firebase → Supabase, anonymous users, yalc)  │
    └─────────────────────┬────────────────────────────────┘
                          │
    ┌─────────────────────▼────────────────────────────────┐
    │          Phase 2: cubefsrs Postgres schema           │
    │   (DDL + migrations + seeds + RLS, local Supabase)   │
    └─────────────────────┬────────────────────────────────┘
                          │
    ┌─────────────────────▼────────────────────────────────┐
    │          Phase 3: oosync codegen                     │
    │   (oosync.codegen.config.json + generated artifacts) │
    └─────────────────────┬────────────────────────────────┘
                          │
    ┌─────────────────────▼────────────────────────────────┐
    │          Phase 4: SQLite WASM + stores migration     │
    │   (client-sqlite.ts, Drizzle, all stores updated,    │
    │    localStorage → SQLite migration on first run)     │
    └─────────────────────┬────────────────────────────────┘
                          │
    ┌─────────────────────▼────────────────────────────────┐
    │          Phase 5: oosync sync + Cloudflare Worker    │
    └─────────────────────┬────────────────────────────────┘
                          │
    ┌─────────────────────▼────────────────────────────────┐
    │          Phase 6: Cleanup (remove Firebase, etc.)    │
    └──────────────────────────────────────────────────────┘
```

---

## 9. Files That Will Change (Impact Summary)

### cubefsrs (port-to-supabase branch)

| File | Phase | Action |
|---|---|---|
| `src/services/firebase.ts` | 1 | Delete — replaced by `src/services/supabase.ts` |
| `src/services/supabase.ts` | 1 | **New** — thin wrapper around rhizome client factory |
| `src/stores/auth.ts` | 1 | Rewrite — Firebase `User` → Supabase `User`/`Session` |
| `src/components/auth/AuthPanel.tsx` | 1 | Replace — use rhizome `<AuthPanel>` |
| `src/components/auth/CubeAuthProvider.tsx` | 1 | **New** — cubefsrs wrapper over rhizome's `AuthProvider`; holds DB+sync lifecycle hooks |
| `src/App.tsx` | 1 | Add `<CubeAuthProvider>` wrapper |
| `package.json` | 1 | Remove `firebase`; add `@rhizome/core` git ref; add Supabase/Drizzle/sql.js in Phase 4 |
| `.env.local` | 1 | Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; remove Firebase vars |
| `.gitignore` | 1 | Add `.yalc/`, `yalc.lock` |
| `supabase/migrations/00001_cubefsrs_schema.sql` | 2 | **New** — full DDL for `cubefsrs` schema |
| `supabase/seeds/cubefsrs_catalog.sql` | 2 | **New** — global catalog seed from `defaultAlgs.json` |
| `oosync.codegen.config.json` | 3 | **New** — oosync codegen config |
| `drizzle/schema-sqlite.ts` | 3 | **Generated** — SQLite Drizzle schema (write-only) |
| `shared/table-meta.ts` | 3 | **Generated** — table registry contract (write-only) |
| `worker/src/generated/` | 3 | **Generated** — worker artifacts (write-only) |
| `src/lib/db/client-sqlite.ts` | 4 | **New** — SQLite WASM client (modeled on tunetrees) |
| `src/stores/algs.ts` | 4 | Rewrite — localStorage → Drizzle + `user_alg_annotation` |
| `src/stores/fsrs.ts` | 4 | Rewrite — localStorage → Drizzle `fsrs_card_state` |
| `src/stores/practice.ts` | 4 | Rewrite — localStorage → Drizzle `practice_time_entry` + `user_settings` |
| `src/stores/settings.ts` | 4 | Partial rewrite — FSRS params → Drizzle; keep UI prefs in localStorage |
| `src/stores/tracking.ts` | 4 | Add persistence for `currentCaseId` via `user_settings.current_case_id` |
| `worker/` | 5 | **New** — Cloudflare Worker package (oosync runtime) |
| `.github/workflows/ci.yml` | 1 | **New** — CI that checks out both repos |

### rhizome (rhizome-supabase-auth branch)

| File | Action |
|---|---|
| `src/index.ts` | **New** — package entry point |
| `src/supabase/client.ts` | **New** — `createSupabaseClient()` factory |
| `src/auth/types.ts` | **New** — `AuthState`, `AuthContextValue` interfaces |
| `src/auth/AuthProvider.tsx` | **New** — minimal SolidJS auth context with `onSignIn`/`onSignOut` hooks |
| `src/auth/AuthPanel.tsx` | **New** — generic auth UI (email/password + OAuth + sign-out) |
| `src/auth/useAuth.ts` | **New** — `useAuth()` hook |
| `tsconfig.json` | Verify/create for tsup build |

---

*Last updated: 2026-03-14 — All Q&A resolved, plan ready for implementation.*
