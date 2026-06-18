#!/usr/bin/env bash
set -euo pipefail

# Build and push LedgerPilot images to Artifact Registry.
# Usage:
#   PROJECT_ID=ledgerpilot-prod REGION=asia-south1 TAG=$(git rev-parse --short HEAD) ./infra/scripts/build-and-push-images.sh

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${REGION:=asia-south1}"
: "${TAG:=latest}"

REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/ledgerpilot"
API_IMAGE="${REPO}/api:${TAG}"
WORKER_IMAGE="${REPO}/worker:${TAG}"
WEB_IMAGE="${REPO}/web:${TAG}"

echo "Configuring docker auth for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "Building API image ${API_IMAGE}"
docker build -f apps/api/Dockerfile -t "${API_IMAGE}" .

echo "Building worker image ${WORKER_IMAGE}"
docker build -f apps/worker/Dockerfile -t "${WORKER_IMAGE}" .

echo "Building web image ${WEB_IMAGE}"
docker build -f apps/web/Dockerfile -t "${WEB_IMAGE}" .

echo "Pushing images..."
docker push "${API_IMAGE}"
docker push "${WORKER_IMAGE}"
docker push "${WEB_IMAGE}"

cat <<EOF
Images pushed:
  API:    ${API_IMAGE}
  Worker: ${WORKER_IMAGE}
  Web:    ${WEB_IMAGE}
EOF
