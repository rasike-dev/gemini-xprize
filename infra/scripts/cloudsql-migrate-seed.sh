#!/usr/bin/env bash
set -euo pipefail

# Apply database migrations to Cloud SQL through the cloud-sql-proxy.
#
# RLS is part of the tracked migrations now, so there is no separate policy step
# to remember. Demo data is NOT seeded: this runs against the database real
# customers use, and seeding it would put fake invoices in their books. Pass
# SEED_DEMO_DATA=true only against a throwaway or staging database.
#
# Usage:
#   CLOUDSQL_CONNECTION_NAME=proj:region:instance \
#   DATABASE_URL=postgresql://ledgerpilot:pass@127.0.0.1:5432/ledgerpilot?schema=public \
#   ./infra/scripts/cloudsql-migrate-seed.sh

: "${CLOUDSQL_CONNECTION_NAME:?CLOUDSQL_CONNECTION_NAME is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
SEED_DEMO_DATA="${SEED_DEMO_DATA:-false}"

if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
  echo "cloud-sql-proxy not found. Install from https://cloud.google.com/sql/docs/postgres/connect-auth-proxy"
  exit 1
fi

echo "Starting Cloud SQL proxy..."
cloud-sql-proxy "${CLOUDSQL_CONNECTION_NAME}" --port 5432 >/tmp/cloudsql-proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill ${PROXY_PID} 2>/dev/null || true' EXIT
sleep 4

# The runtime role is created by Terraform; the RLS migration grants it access.
# Failing here is better than silently deploying an app that cannot connect.
if ! psql "${DATABASE_URL}" -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'ledgerpilot_app'" | grep -q 1; then
  echo "ERROR: role ledgerpilot_app does not exist. Run ./infra/scripts/deploy-terraform.sh first."
  exit 1
fi

echo "Applying Prisma migrations (schema + RLS policies)..."
pnpm --filter @ledgerpilot/db exec prisma migrate deploy

if [[ "${SEED_DEMO_DATA}" == "true" ]]; then
  echo "SEED_DEMO_DATA=true — seeding demo data. Never do this against production."
  pnpm --filter @ledgerpilot/db seed
fi

echo "Verifying RLS is enabled on every tenant-scoped table..."
UNPROTECTED=$(psql "${DATABASE_URL}" -tAc "
  SELECT string_agg(c.relname, ', ')
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname <> '_prisma_migrations'
    AND NOT c.relrowsecurity;
")

if [[ -n "${UNPROTECTED}" ]]; then
  echo "ERROR: these tables have no row-level security: ${UNPROTECTED}"
  echo "Add them to the tenant_tables list in a new RLS migration before deploying."
  exit 1
fi

echo "Database is migrated and every table is tenant-isolated."
