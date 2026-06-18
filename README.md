# LedgerPilot AI

An AI finance & operations agent for small businesses. It turns customer
inquiries into quotes, invoices, payment reminders, and cash-flow insights, with
**every AI decision logged as an auditable `AgentRun`**. Built to ship fast and
scale: a modular monolith + async agent workers on Google Cloud, powered by
Gemini.

> Core flow: **Inquiry -> Quote -> Invoice -> Payment Reminder -> Cash-flow Summary -> Agent Logs**

## Architecture

```
apps/
  web/      Next.js (App Router) dashboard - Clerk auth, Tailwind
  api/      NestJS modular monolith - Clerk JWT auth, RLS tenant context, REST
  worker/   Agent worker - Cloud Tasks consumer, runs Gemini agents + PDF
packages/
  db/       Prisma schema, Postgres RLS policies, seed
  shared/   zod schemas, agent output contracts, enums, money helpers
  ai/       Gemini/Vertex client, model router (Flash/Pro), prompts, cost
infra/
  terraform/  Cloud Run, Cloud SQL, Cloud Tasks, Storage, Scheduler, Secret Manager
```

Key design decisions:

- **Async agents.** The API never calls Gemini inline. It creates an `AgentRun`
  and enqueues it (Cloud Tasks); the worker processes it and writes results back.
- **Multi-tenant via Postgres RLS.** Every tenant row is filtered by
  `app.tenant_id`, set per transaction (`withTenant`). Isolation is enforced at
  the database, not just in app code.
- **LLM safety.** Agent output is validated against zod contracts before any
  write; prompts treat customer text as data; low-confidence actions wait for
  human approval.
- **Cost guardrails.** Per-tenant token budgets; model routing (Flash for
  classify/extract/draft, Pro for cash-flow reasoning); token/cost recorded per run.

## Quick start (local, fully offline)

Requirements: Node 20+, pnpm 10+, a local Postgres (or Docker).

```bash
cp .env.example .env                      # fill in or leave defaults for offline mode
pnpm install
pnpm --filter @ledgerpilot/db generate

# create schema + RLS (point DATABASE_URL at your Postgres)
pnpm --filter @ledgerpilot/db exec prisma db push --skip-generate
psql "$DATABASE_URL" -f packages/db/prisma/sql/rls.sql

pnpm --filter @ledgerpilot/db seed        # demo tenant: PrintPro Lanka
pnpm --filter @ledgerpilot/worker smoke   # runs the full agent pipeline end-to-end
```

Run the stack:

```bash
DISABLE_AUTH=true pnpm --filter @ledgerpilot/api dev   # :8080  (dev header auth)
pnpm --filter @ledgerpilot/worker dev                  # :8081
pnpm --filter @ledgerpilot/web dev                     # :3000
```

Without `GEMINI_API_KEY`/Vertex credentials the AI layer uses deterministic
mocks, so the whole flow runs offline. Set `GEMINI_API_KEY` to use real Gemini.
Without Clerk keys the web app and API run in dev-header auth mode.

## Try the agent loop

Send a simulated WhatsApp inquiry to the HMAC-signed intake webhook:

```bash
BODY='{"channel":"WHATSAPP","from":"+94771234567","fromName":"Acme",
"body":"Quote for 20 printed T-shirts please","idempotencyKey":"demo-12345678"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$INTAKE_HMAC_SECRET" | awk '{print $2}')
curl -X POST http://localhost:8080/api/intake \
  -H 'content-type: application/json' \
  -H 'x-ledgerpilot-org: org_demo_printpro' \
  -H "x-ledgerpilot-signature: $SIG" \
  -d "$BODY"
```

Then watch the dashboard's **AI Agent Log** populate.

## Deploy (Google Cloud)

```bash
PROJECT_ID=ledgerpilot-prod REGION=asia-south1 TAG=$(git rev-parse --short HEAD) pnpm deploy:images
PROJECT_ID=ledgerpilot-prod REGION=asia-south1 TAG=$(git rev-parse --short HEAD) pnpm deploy:infra
```

Then set secret values in Secret Manager (`DATABASE_APP_URL`, `CLERK_SECRET_KEY`,
`GEMINI_API_KEY`, `INTAKE_HMAC_SECRET`, `STRIPE_*`, `RESEND_API_KEY`, ...).

You can populate them from an env file:

```bash
PROJECT_ID=ledgerpilot-prod ENV_FILE=.env.production pnpm deploy:secrets
```

Apply DB migrations + RLS + seed against Cloud SQL:

```bash
CLOUDSQL_CONNECTION_NAME=project:region:ledgerpilot-pg \
DATABASE_URL='postgresql://ledgerpilot:<password>@127.0.0.1:5432/ledgerpilot?schema=public' \
pnpm deploy:db
```

Verify deployed services:

```bash
PROJECT_ID=ledgerpilot-prod REGION=asia-south1 pnpm deploy:verify
```

## Tests

```bash
# unit tests + API e2e (requires api + worker running for e2e)
pnpm --filter @ledgerpilot/shared test
pnpm --filter @ledgerpilot/ai test
pnpm test:e2e
```

See `.cursor/plans` for the full hackathon strategy and production-readiness plan.
