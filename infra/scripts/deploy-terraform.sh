#!/usr/bin/env bash
set -euo pipefail

# Apply Terraform for LedgerPilot infrastructure.
# Requires:
#   PROJECT_ID, REGION, TAG (or explicit API_IMAGE/WORKER_IMAGE/WEB_IMAGE)

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${REGION:=asia-south1}"
: "${TAG:=latest}"

REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/ledgerpilot"
API_IMAGE="${API_IMAGE:-${REPO}/api:${TAG}}"
WORKER_IMAGE="${WORKER_IMAGE:-${REPO}/worker:${TAG}}"
WEB_IMAGE="${WEB_IMAGE:-${REPO}/web:${TAG}}"

pushd infra/terraform >/dev/null
terraform init
terraform apply \
  -var "project_id=${PROJECT_ID}" \
  -var "region=${REGION}" \
  -var "api_image=${API_IMAGE}" \
  -var "worker_image=${WORKER_IMAGE}" \
  -var "web_image=${WEB_IMAGE}" \
  -auto-approve
popd >/dev/null

echo "Terraform applied."
