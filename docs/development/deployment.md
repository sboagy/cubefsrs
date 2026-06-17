# CubeFSRS Deployment

CubeFSRS follows the same release shape as TuneTrees:

1. Merge to `main`.
2. CI runs unit, local E2E, and PWA checks.
3. CI deploys `main` to staging.
4. CI applies Cubefsrs migrations to the staging Supabase project via rhizome.
5. CI refreshes staging Cubefsrs data from committed global catalog seed only.
6. CI runs staging smoke tests.
7. CI creates a GitHub Deployment proof for environment `staging` tied to the exact SHA.
8. Production is deployed manually by running `Deploy Production` with that exact SHA.

## Staging

Staging uses:

- `.env.staging.template`
- Cloudflare Pages project `cubefsrs-pwa`, branch `staging`
- Worker `cubefsrs-sync-worker-staging`
- staging Supabase values from `op://rhizome/shared-staging/...`
- a staging Hyperdrive binding in `worker/wrangler.toml`

The staging deploy job is serialized with `cancel-in-progress: false` so rapid merges queue instead of interrupting the staging environment mid-deploy.

## Production

Production deploy is manual:

1. Confirm the exact SHA has a successful `staging` Deployment proof.
2. Open the `Deploy Production` workflow.
3. Enter the exact 40-character SHA in `deploy_sha`.
4. Leave `override_staging_check` false unless this is an audited emergency.

The production workflow checks out the exact SHA, verifies the staging proof, applies production Cubefsrs migrations through rhizome, deploys the production Worker and Pages bundle, then runs production-safe smoke tests.

No data is copied from staging to production. Production data changes happen only when explicitly authored in migrations.

## Schema Promotion

Cubefsrs is a secondary tenant in the shared Supabase instance. It must not use a plain app-local `supabase db push` for remote promotion. Remote schema promotion runs:

```sh
npm run db:staging:schema:push
npm run db:production:schema:push
```

Both scripts delegate to rhizome's app-scoped migration runner with `--migrations-only`, mask the resolved database URL in CI, assert the target Supabase project, and write a migration summary.

Schema changes must follow the compatibility gate in `AGENTS.md`: prefer additive migrations, use expand/contract for potentially breaking changes, and regenerate generated artifacts from the migration source.

## Staging Data Refresh

`npm run db:staging:refresh` intentionally does not copy production user-owned Cubefsrs rows. User-owned rows can include practice history, mnemonics, notes, and custom algorithms, and copying them safely requires an app-specific privacy policy.

The current staging refresh clears the staging `cubefsrs` schema tables and reloads the committed global catalog seed. This gives staging deterministic app data without importing production user practice data.
