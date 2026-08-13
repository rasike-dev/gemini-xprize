# BizOpsMate AI — Launch Checklist

Operator runbook for taking BizOpsMate from code to first paying customer. Items
marked **(external)** have lead times outside our control — start them first.

---

## Phase 0 — Long-lead items (start today)

### 1. Sri Lankan business entity **(external, blocking)**

PayHere only onboards registered Sri Lankan business entities.

- [ ] Business Registration (sole proprietorship, partnership, or Pvt Ltd)
- [ ] LKR business bank account at any local bank
- [ ] Signatories ready: a Pvt Ltd needs two directors plus the company secretary

**If you do not have these**, PayHere is unavailable. Fall back to a merchant of
record — Paddle or Lemon Squeezy — which handles tax and can pay out to
individuals in Sri Lanka. That swaps `payhere.service.ts` for a provider SDK; the
entitlement layer is provider-agnostic and needs no changes.

### 2. Domain **(external, blocking)**

- [ ] Register the domain
- [ ] Point DNS at Cloud Run (or a load balancer)

The PayHere Merchant Secret is issued **per domain**, so the domain must exist
before you can obtain live credentials. Whitelisting takes up to 24 hours.

### 3. Resend **(external)**

- [ ] Create a Resend account
- [ ] Verify the sending domain (SPF + DKIM records)
- [ ] Copy the API key into `RESEND_API_KEY`

Until this is set, [apps/worker/src/notify.ts](../apps/worker/src/notify.ts)
logs email to stdout instead of sending it.

### 4. Business contact details (needed for legal pages)

Fill these into the web app's environment. They render in the site footer and
legal pages, and **PayHere rejects applications without them**.

- [ ] `NEXT_PUBLIC_BUSINESS_NAME` — registered legal name
- [ ] `NEXT_PUBLIC_BUSINESS_EMAIL` — support contact
- [ ] `NEXT_PUBLIC_BUSINESS_PHONE` — reachable phone number
- [ ] `NEXT_PUBLIC_BUSINESS_ADDRESS` — full postal address
- [ ] `NEXT_PUBLIC_BUSINESS_REG_NO` — business registration number

### 5. Do NOT apply to PayHere yet

PayHere rejects sites that are incomplete or lack the required policies. Apply
only after Phase 1 is deployed and publicly reachable, so their reviewer sees:

- A complete landing page (not "under construction")
- Live Terms & Conditions, Privacy Policy, and Refund Policy pages
- Business name, phone, email, and postal address displayed on the site

---

## Phase 1 gate — before applying to PayHere

- [ ] Landing page live at the domain root
- [ ] `/pricing`, `/terms`, `/privacy`, `/refund-policy` all reachable
- [ ] Footer shows business name, phone, email, postal address
- [ ] Sign-up flow works end to end (Clerk → organization → tenant provisioned)

Then:

- [ ] Apply at <https://www.payhere.lk> and upload the signed Merchant Agreement
- [ ] Wait 3–7 business days for merchant screening
- [ ] Add your domain under Side Menu → Integrations → Add Domain/App
- [ ] Copy the Merchant ID and per-domain Merchant Secret

---

## Phase 2 gate — before charging real money

- [ ] `PAYHERE_MERCHANT_ID` and `PAYHERE_MERCHANT_SECRET` set in Secret Manager
- [ ] `PAYHERE_SANDBOX=false` in production
- [ ] Sandbox test completed for every outcome: success, pending, cancelled, failed
- [ ] `notify_url` publicly reachable over HTTPS (it cannot reach localhost — use
      a tunnel for local testing)
- [ ] Confirm pricing in [packages/shared/src/plans.ts](../packages/shared/src/plans.ts)
      matches what the pricing page advertises
- [ ] Verify a trial expires and correctly loses access

### PayHere plan choice

We launch on **LITE** (free, 3.99% per transaction) using one-time prepaid
payment links, because LITE does not support recurring billing and **PLUS costs
LKR 3,990/month** before you earn anything.

LITE limits to watch:

- LKR 50,000 maximum per single payment
- LKR 200,000 maximum per month in total — roughly 40 customers at LKR 5,000

Upgrade to PLUS and switch to the Recurring API when you approach either ceiling.
The code supports both; see [PAYHERE-PLUS-MIGRATION.md](PAYHERE-PLUS-MIGRATION.md).

---

## Required production environment

Beyond the existing `.env.example` entries:

- [ ] `NODE_ENV=production`
- [ ] `DISABLE_AUTH` unset or `false` — the API now refuses to boot otherwise
- [ ] `CORS_ORIGINS` set to your real web origin (no wildcard)
- [ ] `GEMINI_API_KEY` set — the API and worker now refuse to boot in production
      without it, because agents silently fall back to mocks otherwise
- [ ] `INTAKE_HMAC_SECRET` set — used to derive per-tenant intake secrets
- [ ] `SENTRY_DSN` set for error tracking
- [ ] `PAYHERE_MERCHANT_PLAN` left at `LITE` until you upgrade the PayHere account

---

## Go-live sequence

1. `pnpm deploy:secrets` — populate Secret Manager
2. `pnpm deploy:images` — build and push containers
3. `pnpm deploy:infra` — apply Terraform
4. `pnpm deploy:db` — run migrations and RLS (no demo seed in production)
5. `pnpm deploy:verify` — health check every service
6. Point DNS at the web service and confirm HTTPS
7. Register the Clerk webhook endpoint at `https://<api-domain>/api/webhooks/clerk`
8. Register the PayHere notify URL at `https://<api-domain>/api/webhooks/payhere`
9. Sign up as your own first tenant and walk the full flow
