import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { BillingInterval, PlanTier, SubscriptionStatus } from '@ledgerpilot/shared';
import { PayHereService } from '../src/billing/payhere.service.js';
import {
  createFakeAudit,
  createFakePrisma,
  daysFromNow,
  emptyState,
  tenantFixture,
  type FakeState,
} from './fake-prisma.js';
import type { AuditLogService } from '../src/common/audit-log.service.js';

const MERCHANT_ID = '1211149';
const MERCHANT_SECRET = 'test_merchant_secret';

function md5Upper(value: string): string {
  return createHash('md5').update(value).digest('hex').toUpperCase();
}

/** Recreates the signature PayHere sends on its notify callback. */
function notifySignature(orderId: string, amount: string, currency: string, statusCode: string) {
  return md5Upper(
    MERCHANT_ID + orderId + amount + currency + statusCode + md5Upper(MERCHANT_SECRET),
  );
}

function build(state: Partial<FakeState> = {}) {
  const full = emptyState({
    tenants: [tenantFixture()],
    subscriptions: [
      {
        id: 'sub_1',
        tenantId: 'tenant_1',
        plan: PlanTier.STARTER,
        status: SubscriptionStatus.TRIALING,
        provider: 'PAYHERE',
        trialEndsAt: daysFromNow(7),
        currentPeriodEnd: null,
      },
    ],
    ...state,
  });
  const audit = createFakeAudit();
  const service = new PayHereService(
    createFakePrisma(full),
    audit.service as unknown as AuditLogService,
  );
  return { service, state: full, audit };
}

const customer = {
  firstName: 'Nimal',
  lastName: 'Perera',
  email: 'nimal@printpro.lk',
  phone: '+94771234567',
};

beforeEach(() => {
  process.env.PAYHERE_MERCHANT_ID = MERCHANT_ID;
  process.env.PAYHERE_MERCHANT_SECRET = MERCHANT_SECRET;
  process.env.PAYHERE_NOTIFY_URL = 'https://api.bizopsmateai.com/api/webhooks/payhere';
  process.env.PAYHERE_SANDBOX = 'true';
});

afterEach(() => {
  delete process.env.PAYHERE_MERCHANT_ID;
  delete process.env.PAYHERE_MERCHANT_SECRET;
  delete process.env.PAYHERE_NOTIFY_URL;
  delete process.env.PAYHERE_SANDBOX;
});

