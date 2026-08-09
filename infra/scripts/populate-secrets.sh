#!/usr/bin/env bash
set -euo pipefail

# Populate Secret Manager values from an env file.
# Usage:
#   PROJECT_ID=ledgerpilot-prod ENV_FILE=.env.production ./infra/scripts/populate-secrets.sh

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${ENV_FILE:=.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Env file not found: ${ENV_FILE}"
  exit 1
fi

SECRETS=(
  DATABASE_URL
  DATABASE_APP_URL
  CLERK_SECRET_KEY
  CLERK_WEBHOOK_SECRET
  GEMINI_API_KEY
  INTAKE_HMAC_SECRET
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  PAYHERE_MERCHANT_SECRET
  PAYHERE_APP_SECRET
  RESEND_API_KEY
  SENTRY_DSN
)

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT

for key in "${SECRETS[@]}"; do
  value="$(grep -E "^${key}=" "${ENV_FILE}" | sed -E "s/^${key}=//" || true)"
  if [[ -z "${value}" ]]; then
    echo "Skipping ${key} (not set in ${ENV_FILE})"
    continue
  fi

  printf '%s' "${value}" > "${tmp}"
  if gcloud secrets describe "${key}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets versions add "${key}" --project "${PROJECT_ID}" --data-file="${tmp}" >/dev/null
    echo "Updated secret version: ${key}"
  else
    gcloud secrets create "${key}" --project "${PROJECT_ID}" --replication-policy="automatic" >/dev/null
    gcloud secrets versions add "${key}" --project "${PROJECT_ID}" --data-file="${tmp}" >/dev/null
    echo "Created secret: ${key}"
  fi
done
