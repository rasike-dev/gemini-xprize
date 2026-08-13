#!/usr/bin/env bash
set -euo pipefail

# Verify deployed Cloud Run services and core endpoints.
# Usage:
#   PROJECT_ID=bizopsmate-prod REGION=asia-south1 ./infra/scripts/verify-cloud-run.sh

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${REGION:=asia-south1}"

describe() {
  gcloud run services describe "$1" --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)'
}

WEB_URL="$(describe bizopsmate-web)"
API_URL="$(describe bizopsmate-api)"
WORKER_URL="$(describe bizopsmate-worker)"

echo "WEB:    ${WEB_URL}"
echo "API:    ${API_URL}"
echo "WORKER: ${WORKER_URL}"

fail() {
  echo "FAIL: $1"
  exit 1
}

echo "Checking the public endpoints..."
curl -fsS "${API_URL}/health" >/dev/null || fail "API /health did not respond"
curl -fsS "${WEB_URL}/" >/dev/null || fail "the marketing site did not respond"

# The worker is deliberately private, so an unauthenticated curl gets a 403 and
# the old version of this script reported that as a failure. Present an identity
# token instead; the caller needs run.invoker on the worker.
echo "Checking the private worker with an identity token..."
if TOKEN="$(gcloud auth print-identity-token --audiences="${WORKER_URL}" 2>/dev/null)"; then
  curl -fsS -H "Authorization: Bearer ${TOKEN}" "${WORKER_URL}/health" >/dev/null ||
    fail "worker /health rejected an authenticated request"
else
  echo "SKIP: could not mint an identity token (service accounts cannot; that is expected in CI)."
fi

# Confirm the worker is not reachable without credentials. A public worker would
# let anyone trigger AI spend and read tenant data.
echo "Confirming the worker rejects anonymous callers..."
STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${WORKER_URL}/health")"
if [[ "${STATUS}" != "401" && "${STATUS}" != "403" ]]; then
  fail "worker answered an anonymous request with HTTP ${STATUS}; it must require auth"
fi

# Unauthenticated API calls must be rejected, which also proves DISABLE_AUTH is
# not set in this deployment.
echo "Confirming the API requires authentication..."
STATUS="$(curl -s -o /dev/null -w '%{http_code}' "${API_URL}/api/dashboard/summary")"
if [[ "${STATUS}" != "401" ]]; then
  fail "API answered an unauthenticated request with HTTP ${STATUS}; expected 401"
fi

echo "Cloud Run verification passed."
