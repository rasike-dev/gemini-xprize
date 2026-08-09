import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  BillingInterval,
  BillingProvider,
  PLANS,
  PLAN_CURRENCY,
  PlanTier,
  SubscriptionStatus,
  TRIAL_DAYS,
  periodMonthsFor,
} from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { PayHereService } from './payhere.service.js';

/**
 * Billing orchestration.
 *
 * PayHere (see PayHereService) is the launch payment rail for Sri Lanka. Stripe
 * is kept working for international expansion but is not the primary path.
 * Either way `Subscription` is the single source of truth that
 * EntitlementsService reads, so access control does not care which rail was used.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe?: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly entitlements: EntitlementsService,
    private readonly payhere: PayHereService,
  ) {}

  private getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new BadRequestException('Stripe is not configured.');
    if (!this.stripe) this.stripe = new Stripe(key);
    return this.stripe;
  }

  /** Everything the billing page needs: plan, state, usage, and what is on offer. */
  async getSubscriptionSummary(tenantId: string) {
    const state = await this.entitlements.getState(tenantId);
    const payments = await this.prisma.forTenant(tenantId, (tx) =>
      tx.billingPayment.findMany({
        where: { succeeded: true },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    );

    return {
      plan: {
        tier: state.plan.tier,
        name: state.plan.name,
        monthlyPriceMinor: state.plan.monthlyPriceMinor,
        annualPriceMinor: state.plan.annualPriceMinor,
        features: state.plan.features,
      },
      status: state.status,
      active: state.active,
      reason: state.reason,
      trialEndsAt: state.trialEndsAt,
      trialDaysRemaining: state.trialDaysRemaining,
      currentPeriodEnd: state.currentPeriodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      nextBillingAt: state.nextBillingAt,
      autoRenews: state.autoRenews,
      currency: PLAN_CURRENCY,
      usage: state.usage,
      availablePlans: Object.values(PLANS),
      payments: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        plan: p.plan,
        interval: p.interval,
        amountMinor: p.amountMinor,
        currency: p.currency,
        paidAt: p.createdAt,
        periodEnd: p.periodEnd,
      })),
    };
  }

  /**
   * Cancels at period end. We deliberately do not revoke immediately: the
   * customer paid for the period, and the refund policy promises them that time.
   * `cancelAtPeriodEnd` records the intent while `status` stays ACTIVE, so
   * EntitlementsService lets them work until `currentPeriodEnd` passes.
   *
   * A trial has no paid period, so cancelling one ends it there and then.
   */
  async cancel(tenantId: string, actor: string) {
    // Stop the gateway charging again first. Doing it the other way round risks
    // telling the customer they are cancelled and then billing them anyway.
    const stoppedAtGateway = await this.stopRecurring(tenantId);

    const updated = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { tenantId } });
      const onTrial = existing?.status === SubscriptionStatus.TRIALING;
      const periodLive =
        !!existing?.currentPeriodEnd && existing.currentPeriodEnd.getTime() > Date.now();

      return tx.subscription.update({
        where: { tenantId },
        data: {
          cancelAtPeriodEnd: true,
          nextBillingAt: null,
          ...(onTrial || !periodLive ? { status: SubscriptionStatus.CANCELED } : {}),
        },
      });
    });

    const accessUntil =
      updated.status === SubscriptionStatus.CANCELED ? null : updated.currentPeriodEnd;

    this.audit.log('billing_subscription_canceled', {
      tenantId,
      actor,
      accessUntil,
      stoppedAtGateway,
    });
    return { ok: true, accessUntil, immediate: accessUntil === null };
  }

  /**
   * Undoes a cancellation while the paid period is still running. The customer
   * has to set up payment again for the next period — we cannot revive a
   * cancelled mandate at the gateway — but they keep the plan they are on.
   */
  async resume(tenantId: string, actor: string) {
    const updated = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { tenantId } });
      if (!existing?.cancelAtPeriodEnd) {
        throw new BadRequestException('This subscription is not scheduled to end.');
      }
      if (!existing.currentPeriodEnd || existing.currentPeriodEnd.getTime() <= Date.now()) {
        throw new BadRequestException(
          'Your paid period has already ended. Choose a plan to start again.',
        );
      }

      return tx.subscription.update({
        where: { tenantId },
        data: { cancelAtPeriodEnd: false, status: SubscriptionStatus.ACTIVE },
      });
    });

    this.audit.log('billing_subscription_resumed', { tenantId, actor });
    return { ok: true, accessUntil: updated.currentPeriodEnd };
  }

  /** Cancels the mandate at whichever gateway holds it. */
  private async stopRecurring(tenantId: string): Promise<boolean> {
    const subscription = await this.prisma.forTenant(tenantId, (tx) =>
      tx.subscription.findUnique({ where: { tenantId } }),
    );
    if (!subscription?.externalSubId) return false;

    try {
      if (subscription.provider === BillingProvider.STRIPE) {
        await this.getStripe().subscriptions.cancel(subscription.externalSubId);
        return true;
      }
      return await this.payhere.cancelRecurring(tenantId);
    } catch (err) {
      // Never block the customer's cancellation on a gateway error; the audit
      // log carries the failure so it can be finished by hand.
      this.logger.error(
        `Failed to cancel ${subscription.provider} subscription ${subscription.externalSubId}`,
        err instanceof Error ? err.stack : undefined,
      );
      return false;
    }
  }

  /** Creates the trial subscription for a newly provisioned tenant. */
  async startTrial(tenantId: string, tx?: TenantTx) {
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
    const data = {
      tenantId,
      plan: PlanTier.STARTER,
      status: SubscriptionStatus.TRIALING,
      provider: BillingProvider.PAYHERE,
      trialEndsAt,
    };

    const run = (client: TenantTx) =>
      client.subscription.upsert({ where: { tenantId }, update: {}, create: data });

    return tx ? run(tx) : this.prisma.forTenant(tenantId, run);
  }

  // ---------------------------------------------------------------------------
  // Stripe (secondary rail, kept for international expansion)
  // ---------------------------------------------------------------------------

  async createStripeCheckout(
    tenantId: string,
    plan: PlanTier,
    successUrl: string,
    cancelUrl: string,
    interval: BillingInterval = BillingInterval.MONTHLY,
  ) {
    const price = stripePriceFor(plan, interval);
    if (!price) {
      throw new BadRequestException(`No Stripe price configured for ${plan} ${interval}.`);
    }

    const session = await this.getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: tenantId,
      metadata: { tenantId, plan, interval },
      // Copied onto the subscription so renewal webhooks can find the tenant.
      subscription_data: { metadata: { tenantId, plan, interval } },
    });

    this.audit.log('billing_checkout_created', {
      tenantId,
      plan,
      interval,
      provider: 'stripe',
      sessionId: session.id,
    });
    return { url: session.url };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    // Fail closed. An unverified webhook can grant a paid plan for free.
    if (!secret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not set; refusing to process webhook.');
      throw new BadRequestException('Webhook verification is not configured.');
    }

    const event = this.getStripe().webhooks.constructEvent(rawBody, signature, secret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenantId ?? session.client_reference_id ?? null;
        const plan = (session.metadata?.plan as PlanTier) ?? PlanTier.STARTER;
        const interval =
          (session.metadata?.interval as BillingInterval) ?? BillingInterval.MONTHLY;
        if (tenantId) {
          // A provisional period end: the invoice.paid event that follows carries
          // Stripe's real period and corrects it.
          const periodEnd = this.addMonths(new Date(), periodMonthsFor(interval));
          await this.applyStripeState(tenantId, {
            plan,
            status: SubscriptionStatus.ACTIVE,
            externalCustomerId: String(session.customer ?? ''),
            externalSubId: String(session.subscription ?? ''),
            periodEnd,
            nextBillingAt: periodEnd,
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const tenantId = await this.resolveStripeTenant(invoice);
        const periodEnd = invoice.lines?.data?.[0]?.period?.end;
        if (tenantId) {
          await this.applyStripeState(tenantId, {
            status: SubscriptionStatus.ACTIVE,
            // Stripe's own period end is authoritative; falling back to a month
            // would drift for annual plans.
            periodEnd: periodEnd ? new Date(periodEnd * 1000) : this.addMonths(new Date(), 1),
            nextBillingAt: periodEnd ? new Date(periodEnd * 1000) : null,
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const tenantId = await this.resolveStripeTenant(invoice);
        if (tenantId) await this.setStatus(tenantId, SubscriptionStatus.PAST_DUE);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = sub.metadata?.tenantId ?? (await this.tenantForSubId(sub.id));
        // Mirror a cancellation started from Stripe's own portal.
        if (tenantId) {
          await this.prisma.forTenant(tenantId, (tx) =>
            tx.subscription.updateMany({
              where: { tenantId },
              data: { cancelAtPeriodEnd: sub.cancel_at_period_end === true },
            }),
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = sub.metadata?.tenantId ?? (await this.tenantForSubId(sub.id));
        if (tenantId) await this.setStatus(tenantId, SubscriptionStatus.CANCELED);
        break;
      }

      default:
        this.logger.debug(`Unhandled Stripe event ${event.type}`);
    }

    this.audit.log('billing_webhook_stripe', { type: event.type });
    return { received: true };
  }

  /**
   * Finds the tenant behind a Stripe invoice.
   *
   * Renewal invoices do not carry the metadata we set at checkout — Stripe only
   * copies subscription metadata onto `subscription_details` — so without the
   * fallback every renewal would be dropped and the customer would lose access
   * the moment their second month started.
   */
  private async resolveStripeTenant(invoice: Stripe.Invoice): Promise<string | null> {
    const details = (invoice as { subscription_details?: { metadata?: Record<string, string> } })
      .subscription_details;
    const fromMetadata = invoice.metadata?.tenantId ?? details?.metadata?.tenantId ?? null;
    if (fromMetadata) return fromMetadata;

    const subId = (invoice as { subscription?: string | { id: string } }).subscription;
    const id = typeof subId === 'string' ? subId : subId?.id;
    return id ? this.tenantForSubId(id) : null;
  }

  /**
   * Maps a gateway subscription id to a tenant. Goes through a SECURITY DEFINER
   * function because a webhook has no tenant context, so RLS would hide the row.
   */
  private async tenantForSubId(externalSubId: string): Promise<string | null> {
    const rows = await this.prisma.client.$queryRaw<
      { resolve_subscription_tenant: string | null }[]
    >`SELECT resolve_subscription_tenant(${externalSubId}) AS resolve_subscription_tenant`;
    return rows[0]?.resolve_subscription_tenant ?? null;
  }

  private addMonths(from: Date, months: number): Date {
    const result = new Date(from);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  private async setStatus(tenantId: string, status: SubscriptionStatus) {
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.subscription.updateMany({ where: { tenantId }, data: { status } }),
    );
  }

  private async applyStripeState(
    tenantId: string,
    data: {
      plan?: PlanTier;
      status: SubscriptionStatus;
      externalCustomerId?: string;
      externalSubId?: string;
      periodEnd: Date;
      nextBillingAt?: Date | null;
    },
  ) {
    await this.prisma.forTenant(tenantId, async (tx) => {
      await tx.subscription.upsert({
        where: { tenantId },
        update: {
          ...(data.plan ? { plan: data.plan } : {}),
          status: data.status,
          provider: BillingProvider.STRIPE,
          externalCustomerId: data.externalCustomerId,
          externalSubId: data.externalSubId,
          currentPeriodEnd: data.periodEnd,
          trialEndsAt: null,
          ...(data.nextBillingAt !== undefined ? { nextBillingAt: data.nextBillingAt } : {}),
        },
        create: {
          tenantId,
          plan: data.plan ?? PlanTier.STARTER,
          status: data.status,
          provider: BillingProvider.STRIPE,
          externalCustomerId: data.externalCustomerId,
          externalSubId: data.externalSubId,
          currentPeriodEnd: data.periodEnd,
          nextBillingAt: data.nextBillingAt ?? null,
        },
      });

      if (data.plan) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { tokenBudget: BigInt(PLANS[data.plan].monthlyTokenBudget) },
        });
      }
    });
  }
}

/** Prisma transaction client, narrowed to what startTrial needs. */
type TenantTx = Parameters<Parameters<PrismaService['forTenant']>[1]>[0];

/**
 * Stripe prices live in Stripe, so they come from config rather than the plan
 * catalogue. Annual falls back to monthly so a half-configured account sells
 * something rather than erroring.
 */
function stripePriceFor(plan: PlanTier, interval: BillingInterval): string | undefined {
  const monthly =
    plan === PlanTier.GROWTH ? process.env.STRIPE_PRICE_GROWTH : process.env.STRIPE_PRICE_STARTER;
  if (interval !== BillingInterval.ANNUAL) return monthly;

  const annual =
    plan === PlanTier.GROWTH
      ? process.env.STRIPE_PRICE_GROWTH_ANNUAL
      : process.env.STRIPE_PRICE_STARTER_ANNUAL;
  return annual ?? monthly;
}
