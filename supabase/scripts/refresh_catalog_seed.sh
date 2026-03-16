#!/usr/bin/env bash
# refresh_catalog_seed.sh
#
# Refreshes supabase/seeds/01_global_catalog.sql from the running local Supabase
# instance using psql (no Python deps required).
#
# Usage:
#   npm run refresh-to-catalog-seed
#   # or directly:
#   bash supabase/scripts/refresh_catalog_seed.sh
#
# Connection defaults match `supabase start` local defaults (config.toml [db]).
# Override with standard PG* env vars: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_FILE="$SCRIPT_DIR/../seeds/01_global_catalog.sql"

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-54322}"
export PGDATABASE="${PGDATABASE:-postgres}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGCLIENTENCODING="UTF8"

# If .env.local exists and has DATABASE_URL, parse it to set the PG* vars
# (unless the caller already set them explicitly via the environment).
ENV_LOCAL="$SCRIPT_DIR/../../.env.local"
if [[ -f "$ENV_LOCAL" ]]; then
  DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_LOCAL" | head -1 | cut -d= -f2-)
  if [[ -n "$DB_URL" ]]; then
    # postgresql://user:password@host:port/dbname
    PGUSER=$(echo "$DB_URL"    | sed -E 's|postgresql://([^:]+):.*|\1|')
    PGPASSWORD=$(echo "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
    PGHOST=$(echo "$DB_URL"    | sed -E 's|.*@([^:/]+)[:/].*|\1|')
    PGPORT=$(echo "$DB_URL"    | sed -E 's|.*:([0-9]+)/.*|\1|')
    PGDATABASE=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')
    export PGUSER PGPASSWORD PGHOST PGPORT PGDATABASE
  fi
fi

if ! command -v psql &>/dev/null; then
  echo "error: psql not found. Install PostgreSQL client tools (e.g. brew install libpq)." >&2
  exit 1
fi

echo "Refreshing $OUT_FILE …" >&2

# SQL lives in a separate file so editors can syntax-check / highlight it.
psql --tuples-only --no-align \
  -f "$SCRIPT_DIR/refresh_catalog_seed_query.sql" \
  > "$OUT_FILE"

echo "Done." >&2
echo "  → $OUT_FILE" >&2
