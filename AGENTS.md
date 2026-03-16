# CubeFSRS Project AGENTS Instructions

Scope: repository-specific architecture, app boundaries, and migration guidance for the CubeFSRS app.

Global execution guardrails live in `.github/copilot-instructions.md`. Treat this file as the canonical explanation of how to work in this repo without confusing current implementation with planned multi-repo architecture.

`ARCHITECTURE.md` is the repo-level guide. `../rhizome/design/shared_pwa_architecture.md` is the cross-repo macro-architecture document. Read both before making changes that affect sync, auth, database ownership, shared-package integration, or deployment responsibilities.

## Current Reality vs Target State

CubeFSRS is a work in progress, and some architecture docs describe the destination rather than the current implementation.

Current reality on disk:

- This is a SolidJS + Vite application under `src/**`
- The app currently contains Firebase-based services and local browser persistence
- There is no visible `oosync.codegen.config.json`, worker package, or Supabase migration structure in the current repo root
- `@rhizome/core` is discussed architecturally, but it is not currently listed as a dependency in `package.json`

Target direction described in docs:

- tenant isolation in a shared Supabase instance
- offline-first SQLite + oosync runtime
- shared logic pulled from Rhizome

Default rule: unless the user explicitly asks you to build toward the target architecture, prefer changes that fit the current app structure and existing dependencies.

## Tech Stack (Actual)

- Frontend: SolidJS + TypeScript + Vite
- Routing: `@solidjs/router`
- Styling: Tailwind CSS
- Lint/format: Biome
- Scheduling: `ts-fsrs`
- Cube rendering: `cubing`
- Smart cube integration: `gan-web-bluetooth`
- Auth/data today: Firebase plus local browser persistence

## App Structure (Actual)

Primary code lives under `src/`:

- `components/`: UI building blocks
- `views/`: page-level screens such as practice and algorithm library flows
- `stores/`: Solid state containers for auth, practice, FSRS, settings, device state, and related app state
- `services/`: integration code for Firebase, FSRS scheduling, analytics, Bluetooth, and persistence
- `lib/`: cube/orientation helpers and lower-level utilities
- `data/`: seeded algorithm content
- `types/`: shared TypeScript types
- `styles/`: Tailwind entrypoint

Prefer following this structure rather than inventing a new one unless the task specifically calls for a refactor.

## SolidJS Rules

- This is a Solid app, not a React app.
- Do not introduce React hooks or React-specific state patterns.
- Keep stateful logic in the existing store/service style unless there is a strong repo-local reason to move it.

## Boundary Rules

- Cube-specific domain logic belongs here, not in Rhizome or oosync.
- Shared logic should only move to Rhizome when it is genuinely reusable and the dependency path is real, not just planned.
- Do not assume Supabase/oosync boundaries already exist in this repo just because the architecture docs describe them.
- If you introduce new cross-repo integration, document whether it is current-state compatible or a deliberate step toward the target architecture.

## Firebase and Persistence Guidance

- Current auth/data flows appear to live in `src/services/firebase.ts` and local persistence helpers.
- When working on today’s app behavior, inspect the current Firebase/local persistence code before proposing Supabase replacements.
- Do not silently swap persistence backends as part of an unrelated UI or domain task.

## Migration-to-Target Guidance

- If the user explicitly asks to move toward the target architecture, be clear about what is implemented now versus what you are introducing.
- Make migration steps incremental. Avoid partial half-migrations that leave both Firebase and future Supabase/oosync flows entangled without explanation.
- If shared logic should come from Rhizome, verify the shared package/API exists first; if not, either add it deliberately or keep the logic local for now.

## Validation Expectations

- Prefer the smallest relevant checks after changes:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
- There do not appear to be dedicated test scripts in `package.json` today, so do not promise unit/integration coverage that is not actually wired.

## What To Read First For Changes

- Architecture or sync/auth direction changes: `ARCHITECTURE.md`, then `../rhizome/design/shared_pwa_architecture.md`
- UI changes: `src/views/**`, `src/components/**`, and relevant stores
- Scheduling changes: `src/services/scheduler/fsrs.ts` and related stores
- Bluetooth/device changes: `src/services/ganBluetooth.ts`, device components, and device store/types
- Auth/data changes: `src/services/firebase.ts`, auth store, and persistence helpers

## Stop Signs

- A change assumes oosync/Supabase files exist when they do not yet exist.
- A task about the current app accidentally turns into an unrequested backend migration.
- Shared logic is moved to Rhizome without a real dependency boundary or without updating docs.
- New docs describe target-state architecture as if it were already the current implementation.
