# WhatsApp: should we move off `wa.me` links?

**Recommendation: not yet.** Keep the `wa.me` deep links, and revisit when the
trigger conditions at the bottom of this page are met.

Verify current pricing directly with Meta and any shortlisted provider before
committing — Meta has repriced WhatsApp messaging repeatedly, most recently moving
from per-conversation to per-message pricing, and the numbers below are orders of
magnitude rather than quotes.

## What we ship today

The reminder agent drafts the message, and the owner clicks one button that opens
WhatsApp with the text ready to send, from their own number
(`packages/shared/src/whatsapp.ts`).

What this gets right:

- **Zero cost, zero approval.** No Meta review, no BSP contract, no per-message fee.
- **Sends from the number the customer already knows.** For a Sri Lankan SMB this
  matters more than automation: a payment chase from an unknown business account
  reads like spam, and a chase from the owner's own number gets answered.
- **The owner sees the message before it goes.** Chasing money is a relationship
  decision, and the AI draft is a starting point, not a send.
- **Replies land in a thread they already read.** No inbox to build or monitor.

What it cannot do:

- Send while nobody is at a keyboard, so no truly automatic follow-up schedule.
- Confirm delivery or read status.
- Capture replies back into LedgerPilot as inquiries.
- Scale past a handful of messages before clicking becomes the bottleneck.

## What the Business API would add

Real API sending needs the WhatsApp Business Cloud API, which in practice means a
Business Solution Provider unless we want to run the Meta integration ourselves.

Gains: scheduled sending with no human present, delivery and read receipts,
inbound replies as webhooks (which would feed the existing intake endpoint
directly), and per-tenant sender numbers.

Costs, in rough order of how much they hurt:

1. **Template approval.** Every business-initiated message must use a template
   Meta has approved, and payment reminders are "utility" templates. Templates
   are rigid: fixed structure with variable slots. Our whole pitch is that the AI
   writes a message that fits the situation, and templates take most of that away.
   This is the real objection, not the money.
2. **Per-tenant onboarding.** Each tenant needs a WhatsApp Business Account,
   a verified business, and a dedicated phone number that is not already on
   WhatsApp. Getting a Sri Lankan SMB through Meta Business Verification is days
   of work per tenant, and it is work we would be doing on their behalf.
3. **Per-message fees**, billed to us and passed on somehow. Utility messages in
   Sri Lanka are cheap individually, but they turn a fixed-price plan into a
   variable-cost one and every plan limit has to be re-thought.
4. **Provider lock-in.** BSP APIs differ enough that switching is a rewrite of the
   send path.

## Provider shortlist, if and when we do this

Judged on Sri Lanka support, per-tenant onboarding effort, and whether we can
avoid paying for a full conversational inbox we would not use.

- **360dialog** — resells at Meta's list price with a flat monthly fee per number
  and no markup per message, and is API-first rather than inbox-first. Best fit
  for our shape: we want a send path, not a helpdesk.
- **Twilio** — the least surprising integration and the best docs, but a markup on
  every message and a general-purpose abstraction that hides WhatsApp specifics we
  would need to see.
- **Gupshup** — strong South Asia presence and competitive regional pricing;
  worth a quote, though the developer experience is weaker.
- **Interakt / WATI** — built for SMBs running their own WhatsApp, which makes
  them a competitor to part of our product rather than a component of it. Skip.
- **Local telco resellers (Dialog, Mobitel)** — worth asking, since LKR billing
  and local support would remove real friction for tenants. Expect enterprise
  contracts and slow procurement.

Provisional pick: **360dialog**, with Gupshup as the price check.

## Trigger conditions

Revisit when **two or more** of these hold:

- More than ~20 paying tenants, so per-tenant onboarding cost can be amortised
  and a support process exists at all.
- Tenants asking specifically for scheduled or unattended sending — not just
  "WhatsApp support", which they already have.
- Reminder volume per tenant high enough that clicking is a real complaint
  (roughly 20+ messages a week).
- A tenant willing to pay a premium tier for automatic sending, which is the
  honest test of whether the cost can be recovered.

## Cheaper things to do first

Each of these captures part of the value without a BSP:

- **Batch sending.** A queue view that opens each reminder in turn, so one
  sitting clears twenty chases.
- **Scheduled prompts.** Notify the owner at a good hour with the drafts ready,
  which recovers most of the timing benefit of automation.
- **Reply capture through intake.** The intake webhook already accepts signed
  inbound messages, so a tenant forwarding WhatsApp to an integration gets
  replies into LedgerPilot without us touching Meta.

Do these before spending on a BSP.
