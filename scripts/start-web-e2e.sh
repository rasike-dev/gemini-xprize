#!/usr/bin/env bash
# Starts the Next.js standalone server for Playwright UI tests (matches production Docker layout).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
STANDALONE="$WEB/.next/standalone/apps/web"

if [[ ! -f "$WEB/.next/standalone/apps/web/server.js" ]]; then
  echo "Missing standalone build. Run: pnpm --filter @ledgerpilot/web build" >&2
  exit 1
fi

mkdir -p "$STANDALONE/.next"
cp -r "$WEB/.next/static" "$STANDALONE/.next/static"
if [[ -d "$WEB/public" ]]; then
  cp -r "$WEB/public" "$STANDALONE/public"
fi

export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-127.0.0.1}"
exec node "$WEB/.next/standalone/apps/web/server.js"
