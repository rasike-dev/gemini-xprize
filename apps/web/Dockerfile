# Multi-stage build for the Next.js web app (standalone output). Context = repo root:
#   docker build -f apps/web/Dockerfile -t ledgerpilot-web .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
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
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
