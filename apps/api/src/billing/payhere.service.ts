import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BillingInterval,
  BillingProvider,
  PLAN_CURRENCY,
  PayHereMerchantPlan,
  PlanTier,
  SubscriptionStatus,
  formatPlanPrice,
  payHereMaxPaymentMinor,
  payHereRecurrence,
  periodMonthsFor,
  planFor,
  priceMinorFor,
} from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

/**
 * PayHere status codes from the notify callback.
 * https://support.payhere.lk/api-&-mobile-sdk/checkout-api
 */
const PayHereStatus = {
  SUCCESS: '2',
  PENDING: '0',
  CANCELED: '-1',
  FAILED: '-2',
  CHARGEBACK: '-3',
} as const;

/**
 * `item_rec_status` from a recurring notification. PayHere spells CANCELLED with
 * two Ls; our own enum uses one, so the two are deliberately not shared.
 * https://support.payhere.lk/api-&-mobile-sdk/payhere-recurring
 */
const PayHereRecurringStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
} as const;

/**
 * Days of access granted past `item_rec_date_next`. PayHere retries a failed
 * recurring charge for a few days, so expiring exactly on the billing date
 * would lock out customers whose card is merely slow.
 */
const RECURRING_GRACE_DAYS = 3;

export interface CheckoutForm {
  /** Where the browser must POST these fields. */
  action: string;
  fields: Record<string, string>;
  orderId: string;
  amountFormatted: string;
  /** True when PayHere will charge this card again on its own. */
  recurring: boolean;
}

interface CheckoutRequest {
  tenantId: string;
  plan: PlanTier;
  interval: BillingInterval;
  returnUrl: string;
  cancelUrl: string;
  customer: { firstName: string; lastName: string; email: string; phone: string };
}

