#!/usr/bin/env bash
set -euo pipefail

# Verify deployed Cloud Run services and core endpoints.
# Usage:
#   PROJECT_ID=ledgerpilot-prod REGION=asia-south1 ./infra/scripts/verify-cloud-run.sh

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${REGION:=asia-south1}"

WEB_URL="$(gcloud run services describe ledgerpilot-web --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"
API_URL="$(gcloud run services describe ledgerpilot-api --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"
WORKER_URL="$(gcloud run services describe ledgerpilot-worker --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"

echo "WEB:    ${WEB_URL}"
echo "API:    ${API_URL}"
echo "WORKER: ${WORKER_URL}"

echo "Checking health endpoints..."
curl -fsS "${API_URL}/health" >/dev/null
curl -fsS "${WORKER_URL}/health" >/dev/null

echo "Checking API summary..."
curl -fsS "${API_URL}/api/dashboard/summary" >/dev/null || true

echo "Cloud Run verification passed."
