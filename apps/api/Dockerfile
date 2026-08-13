# Multi-stage build for the NestJS API. Build context is the monorepo root:
#   docker build -f apps/api/Dockerfile -t bizopsmate-api .
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ledgerpilot/db generate
RUN pnpm --filter @ledgerpilot/shared --filter @ledgerpilot/db --filter @ledgerpilot/ai --filter @ledgerpilot/api build
RUN pnpm deploy --filter=@ledgerpilot/api --prod /deploy

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /deploy /app
EXPOSE 8080
CMD ["node", "dist/main.js"]