/** The recurring fields of a notify callback, when PayHere sends them. */
interface RecurringNotice {
  subscriptionId?: string;
  status?: string;
  nextBillingAt: Date | null;
  /** 1 for the first charge in the series. */
  installment: number;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * PayHere reports dates in Sri Lanka local time with no offset. Pinning the
 * offset keeps a billing date from sliding a day when the server runs in UTC.
 */
function parseSriLankaTimestamp(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(value.trim());
  const iso = match ? `${match[1]}T${match[2]}+05:30` : `${value.trim()}T00:00:00+05:30`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * PayHere checkout, in one-time or recurring mode.
 *
 * Launch runs on one-time payments: recurring needs PayHere's PLUS plan at
 * LKR 3,990/month, a fixed cost before the first customer pays. Each successful
 * payment extends `currentPeriodEnd`, so a lapsed subscription loses access on
 * its own without a cron job.
 *
 * Setting `PAYHERE_MERCHANT_PLAN=PLUS` switches on the Recurring API, after
 * which PayHere charges the card itself and posts a notification per
 * instalment. Nothing else about entitlements changes: `currentPeriodEnd` is
 * still what grants access, it is just moved by PayHere's schedule rather than
 * by the customer remembering to pay.
 */
@Injectable()
export class PayHereService {
  private readonly logger = new Logger(PayHereService.name);
  /** Cached OAuth token for the Subscription Manager API. */
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  private get sandbox(): boolean {
    return process.env.PAYHERE_SANDBOX !== 'false';
  }

  private get baseUrl(): string {
    return this.sandbox ? 'https://sandbox.payhere.lk' : 'https://www.payhere.lk';
  }

  private get merchantPlan(): PayHereMerchantPlan {
    return process.env.PAYHERE_MERCHANT_PLAN === PayHereMerchantPlan.PLUS
      ? PayHereMerchantPlan.PLUS
      : PayHereMerchantPlan.LITE;
  }

  /** True when we may ask PayHere to charge the card on a schedule. */
  private get recurring(): boolean {
    return this.merchantPlan === PayHereMerchantPlan.PLUS;
  }

  private credentials(): { merchantId: string; merchantSecret: string } {
    const merchantId = process.env.PAYHERE_MERCHANT_ID ?? '';
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET ?? '';

    // Fail loudly rather than generating a hash that PayHere will reject, or
    // accepting an unverifiable callback.
    if (!merchantId || !merchantSecret) {
      throw new BadRequestException(
        'Payments are not configured. Set PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET.',
      );
    }
    return { merchantId, merchantSecret };
  }

  /** PayHere requires amounts with exactly two decimals, in the hash and the form. */
  private formatAmount(minor: number): string {
    return (minor / 100).toFixed(2);
  }

  private md5Upper(value: string): string {
    return createHash('md5').update(value).digest('hex').toUpperCase();
  }

  private checkoutHash(
    merchantId: string,
    merchantSecret: string,
    orderId: string,
    amount: string,
    currency: string,
  ): string {
    return this.md5Upper(
      merchantId + orderId + amount + currency + this.md5Upper(merchantSecret),
    );
  }

  /**
   * Creates a pending BillingPayment and returns the fields the browser posts to
   * PayHere. Recording our own row first means the notify handler can trust our
   * stored plan and amount instead of the values echoed back to us.
   */
  async createCheckout(req: CheckoutRequest): Promise<CheckoutForm> {
    const { merchantId, merchantSecret } = this.credentials();
    const plan = planFor(req.plan);
    const amountMinor = priceMinorFor(req.plan, req.interval);

    const maxPaymentMinor = payHereMaxPaymentMinor(this.merchantPlan);
    if (amountMinor > maxPaymentMinor) {
      throw new BadRequestException(
        `A single payment cannot exceed ${formatPlanPrice(maxPaymentMinor)}. Please choose monthly billing for the ${plan.name} plan.`,
      );
    }

    const notifyUrl = process.env.PAYHERE_NOTIFY_URL;
    if (!notifyUrl) {
      throw new BadRequestException('PAYHERE_NOTIFY_URL is not configured.');
    }

    // PayHere does not enforce order_id uniqueness, so we make it unique ourselves.
    const orderId = `LP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const amount = this.formatAmount(amountMinor);

    const subscription = await this.ensureSubscription(req.tenantId);
    await this.prisma.forTenant(req.tenantId, (tx) =>
      tx.billingPayment.create({
        data: {
          tenantId: req.tenantId,
          subscriptionId: subscription.id,
          provider: BillingProvider.PAYHERE,
          orderId,
          plan: req.plan,
          interval: req.interval,
          amountMinor,
          currency: PLAN_CURRENCY,
          statusCode: 'CREATED',
          succeeded: false,
        },
      }),
    );

    this.audit.log('billing_checkout_created', {
      tenantId: req.tenantId,
      provider: 'payhere',
      plan: req.plan,
      interval: req.interval,
      orderId,
      amountMinor,
    });

    return {
      action: `${this.baseUrl}/pay/checkout`,
      orderId,
      amountFormatted: amount,
      recurring: this.recurring,
      fields: {
        merchant_id: merchantId,
        return_url: req.returnUrl,
        cancel_url: req.cancelUrl,
        notify_url: notifyUrl,
        order_id: orderId,
        items: `LedgerPilot AI — ${plan.name} (${req.interval === BillingInterval.ANNUAL ? 'annual' : 'monthly'})`,
        currency: PLAN_CURRENCY,
        amount,
        first_name: req.customer.firstName,
        last_name: req.customer.lastName,
        email: req.customer.email,
        phone: req.customer.phone,
        address: '',
        city: '',
        country: 'Sri Lanka',
        // custom_1/2 are echoed back on notify; treated as hints only.
        custom_1: req.tenantId,
        custom_2: `${req.plan}:${req.interval}`,
        // Recurrence is outside the hash, so adding it does not change signing.
        // `Forever` keeps charging until the customer cancels, which is what a
        // subscription means; PayHere would otherwise stop after N cycles.
        ...(this.recurring
          ? { recurrence: payHereRecurrence(req.interval), duration: 'Forever' }
          : {}),
        hash: this.checkoutHash(merchantId, merchantSecret, orderId, amount, PLAN_CURRENCY),
      },
    };
  }

  /**
   * Handles the server-to-server notify callback. This is the only place a
   * subscription becomes active, because it is the only source we can verify.
   */
  async handleNotify(params: Record<string, string>): Promise<{ received: boolean }> {
    const { merchantId, merchantSecret } = this.credentials();
    const {
      order_id: orderId,
      payhere_amount: amount,
      payhere_currency: currency,
      status_code: statusCode,
      md5sig: signature,
      payment_id: paymentId,
    } = params;

    if (!orderId || !statusCode) {
      throw new BadRequestException('Malformed PayHere notification.');
    }

    const expected = this.md5Upper(
      merchantId + orderId + amount + currency + statusCode + this.md5Upper(merchantSecret),
    );
    if (!this.signatureMatches(expected, signature)) {
      // Not an exception: PayHere retries on non-2xx, and a forged callback
      // should not trigger retries. Record it and move on.
      this.logger.warn(`PayHere signature mismatch for order ${orderId}`);
      return { received: false };
    }

    // The callback carries no tenant context, and the tenant id it echoes back
    // sits outside the signed payload, so resolve it from our own record instead.
    const tenantId = await this.resolveOrderTenant(orderId);
    if (!tenantId) {
      this.logger.warn(`PayHere notify for unknown order ${orderId}`);
      return { received: false };
    }

    const payment = await this.prisma.forTenant(tenantId, (tx) =>
      tx.billingPayment.findFirst({ where: { orderId } }),
    );
    if (!payment) {
      this.logger.warn(`PayHere notify for unresolvable order ${orderId}`);
      return { received: false };
    }

    // Guard against a tampered amount granting a plan the tenant did not pay for.
    const expectedAmount = this.formatAmount(payment.amountMinor);
    if (statusCode === PayHereStatus.SUCCESS && amount !== expectedAmount) {
      this.logger.error(
        `PayHere amount mismatch for order ${orderId}: expected ${expectedAmount}, got ${amount}`,
      );
      await this.recordPaymentOutcome(payment.tenantId, orderId, statusCode, false, paymentId);
      return { received: false };
    }

    const recurring = this.parseRecurring(params);

    switch (statusCode) {
      case PayHereStatus.SUCCESS:
        await this.activate(payment, paymentId, recurring);
        break;

      case PayHereStatus.CHARGEBACK:
        // Money has been taken back, so access goes with it.
        await this.setStatus(payment.tenantId, SubscriptionStatus.PAST_DUE);
        await this.recordPaymentOutcome(payment.tenantId, orderId, statusCode, false, paymentId);
        break;

      case PayHereStatus.PENDING:
      case PayHereStatus.CANCELED:
      case PayHereStatus.FAILED:
      default:
        // Nothing to grant. The existing period, if any, is untouched.
        await this.recordPaymentOutcome(payment.tenantId, orderId, statusCode, false, paymentId);
        break;
    }

    if (recurring) await this.applyRecurringStatus(payment.tenantId, recurring);

    this.audit.log('billing_webhook_payhere', {
      tenantId: payment.tenantId,
      orderId,
      statusCode,
      paymentId,
      ...(recurring
        ? {
            recurringStatus: recurring.status ?? null,
            installment: recurring.installment,
            subscriptionId: recurring.subscriptionId ?? null,
          }
        : {}),
    });
    return { received: true };
  }

  /**
   * Pulls the recurring fields out of a notification. Absent for one-time
   * payments, which is the normal case while we are on the LITE merchant plan.
   */
  private parseRecurring(params: Record<string, string>): RecurringNotice | null {
    const subscriptionId = params.subscription_id || params.payhere_subscription_id || undefined;
    const status = params.item_rec_status || undefined;
    const nextRaw = params.item_rec_date_next || '';

    if (!subscriptionId && !status && !nextRaw) return null;

    // PayHere sends `YYYY-MM-DD HH:mm:ss` in Sri Lanka time (UTC+5:30). Parsing
    // it as an explicit offset avoids the server timezone shifting the date.
    const nextBillingAt = nextRaw ? parseSriLankaTimestamp(nextRaw) : null;
    const installment = Number.parseInt(params.item_rec_install_paid ?? '', 10);

    return {
      subscriptionId,
      status,
      nextBillingAt,
      installment: Number.isFinite(installment) && installment > 0 ? installment : 1,
    };
  }

  /**
   * Reflects PayHere's own view of the recurring series. PayHere gives up after
   * its retry window, so a series it has abandoned must stop looking active to
   * us, otherwise the customer keeps their plan without ever paying again.
   */
  private async applyRecurringStatus(tenantId: string, notice: RecurringNotice): Promise<void> {
    switch (notice.status) {
      case PayHereRecurringStatus.CANCELLED:
      case PayHereRecurringStatus.COMPLETED:
        // No more charges are coming. Keep the period they paid for.
        await this.prisma.forTenant(tenantId, (tx) =>
          tx.subscription.updateMany({
            where: { tenantId },
            data: { cancelAtPeriodEnd: true, nextBillingAt: null },
          }),
        );
        break;

      case PayHereRecurringStatus.FAILED:
        await this.setStatus(tenantId, SubscriptionStatus.PAST_DUE);
        break;

      case PayHereRecurringStatus.ACTIVE:
      case PayHereRecurringStatus.PENDING:
      default:
        break;
    }
  }

  private async resolveOrderTenant(orderId: string): Promise<string | null> {
    const rows = await this.prisma.client.$queryRaw<
      { resolve_billing_order_tenant: string | null }[]
    >`SELECT resolve_billing_order_tenant(${orderId}) AS resolve_billing_order_tenant`;
    return rows[0]?.resolve_billing_order_tenant ?? null;
  }

  private signatureMatches(expected: string, received: string | undefined): boolean {
    if (!received || received.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received.toUpperCase()));
  }

  /** Grants access: extends the paid period and applies the purchased plan. */
  private async activate(
    payment: {
      id: string;
      tenantId: string;
      subscriptionId: string;
      plan: PlanTier;
      interval: BillingInterval;
      amountMinor: number;
      currency: string;
      orderId: string;
      succeeded: boolean;
    },
    paymentId: string | undefined,
    recurring: RecurringNotice | null,
  ): Promise<void> {
    const months = periodMonthsFor(payment.interval);
    const plan = planFor(payment.plan);
    const installment = recurring?.installment ?? 1;

    await this.prisma.forTenant(payment.tenantId, async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { tenantId: payment.tenantId } });

      // Stack renewals: extend from the current period end when it is still in
      // the future, so paying early never loses the customer days.
      const now = new Date();
      const from =
        existing?.currentPeriodEnd && existing.currentPeriodEnd > now
          ? existing.currentPeriodEnd
          : now;

      // With recurring, PayHere owns the schedule, so trust the date it gives us
      // over our own arithmetic — its retry window and month lengths are what
      // actually decide when the next charge lands.
      const periodEnd = recurring?.nextBillingAt
        ? addDays(recurring.nextBillingAt, RECURRING_GRACE_DAYS)
        : addMonths(from, months);

      await tx.subscription.update({
        where: { tenantId: payment.tenantId },
        data: {
          plan: payment.plan,
          interval: payment.interval,
          status: SubscriptionStatus.ACTIVE,
          provider: BillingProvider.PAYHERE,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
          nextBillingAt: recurring?.nextBillingAt ?? null,
          ...(recurring?.subscriptionId ? { externalSubId: recurring.subscriptionId } : {}),
          // A successful charge means the series is alive again, whatever a
          // previous failure or cancellation left behind.
          ...(recurring ? { cancelAtPeriodEnd: false } : {}),
        },
      });

      // Recurring instalments reuse the original order_id, so the first charge
      // updates the pending row and later ones get their own, giving the
      // customer a payment history rather than one row that keeps changing.
      if (payment.succeeded && installment > 1) {
        const orderId = `${payment.orderId}-R${installment}`;
        // Upsert, not create: PayHere resends a notification it did not get a
        // 2xx for, and the same instalment must not bill the customer twice in
        // their own history.
        await tx.billingPayment.upsert({
          where: { tenantId_orderId: { tenantId: payment.tenantId, orderId } },
          update: { externalRef: paymentId ?? null, periodStart: from, periodEnd },
          create: {
            tenantId: payment.tenantId,
            subscriptionId: payment.subscriptionId,
            provider: BillingProvider.PAYHERE,
            orderId,
            externalRef: paymentId ?? null,
            plan: payment.plan,
            interval: payment.interval,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            statusCode: PayHereStatus.SUCCESS,
            succeeded: true,
            installment,
            periodStart: from,
            periodEnd,
          },
        });
      } else {
        await tx.billingPayment.update({
          where: { id: payment.id },
          data: {
            statusCode: PayHereStatus.SUCCESS,
            succeeded: true,
            externalRef: paymentId ?? null,
            installment,
            periodStart: from,
            periodEnd,
          },
        });
      }

      // The plan sets the AI allowance, so apply it immediately on upgrade.
      await tx.tenant.update({
        where: { id: payment.tenantId },
        data: { tokenBudget: BigInt(plan.monthlyTokenBudget) },
      });
    });
  }

  private async recordPaymentOutcome(
    tenantId: string,
    orderId: string,
    statusCode: string,
    succeeded: boolean,
    paymentId: string | undefined,
  ): Promise<void> {
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.billingPayment.updateMany({
        where: { tenantId, orderId },
        data: { statusCode, succeeded, externalRef: paymentId ?? null },
      }),
    );
  }

  private async setStatus(tenantId: string, status: SubscriptionStatus): Promise<void> {
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.subscription.updateMany({ where: { tenantId }, data: { status } }),
    );
  }

  // ---------------------------------------------------------------------------
  // Subscription Manager API (recurring only)
  // ---------------------------------------------------------------------------

  /**
   * Stops PayHere charging the card again. Access is untouched: the customer
   * keeps the period they paid for, and BillingService records that intent.
   *
   * Returns false when there is nothing to cancel at PayHere — a one-time
   * subscription, or credentials we do not have — so the caller can still record
   * the cancellation locally rather than failing in the customer's face.
   */
  async cancelRecurring(tenantId: string): Promise<boolean> {
    const subscription = await this.prisma.forTenant(tenantId, (tx) =>
      tx.subscription.findUnique({ where: { tenantId } }),
    );
    const subscriptionId = subscription?.externalSubId;
    if (!subscriptionId || subscription?.provider !== BillingProvider.PAYHERE) return false;

    const ok = await this.subscriptionCommand('cancel', subscriptionId);
    if (ok) {
      this.audit.log('billing_recurring_canceled', { tenantId, provider: 'payhere', subscriptionId });
    }
    return ok;
  }

  /**
   * Asks PayHere to retry the last failed charge. Worth offering explicitly:
   * a card that failed on a Sunday often works on Monday, and the alternative
   * is the customer re-entering their details.
   */
  async retryRecurring(tenantId: string): Promise<boolean> {
    const subscription = await this.prisma.forTenant(tenantId, (tx) =>
      tx.subscription.findUnique({ where: { tenantId } }),
    );
    const subscriptionId = subscription?.externalSubId;
    if (!subscriptionId) {
      throw new BadRequestException('This subscription is not on automatic renewal.');
    }

    const ok = await this.subscriptionCommand('retry', subscriptionId);
    this.audit.log('billing_recurring_retried', {
      tenantId,
      provider: 'payhere',
      subscriptionId,
      accepted: ok,
    });
    return ok;
  }

  private async subscriptionCommand(
    command: 'cancel' | 'retry',
    subscriptionId: string,
  ): Promise<boolean> {
    const token = await this.accessToken();
    if (!token) return false;

    const response = await fetch(`${this.baseUrl}/merchant/v1/subscription/${command}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ subscription_id: subscriptionId }),
    });

    if (!response.ok) {
      this.logger.error(
        `PayHere ${command} failed for subscription ${subscriptionId}: ${response.status}`,
      );
      return false;
    }

    // PayHere answers 200 with its own status field, so a 200 alone is not success.
    const body = (await response.json().catch(() => null)) as { status?: number; msg?: string } | null;
    if (body?.status !== 1) {
      this.logger.error(`PayHere ${command} rejected: ${body?.msg ?? 'unknown reason'}`);
      return false;
    }
    return true;
  }

  /**
   * OAuth token for the Subscription Manager API, cached until shortly before it
   * expires. These are business-hours actions, so one token serves many calls.
   */
  private async accessToken(): Promise<string | null> {
    const appId = process.env.PAYHERE_APP_ID;
    const appSecret = process.env.PAYHERE_APP_SECRET;
    if (!appId || !appSecret) {
      this.logger.warn(
        'PAYHERE_APP_ID / PAYHERE_APP_SECRET are not set; cannot reach the Subscription Manager API.',
      );
      return null;
    }

    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;

    const basic = Buffer.from(`${appId}:${appSecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}/merchant/v1/oauth/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      this.logger.error(`PayHere token request failed: ${response.status}`);
      return null;
    }

    const body = (await response.json().catch(() => null)) as
      | { access_token?: string; expires_in?: number }
      | null;
    if (!body?.access_token) return null;

    // Expire a minute early so an in-flight request cannot use a stale token.
    const ttlMs = Math.max(60, (body.expires_in ?? 600) - 60) * 1000;
    this.token = { value: body.access_token, expiresAt: Date.now() + ttlMs };
    return body.access_token;
  }

  /** Subscriptions are created during provisioning; this covers older tenants. */
  private async ensureSubscription(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { tenantId } });
      if (existing) return existing;
      return tx.subscription.create({
        data: {
          tenantId,
          plan: PlanTier.STARTER,
          status: SubscriptionStatus.TRIALING,
          provider: BillingProvider.PAYHERE,
        },
      });
    });
  }
}
