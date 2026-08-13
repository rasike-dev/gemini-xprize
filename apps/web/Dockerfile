# Multi-stage build for the Next.js web app (standalone output). Context = repo root:
#   docker build -f apps/web/Dockerfile -t bizopsmate-web .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build

# Next.js inlines NEXT_PUBLIC_* at build time, so these must be present here and
# not only in the Cloud Run runtime environment. Without them the deployed app
# would fall back to dev-header auth and localhost API calls.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_BUSINESS_NAME
ARG NEXT_PUBLIC_BUSINESS_EMAIL
ARG NEXT_PUBLIC_BUSINESS_PHONE
ARG NEXT_PUBLIC_BUSINESS_ADDRESS
ARG NEXT_PUBLIC_BUSINESS_REG_NO
ARG NEXT_PUBLIC_LEGAL_UPDATED

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_BUSINESS_NAME=$NEXT_PUBLIC_BUSINESS_NAME \
    NEXT_PUBLIC_BUSINESS_EMAIL=$NEXT_PUBLIC_BUSINESS_EMAIL \
    NEXT_PUBLIC_BUSINESS_PHONE=$NEXT_PUBLIC_BUSINESS_PHONE \
    NEXT_PUBLIC_BUSINESS_ADDRESS=$NEXT_PUBLIC_BUSINESS_ADDRESS \
    NEXT_PUBLIC_BUSINESS_REG_NO=$NEXT_PUBLIC_BUSINESS_REG_NO \
    NEXT_PUBLIC_LEGAL_UPDATED=$NEXT_PUBLIC_LEGAL_UPDATED

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ledgerpilot/shared build
RUN pnpm --filter @ledgerpilot/web build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Next.js standalone bundle includes only the needed node_modules.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

# Drop privileges: the runtime only needs to read the bundle and listen.
USER node

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