describe('PayHere checkout', () => {
  it('computes the hash exactly as PayHere specifies', async () => {
    const { service } = build();
    const form = await service.createCheckout({
      tenantId: 'tenant_1',
      plan: PlanTier.STARTER,
      interval: BillingInterval.MONTHLY,
      returnUrl: 'https://bizopsmateai.com/app/billing?payhere=success',
      cancelUrl: 'https://bizopsmateai.com/app/billing?payhere=cancelled',
      customer,
    });

    const expected = md5Upper(
      MERCHANT_ID + form.orderId + '2500.00' + 'LKR' + md5Upper(MERCHANT_SECRET),
    );
    expect(form.fields.hash).toBe(expected);
  });

  it('formats the amount with exactly two decimals, which PayHere requires', async () => {
    const { service } = build();
    const form = await service.createCheckout({
      tenantId: 'tenant_1',
      plan: PlanTier.GROWTH,
      interval: BillingInterval.MONTHLY,
      returnUrl: 'https://x/r',
      cancelUrl: 'https://x/c',
      customer,
    });

    expect(form.fields.amount).toBe('7500.00');
    expect(form.amountFormatted).toBe('7500.00');
  });

  it('posts to the sandbox until PAYHERE_SANDBOX is explicitly false', async () => {
    const { service } = build();
    const sandbox = await service.createCheckout({
      tenantId: 'tenant_1',
      plan: PlanTier.STARTER,
      interval: BillingInterval.MONTHLY,
      returnUrl: 'https://x/r',
      cancelUrl: 'https://x/c',
      customer,
    });
    expect(sandbox.action).toBe('https://sandbox.payhere.lk/pay/checkout');

    process.env.PAYHERE_SANDBOX = 'false';
    const live = await service.createCheckout({
      tenantId: 'tenant_1',
      plan: PlanTier.STARTER,
      interval: BillingInterval.MONTHLY,
      returnUrl: 'https://x/r',
      cancelUrl: 'https://x/c',
      customer,
    });
    expect(live.action).toBe('https://www.payhere.lk/pay/checkout');
  });

  it('records a pending payment first, so notify can trust our figures not theirs', async () => {
    const { service, state } = build();
    const form = await service.createCheckout({
      tenantId: 'tenant_1',
      plan: PlanTier.GROWTH,
      interval: BillingInterval.MONTHLY,
      returnUrl: 'https://x/r',
      cancelUrl: 'https://x/c',
      customer,
    });

    expect(state.billingPayments).toHaveLength(1);
    expect(state.billingPayments[0]).toMatchObject({
      orderId: form.orderId,
      plan: PlanTier.GROWTH,
      amountMinor: 750_000,
      succeeded: false,
      statusCode: 'CREATED',
    });
  });

  it('generates a unique order id, because PayHere does not enforce uniqueness', async () => {
    const { service } = build();
    const args = {
      tenantId: 'tenant_1',
      plan: PlanTier.STARTER,
      interval: BillingInterval.MONTHLY,
      returnUrl: 'https://x/r',
      cancelUrl: 'https://x/c',
      customer,
    };

    const first = await service.createCheckout(args);
    const second = await service.createCheckout(args);
    expect(first.orderId).not.toBe(second.orderId);
  });

  it('rejects annual Growth, which exceeds the PayHere LITE per-payment ceiling', async () => {
    const { service } = build();

    await expect(
      service.createCheckout({
        tenantId: 'tenant_1',
        plan: PlanTier.GROWTH,
        interval: BillingInterval.ANNUAL,
        returnUrl: 'https://x/r',
        cancelUrl: 'https://x/c',
        customer,
      }),
    ).rejects.toThrow(/cannot exceed LKR 50,000/);
  });

  it('refuses to build a checkout without merchant credentials', async () => {
    delete process.env.PAYHERE_MERCHANT_SECRET;
    const { service } = build();

    await expect(
      service.createCheckout({
        tenantId: 'tenant_1',
        plan: PlanTier.STARTER,
        interval: BillingInterval.MONTHLY,
        returnUrl: 'https://x/r',
        cancelUrl: 'https://x/c',
        customer,
      }),
    ).rejects.toThrow(/Payments are not configured/);
  });
});

