# cubefsrs Architecture Guide

This is the top-level architecture guide for AI agents working in the **cubefsrs** repo.

cubefsrs is a SolidJS/Shadcn PWA focused on algorithm spaced repetition for cubing. It uses the same offline-first, schema-driven architecture as TuneTrees, but operates as an isolated tenant within the Rhizome ecosystem.

## Repo Topology

cubefsrs is developed as a modular node in a multi-repo workspace:

- `cubefsrs`: The main app repo. Owns the SolidJS UI, cube-specific logic, and migrations for the `cubefsrs` Postgres schema.
- `rhizome`: Shared base repo. cubefsrs consumes `@rhizome/core` for FSRS scheduling and Auth UI via `yalc`.
- `oosync`: Sync tooling. cubefsrs uses oosync to bridge its local SQLite DB with its dedicated Postgres schema.

## Mental Model

1. **Schema Authority**: Postgres is the source of truth, specifically within the `cubefsrs` schema.
2. **Offline-First**: The UI reads/writes exclusively to a local SQLite WASM database.
3. **Tenant Isolation**: This app must remain entirely ignorant of the `public` (TuneTrees) schema.

## High-Level Architecture

**🔴 AI AGENT DIRECTIVE: REQUIRED READING 🔴**
Before suggesting architectural changes, writing database migrations, or altering sync rules, you MUST read the macro-architecture rules defined in our Shared PWA Architecture document.

**How to fetch this context:**

1. **Local Workspace:** Try to read the local file at `../rhizome/design/shared_pwa_architecture.md`.
2. **Cloud/Fallback:** If the local path is unavailable or you are in an isolated environment, fetch the document directly from: https://github.com/sboagy/rhizome/blob/main/design/shared_pwa_architecture.md

## Data Flow & oosync Integration

cubefsrs utilizes `oosync` to generate its runtime contract:

- `oosync.codegen.config.json`: Configured to introspect the `cubefsrs` Postgres schema.
- Artifacts are generated into local paths (e.g., `src/lib/db/client-sqlite.ts`, `worker/src/generated/`).

## Deployment Invariant

Because cubefsrs is a secondary tenant, it does not use the standard `supabase db push`. Instead, it uses shared deployment scripts from `rhizome` to apply its migrations to the `cubefsrs` schema on the shared Supabase instance.

## Guidance For AI Agents

- **UI/Domain Logic**: Stay in `src/**`. Cube visualization and FSRS mapping belong here.
- **Sync Policy**: Inspect `oosync.codegen.config.json` for table rules and pull/push logic.
- **Shared Logic**: Do not re-implement FSRS math or Auth screens. Import them from `@rhizome/core`.
