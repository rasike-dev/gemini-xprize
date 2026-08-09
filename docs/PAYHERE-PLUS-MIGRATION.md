# Migrating to PayHere PLUS and recurring billing

Launch runs on the free **LITE** merchant plan with one-time prepaid payments: the
customer pays, `currentPeriodEnd` moves forward, and access lapses on its own if
they do not pay again. It works, it costs nothing, and it needs no card mandate.

It also means every renewal depends on a customer remembering to pay. Recurring
billing typically lifts monthly retention by a large margin, so this is a revenue
decision rather than a technical one.

The code already supports both modes. Switching is configuration.

## When to switch

Upgrade when any of these is true:

- Monthly collections approach **LKR 200,000**, the LITE ceiling.
- You want to sell **annual Growth** (LKR 75,000), which exceeds LITE's
  LKR 50,000 per-payment limit. PLUS raises it to LKR 250,000.
- Renewal chasing is costing you more than **LKR 3,990/month** in time or churn.

At LKR 7,500/month, PLUS pays for itself with one retained customer.

## What changes commercially

| | LITE | PLUS |
|---|---|---|
| Monthly fee | Free | LKR 3,990 |
| Per transaction | 3.99% | 2.99% |
| Max per payment | LKR 50,000 | LKR 250,000 |
| Max per month | LKR 200,000 | LKR 3,000,000 |
| Recurring | No | Yes |

The transaction-fee saving alone covers the monthly fee at about LKR 400,000 of
monthly volume.

## Steps

1. **Upgrade the merchant account.** In PayHere, Settings → Plan → PLUS. Takes
   effect immediately; no re-approval.

2. **Create a Business App** under Integrations, with the **Subscription
   Manager** permission enabled. This is what lets us cancel and retry charges
   through the API rather than by email. Copy the App ID and App Secret.

3. **Set the new configuration.**

   ```bash
   PAYHERE_MERCHANT_PLAN=PLUS
   PAYHERE_APP_ID=<business app id>
   PAYHERE_APP_SECRET=<business app secret>   # goes in Secret Manager
   ```

   In Terraform, set `payhere_merchant_plan = "PLUS"` and `payhere_app_id`, then
   `pnpm deploy:secrets` for `PAYHERE_APP_SECRET`.

4. **Test in sandbox first** with `PAYHERE_SANDBOX=true`. Verify:
   - Checkout now posts `recurrence` and `duration=Forever`.
   - The first notification stores `subscription_id` on the subscription.
   - A second instalment appears as its own row in payment history.
   - Cancelling from `/app/billing` stops the mandate at PayHere and leaves
     access running until the period end.
   - A failed charge moves the tenant to `PAST_DUE` and the retry button works.

5. **Deploy.** Existing customers are unaffected: they stay on one-time payments
   until their next renewal, which will set up a mandate.

## What the code does differently on PLUS

Nothing about entitlements changes — `currentPeriodEnd` still decides access.
What changes is who moves it.

- **Checkout** adds `recurrence` (`1 Month` / `1 Year`) and `duration=Forever`.
  These sit outside the hash, so signing is unchanged.
- **Notify** reads `subscription_id`, `item_rec_status`, `item_rec_date_next` and
  `item_rec_install_paid`. The period end comes from PayHere's next billing date
  plus three days of grace, because PayHere retries a failed charge for a few
  days and expiring exactly on the billing date would lock out customers whose
  card is merely slow.
- **Instalments** each get their own `BillingPayment` row, suffixed `-R2`, `-R3`
  and so on, since PayHere reuses the original `order_id` for the whole series.
  The write is an upsert: PayHere resends any notification it did not get a 2xx
  for, and the same charge must not appear twice in a customer's history.
- **Cancel** calls the Subscription Manager API to stop the mandate, then sets
  `cancelAtPeriodEnd` locally. A gateway failure does not block the
  cancellation — it is recorded in the audit log to be finished by hand — because
  the alternative is a customer who cannot cancel.
- **Retry** asks PayHere to attempt the last failed charge again, rate-limited to
  three attempts per hour.

## Rolling back

Set `PAYHERE_MERCHANT_PLAN=LITE` and redeploy. New checkouts go back to one-time
payments. Mandates already established at PayHere keep charging until cancelled,
so cancel them from the PayHere dashboard or leave `PAYHERE_APP_ID` and
`PAYHERE_APP_SECRET` in place so the app can still cancel them for customers.