describe('PayHere notify callback', () => {
  async function withPendingPayment(
    interval: BillingInterval = BillingInterval.MONTHLY,
    plan: PlanTier = PlanTier.GROWTH,
  ) {
    const ctx = build();
    const form = await ctx.service.createCheckout({
      tenantId: 'tenant_1',
      plan,
      interval,
      returnUrl: 'https://x/r',
      cancelUrl: 'https://x/c',
      customer,
    });
    return { ...ctx, orderId: form.orderId, amount: form.amountFormatted };
  }

  function notifyParams(
    orderId: string,
    amount: string,
    statusCode: string,
    overrides: Record<string, string> = {},
  ) {
    return {
      order_id: orderId,
      payhere_amount: amount,
      payhere_currency: 'LKR',
      status_code: statusCode,
      md5sig: notifySignature(orderId, amount, 'LKR', statusCode),
      payment_id: '320027',
      ...overrides,
    };
  }

  it('activates the subscription and sets a period end on a successful payment', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();

    const result = await service.handleNotify(notifyParams(orderId, amount, '2'));

    expect(result.received).toBe(true);
    const subscription = state.subscriptions[0]!;
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.plan).toBe(PlanTier.GROWTH);
    expect(subscription.trialEndsAt).toBeNull();
    expect(subscription.currentPeriodEnd).toBeInstanceOf(Date);
    expect(subscription.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
  });

  it('applies the purchased plan token allowance to the tenant', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();

    await service.handleNotify(notifyParams(orderId, amount, '2'));

    // Growth allowance, not the Starter default the tenant started on.
    expect(state.tenants[0]!.tokenBudget).toBe(5_000_000n);
  });

  it('grants twelve months for an annual payment', async () => {
    const { service, state, orderId, amount } = await withPendingPayment(
      BillingInterval.ANNUAL,
      PlanTier.STARTER,
    );

    await service.handleNotify(notifyParams(orderId, amount, '2'));

    const end = state.subscriptions[0]!.currentPeriodEnd!;
    const monthsGranted =
      (end.getFullYear() - new Date().getFullYear()) * 12 + (end.getMonth() - new Date().getMonth());
    expect(monthsGranted).toBe(12);
  });

  it('extends from the existing period end, so paying early loses no days', async () => {
    const existingEnd = daysFromNow(20);
    const ctx = build({
      subscriptions: [
        {
          id: 'sub_1',
          tenantId: 'tenant_1',
          plan: PlanTier.STARTER,
          status: SubscriptionStatus.ACTIVE,
          provider: 'PAYHERE',
          trialEndsAt: null,
          currentPeriodEnd: existingEnd,
        },
      ],
    });
    const form = await ctx.service.createCheckout({
      tenantId: 'tenant_1',
      plan: PlanTier.STARTER,
      interval: BillingInterval.MONTHLY,
      returnUrl: 'https://x/r',
      cancelUrl: 'https://x/c',
      customer,
    });

    await ctx.service.handleNotify(notifyParams(form.orderId, form.amountFormatted, '2'));

    const newEnd = ctx.state.subscriptions[0]!.currentPeriodEnd!;
    expect(newEnd.getTime()).toBeGreaterThan(existingEnd.getTime());
  });

  it('ignores a callback whose signature does not verify', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();

    const result = await service.handleNotify(
      notifyParams(orderId, amount, '2', { md5sig: 'DEADBEEF'.repeat(4) }),
    );

    expect(result.received).toBe(false);
    expect(state.subscriptions[0]!.status).toBe(SubscriptionStatus.TRIALING);
  });

  it('ignores a callback with no signature at all', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();
    const params = notifyParams(orderId, amount, '2');
    delete (params as Record<string, string | undefined>).md5sig;

    expect((await service.handleNotify(params)).received).toBe(false);
    expect(state.subscriptions[0]!.status).toBe(SubscriptionStatus.TRIALING);
  });

  it('refuses a correctly signed callback whose amount does not match our record', async () => {
    // The signature covers the amount, so this only happens if the merchant secret
    // leaked. Trusting it would sell Growth for the price of a coffee.
    const { service, state, orderId } = await withPendingPayment();

    const result = await service.handleNotify(notifyParams(orderId, '1.00', '2'));

    expect(result.received).toBe(false);
    expect(state.subscriptions[0]!.status).toBe(SubscriptionStatus.TRIALING);
  });

  it('ignores a callback for an order we never created', async () => {
    const { service } = build();

    const result = await service.handleNotify(notifyParams('LP-NOT-OURS', '2500.00', '2'));

    expect(result.received).toBe(false);
  });

  it.each([
    ['0', 'pending'],
    ['-1', 'cancelled'],
    ['-2', 'failed'],
  ])('grants nothing for status %s (%s)', async (statusCode) => {
    const { service, state, orderId, amount } = await withPendingPayment();

    await service.handleNotify(notifyParams(orderId, amount, statusCode));

    expect(state.subscriptions[0]!.status).toBe(SubscriptionStatus.TRIALING);
    expect(state.billingPayments[0]).toMatchObject({ statusCode, succeeded: false });
  });

  it('marks the subscription past due on a chargeback', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();
    await service.handleNotify(notifyParams(orderId, amount, '2'));

    await service.handleNotify(notifyParams(orderId, amount, '-3'));

    expect(state.subscriptions[0]!.status).toBe(SubscriptionStatus.PAST_DUE);
  });

  it('rejects a malformed notification outright', async () => {
    const { service } = build();

    await expect(service.handleNotify({ md5sig: 'x' })).rejects.toThrow(/Malformed/);
  });

  it('fails closed when the merchant secret is missing, rather than skipping verification', async () => {
    const { service, orderId, amount } = await withPendingPayment();
    delete process.env.PAYHERE_MERCHANT_SECRET;

    await expect(service.handleNotify(notifyParams(orderId, amount, '2'))).rejects.toThrow(
      /Payments are not configured/,
    );
  });

  it('records the payment outcome for the audit trail', async () => {
    const { service, audit, orderId, amount } = await withPendingPayment();

    await service.handleNotify(notifyParams(orderId, amount, '2'));

    expect(audit.entries.map((e) => e.event)).toContain('billing_webhook_payhere');
  });
});

