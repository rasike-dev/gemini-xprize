#!/usr/bin/env bash
set -euo pipefail

# Run migrate + RLS SQL + seed against Cloud SQL (via cloud-sql-proxy).
# Usage:
#   CLOUDSQL_CONNECTION_NAME=proj:region:instance \
#   DATABASE_URL=postgresql://ledgerpilot:pass@127.0.0.1:5432/ledgerpilot?schema=public \
#   ./infra/scripts/cloudsql-migrate-seed.sh

: "${CLOUDSQL_CONNECTION_NAME:?CLOUDSQL_CONNECTION_NAME is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"

if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
  echo "cloud-sql-proxy not found. Install from https://cloud.google.com/sql/docs/postgres/connect-auth-proxy"
  exit 1
fi

echo "Starting Cloud SQL proxy..."
cloud-sql-proxy "${CLOUDSQL_CONNECTION_NAME}" --port 5432 >/tmp/cloudsql-proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill ${PROXY_PID} 2>/dev/null || true' EXIT
sleep 4

echo "Applying Prisma migrations..."
pnpm --filter @ledgerpilot/db exec prisma migrate deploy

echo "Applying RLS policies..."
psql "${DATABASE_URL}" -f packages/db/prisma/sql/rls.sql

echo "Seeding demo data..."
pnpm --filter @ledgerpilot/db seed

echo "Cloud SQL migrate + RLS + seed complete."
