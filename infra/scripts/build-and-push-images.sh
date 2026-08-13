#!/usr/bin/env bash
set -euo pipefail

# Build and push BizOpsMate images to Artifact Registry.
# Usage:
#   PROJECT_ID=bizopsmate-prod REGION=asia-south1 TAG=$(git rev-parse --short HEAD) ./infra/scripts/build-and-push-images.sh
#
# The web image bakes NEXT_PUBLIC_* values at build time (Next.js inlines them),
# so they are read here from WEB_ENV_FILE (default .env.production) rather than
# being set on the Cloud Run service.

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${REGION:=asia-south1}"
: "${TAG:=latest}"
: "${WEB_ENV_FILE:=.env.production}"

REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/bizopsmate"
API_IMAGE="${REPO}/api:${TAG}"
WORKER_IMAGE="${REPO}/worker:${TAG}"
WEB_IMAGE="${REPO}/web:${TAG}"

# Public build-time config for the web image.
WEB_BUILD_ARGS=(
  NEXT_PUBLIC_API_URL
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  NEXT_PUBLIC_SITE_URL
  NEXT_PUBLIC_BUSINESS_NAME
  NEXT_PUBLIC_BUSINESS_EMAIL
  NEXT_PUBLIC_BUSINESS_PHONE
  NEXT_PUBLIC_BUSINESS_ADDRESS
  NEXT_PUBLIC_BUSINESS_REG_NO
  NEXT_PUBLIC_LEGAL_UPDATED
)

# CI passes these as environment variables instead of a file, so a missing file is
# only a problem if the required values are absent too (checked just below).
if [[ -f "${WEB_ENV_FILE}" ]]; then
  echo "Loading web build config from ${WEB_ENV_FILE}"
  # shellcheck disable=SC1090
  set -a && source "${WEB_ENV_FILE}" && set +a
fi

# A web image without these is broken in a way that only shows up at runtime:
# Clerk silently disables itself and the app calls localhost for its API.
for required in NEXT_PUBLIC_API_URL NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; do
  if [[ -z "${!required:-}" ]]; then
    echo "ERROR: ${required} must be set (via ${WEB_ENV_FILE} or the environment)." >&2
    echo "       Deploying without it produces a web app that cannot authenticate." >&2
    exit 1
  fi
done

BUILD_ARG_FLAGS=()
for name in "${WEB_BUILD_ARGS[@]}"; do
  BUILD_ARG_FLAGS+=(--build-arg "${name}=${!name:-}")
done

echo "Configuring docker auth for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "Building API image ${API_IMAGE}"
docker build -f apps/api/Dockerfile -t "${API_IMAGE}" .

echo "Building worker image ${WORKER_IMAGE}"
docker build -f apps/worker/Dockerfile -t "${WORKER_IMAGE}" .

echo "Building web image ${WEB_IMAGE}"
docker build -f apps/web/Dockerfile "${BUILD_ARG_FLAGS[@]}" -t "${WEB_IMAGE}" .

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