describe('PayHere recurring (PLUS merchant plan)', () => {
  beforeEach(() => {
    process.env.PAYHERE_MERCHANT_PLAN = 'PLUS';
  });

  afterEach(() => {
    delete process.env.PAYHERE_MERCHANT_PLAN;
  });

  async function withPendingPayment(plan: PlanTier = PlanTier.GROWTH) {
    const ctx = build();
    const form = await ctx.service.createCheckout({
      tenantId: 'tenant_1',
      plan,
      interval: BillingInterval.MONTHLY,
      returnUrl: 'https://x/r',
      cancelUrl: 'https://x/c',
      customer,
    });
    return { ...ctx, orderId: form.orderId, amount: form.amountFormatted, form };
  }

  /** A notify callback carrying the recurring fields PayHere adds on PLUS. */
  function recurringParams(
    orderId: string,
    amount: string,
    statusCode: string,
    recurring: Record<string, string> = {},
  ) {
    return {
      order_id: orderId,
      payhere_amount: amount,
      payhere_currency: 'LKR',
      status_code: statusCode,
      md5sig: notifySignature(orderId, amount, 'LKR', statusCode),
      payment_id: '320027',
      subscription_id: 'SUB-9911',
      item_rec_status: 'ACTIVE',
      item_rec_install_paid: '1',
      item_rec_date_next: '2026-08-25 00:00:00',
      ...recurring,
    };
  }

  it('asks PayHere to keep charging, rather than taking a single payment', async () => {
    const { form } = await withPendingPayment();

    expect(form.recurring).toBe(true);
    expect(form.fields.recurrence).toBe('1 Month');
    expect(form.fields.duration).toBe('Forever');
  });

  it('bills annually as a yearly recurrence', async () => {
    const ctx = build();
    const form = await ctx.service.createCheckout({
      tenantId: 'tenant_1',
      plan: PlanTier.STARTER,
      interval: BillingInterval.ANNUAL,
      returnUrl: 'https://x/r',
      cancelUrl: 'https://x/c',
      customer,
    });

    expect(form.fields.recurrence).toBe('1 Year');
  });

  it('leaves the recurrence fields out on the LITE plan', async () => {
    process.env.PAYHERE_MERCHANT_PLAN = 'LITE';
    const { form } = await withPendingPayment();

    expect(form.recurring).toBe(false);
    expect(form.fields.recurrence).toBeUndefined();
  });

  it('allows annual Growth, which exceeds the LITE per-payment ceiling', async () => {
    // LKR 75,000 is above LITE's 50,000 limit but inside PLUS's 250,000.
    const ctx = build();
    await expect(
      ctx.service.createCheckout({
        tenantId: 'tenant_1',
        plan: PlanTier.GROWTH,
        interval: BillingInterval.ANNUAL,
        returnUrl: 'https://x/r',
        cancelUrl: 'https://x/c',
        customer,
      }),
    ).resolves.toMatchObject({ amountFormatted: '75000.00' });
  });

  it('stores the gateway subscription id so renewals can be traced back', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();

    await service.handleNotify(recurringParams(orderId, amount, '2'));

    expect(state.subscriptions[0]).toMatchObject({
      externalSubId: 'SUB-9911',
      status: SubscriptionStatus.ACTIVE,
    });
  });

  it("takes the period end from PayHere's next billing date, with a retry grace", async () => {
    const { service, state, orderId, amount } = await withPendingPayment();

    await service.handleNotify(recurringParams(orderId, amount, '2'));

    const subscription = state.subscriptions[0]!;
    // 25 Aug 2026 00:00 Sri Lanka time, plus three days of grace.
    expect(subscription.nextBillingAt!.toISOString()).toBe('2026-08-24T18:30:00.000Z');
    expect(subscription.currentPeriodEnd!.toISOString()).toBe('2026-08-27T18:30:00.000Z');
  });

  it('gives each instalment its own row in the payment history', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();

    await service.handleNotify(recurringParams(orderId, amount, '2'));
    await service.handleNotify(
      recurringParams(orderId, amount, '2', {
        item_rec_install_paid: '2',
        item_rec_date_next: '2026-09-25 00:00:00',
      }),
    );

    expect(state.billingPayments).toHaveLength(2);
    expect(state.billingPayments[1]).toMatchObject({
      orderId: `${orderId}-R2`,
      installment: 2,
      succeeded: true,
    });
  });

  it('does not double-count an instalment PayHere sends twice', async () => {
    // PayHere resends anything it did not get a 2xx for.
    const { service, state, orderId, amount } = await withPendingPayment();
    await service.handleNotify(recurringParams(orderId, amount, '2'));

    const second = recurringParams(orderId, amount, '2', { item_rec_install_paid: '2' });
    await service.handleNotify(second);
    await service.handleNotify(second);

    expect(state.billingPayments).toHaveLength(2);
  });

  it('stops treating the plan as renewing once PayHere cancels the series', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();
    await service.handleNotify(recurringParams(orderId, amount, '2'));

    await service.handleNotify(
      recurringParams(orderId, amount, '2', { item_rec_status: 'CANCELLED' }),
    );

    const subscription = state.subscriptions[0]!;
    expect(subscription.cancelAtPeriodEnd).toBe(true);
    expect(subscription.nextBillingAt).toBeNull();
    // The period they already paid for is untouched.
    expect(subscription.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
  });

  it('marks the tenant past due when PayHere gives up on the charge', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();
    await service.handleNotify(recurringParams(orderId, amount, '2'));

    await service.handleNotify(
      recurringParams(orderId, amount, '-2', { item_rec_status: 'FAILED' }),
    );

    expect(state.subscriptions[0]!.status).toBe(SubscriptionStatus.PAST_DUE);
  });

  it('revives a series that starts paying again after a failure', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();
    await service.handleNotify(
      recurringParams(orderId, amount, '2', { item_rec_status: 'CANCELLED' }),
    );

    await service.handleNotify(
      recurringParams(orderId, amount, '2', { item_rec_install_paid: '2' }),
    );

    expect(state.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
    });
  });

  it('handles a date-only next billing date', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();

    await service.handleNotify(
      recurringParams(orderId, amount, '2', { item_rec_date_next: '2026-08-25' }),
    );

    expect(state.subscriptions[0]!.nextBillingAt!.toISOString()).toBe('2026-08-24T18:30:00.000Z');
  });

  it('falls back to our own month arithmetic when PayHere sends no next date', async () => {
    const { service, state, orderId, amount } = await withPendingPayment();

    await service.handleNotify(
      recurringParams(orderId, amount, '2', { item_rec_date_next: '' }),
    );

    const subscription = state.subscriptions[0]!;
    expect(subscription.nextBillingAt).toBeNull();
    expect(subscription.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
  });
});
