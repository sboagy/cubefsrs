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

## Prerequisites

Before the staging pipeline can succeed, these shared infrastructure pieces must already exist:

- Cloudflare Pages project `cubefsrs-pwa` in the deployment account.
- Cloudflare Hyperdrive configuration referenced by `worker/wrangler.toml` for `[env.staging]`: `9514b1eccf354ebcb33d7ca490d5cbde`.
- All 1Password fields referenced by `.env.staging.template`, accessible to GitHub Actions through the configured `OP_SERVICE_ACCOUNT_TOKEN`.

## Staging

Staging uses:

- `.env.staging.template`
- Cloudflare Pages project `cubefsrs-pwa`, branch `staging`
- Staging app URL `https://staging.cubefsrs-pwa.pages.dev`
- Worker `cubefsrs-sync-worker-staging`
- staging Supabase values from `op://rhizome/shared-staging/...`
- a staging Hyperdrive binding in `worker/wrangler.toml`

The staging deploy job is serialized with `cancel-in-progress: false` so rapid merges queue instead of interrupting the staging environment mid-deploy.

## Production

Production uses:

- `.env.prod.template`
- Cloudflare Pages project `cubefsrs-pwa`, branch `main`
- Production app URL `https://cubefsrs-pwa.pages.dev`
- Worker URL from `op://rhizome/shared-production/Vite/VITE_WORKER_URL`
- production Supabase values from `op://rhizome/shared-production/...`

Production deploy is manual:

1. Confirm the exact SHA has a successful `staging` Deployment proof.
2. Open the `Deploy Production` workflow.
3. Enter the exact 40-character SHA in `deploy_sha`.
4. Leave `override_staging_check` false unless this is an audited emergency.

Optional CLI verification:

```sh
DEPLOY_SHA=<40-character-sha>
gh api repos/sboagy/cubefsrs/deployments \
  --method GET \
  -F environment=staging \
  -F ref="$DEPLOY_SHA" \
  --jq '.[] | {id, sha, ref, environment}'
```

Then check at least one returned deployment has a successful status:

```sh
DEPLOYMENT_ID=<deployment-id>
gh api repos/sboagy/cubefsrs/deployments/"$DEPLOYMENT_ID"/statuses \
  --jq 'map({state, created_at, description})'
```

The production workflow checks out the exact CubeFSRS SHA, checks out the latest `sboagy/rhizome@main` migration helper, verifies the staging proof, applies production Cubefsrs migrations through rhizome, deploys the production Worker and Pages bundle, then runs production-safe smoke tests.

No data is copied from staging to production. Production data changes happen only when explicitly authored in migrations.

## Schema Promotion

Cubefsrs is a secondary tenant in the shared Supabase instance. It must not use a plain app-local `supabase db push` for remote promotion. Remote schema promotion runs:

```sh
npm run db:staging:schema:push
npm run db:production:schema:push
```

Both scripts delegate to rhizome's app-scoped migration runner with `--migrations-only`, mask the resolved database URL in CI, assert the target Supabase project, and write a migration summary.

On production only, the wrapper first checks whether the initial CubeFSRS schema already exists but migration `20260315000001` is missing from `supabase_migrations.schema_migrations`. If all expected baseline tables, triggers, policies, and functions are present, it records that initial migration as already applied before running pending migrations. If the schema is partial, it fails closed for manual inspection.

Schema changes must follow the compatibility gate in `AGENTS.md`: prefer additive migrations, use expand/contract for potentially breaking changes, and regenerate generated artifacts from the migration source.

## Staging Data Refresh

> Important: staging does not contain production user practice history, mnemonics, notes, or custom algorithms. The refresh is intentionally limited by privacy policy to committed global catalog data. If testing requires restoring user-owned production data to staging, follow the approval guidance in `AGENTS.md` or the operations runbook before adding any copy path.

`npm run db:staging:refresh` intentionally does not copy production user-owned Cubefsrs rows. User-owned rows can include practice history, mnemonics, notes, and custom algorithms, and copying them safely requires an app-specific privacy policy.

The current staging refresh clears the staging `cubefsrs` schema tables and reloads the committed global catalog seed. This gives staging deterministic app data without importing production user practice data.
