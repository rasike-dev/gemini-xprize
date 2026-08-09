-- Recurring billing support (PayHere Recurring API / Stripe subscriptions).
--
-- cancelAtPeriodEnd exists so cancelling honours the period the customer already
-- paid for: status stays ACTIVE and access lapses naturally at currentPeriodEnd.

ALTER TABLE "subscriptions"
  ADD COLUMN "nextBillingAt" TIMESTAMP(3),
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "billing_payments"
  ADD COLUMN "installment" INTEGER NOT NULL DEFAULT 1;

-- Renewals arrive against the gateway's subscription id, not our order id, so
-- the notify handler needs to look a tenant up by it.
CREATE INDEX "subscriptions_externalSubId_idx" ON "subscriptions"("externalSubId");

-- Billing bootstrap, same reasoning as resolve_billing_order_tenant: a renewal
-- webhook carries no tenant context, and for Stripe recurring invoices the only
-- reliable identifier is the gateway's own subscription id.
CREATE OR REPLACE FUNCTION resolve_subscription_tenant(p_external_sub_id text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT "tenantId" FROM subscriptions WHERE "externalSubId" = p_external_sub_id LIMIT 1;
$$;
