import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '@ledgerpilot/shared';
import { BillingService } from '../src/billing/billing.service.js';
import { EntitlementsService } from '../src/billing/entitlements.service.js';
import { PayHereService } from '../src/billing/payhere.service.js';
import {
  createFakeAudit,
  createFakePrisma,
  daysFromNow,
  emptyState,
  tenantFixture,
  type FakeState,
  type FakeSubscription,
} from './fake-prisma.js';
import type { AuditLogService } from '../src/common/audit-log.service.js';

function subscription(overrides: Partial<FakeSubscription> = {}): FakeSubscription {
  return {
    id: 'sub_1',
    tenantId: 'tenant_1',
    plan: PlanTier.GROWTH,
    status: SubscriptionStatus.ACTIVE,
    provider: 'PAYHERE',
    trialEndsAt: null,
    currentPeriodEnd: daysFromNow(20),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

function build(state: Partial<FakeState> = {}) {
  const full = emptyState({
    tenants: [tenantFixture()],
    subscriptions: [subscription()],
    ...state,
  });
  const prisma = createFakePrisma(full);
  const audit = createFakeAudit();
  const service = new BillingService(
    prisma,
    audit.service as unknown as AuditLogService,
    new EntitlementsService(prisma),
    new PayHereService(prisma, audit.service as unknown as AuditLogService),
  );
  return { service, state: full, audit };
}

describe('cancelling a subscription', () => {
  it('keeps access until the period the customer already paid for ends', async () => {
    // The refund policy and the cancel dialog both promise this, so revoking
    // immediately would be taking money for time we did not give.
    const { service, state } = build();

    const result = await service.cancel('tenant_1', 'user_1');

    expect(result.immediate).toBe(false);
    expect(result.accessUntil).toEqual(state.subscriptions[0]!.currentPeriodEnd);
    expect(state.subscriptions[0]).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: true,
    });
  });

  it('leaves the customer able to work right after cancelling', async () => {
    const { service, state } = build();
    const prisma = createFakePrisma(state);

    await service.cancel('tenant_1', 'user_1');

    const entitlements = await new EntitlementsService(prisma).getState('tenant_1');
    expect(entitlements.active).toBe(true);
    expect(entitlements.cancelAtPeriodEnd).toBe(true);
  });

  it('ends a trial there and then, since there is no paid period to honour', async () => {
    const { service, state } = build({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.TRIALING,
          trialEndsAt: daysFromNow(7),
          currentPeriodEnd: null,
        }),
      ],
    });

    const result = await service.cancel('tenant_1', 'user_1');

    expect(result.immediate).toBe(true);
    expect(state.subscriptions[0]!.status).toBe(SubscriptionStatus.CANCELED);
  });

  it('cancels outright when the paid period has already lapsed', async () => {
    const { service, state } = build({
      subscriptions: [subscription({ currentPeriodEnd: daysFromNow(-2) })],
    });

    await service.cancel('tenant_1', 'user_1');

    expect(state.subscriptions[0]!.status).toBe(SubscriptionStatus.CANCELED);
  });

  it('stops any automatic renewal so the card is not charged again', async () => {
    const { service, state } = build({
      subscriptions: [subscription({ nextBillingAt: daysFromNow(20) })],
    });

    await service.cancel('tenant_1', 'user_1');

    expect(state.subscriptions[0]!.nextBillingAt).toBeNull();
  });

  it('records who cancelled and until when', async () => {
    const { service, audit } = build();

    await service.cancel('tenant_1', 'nimal');

    expect(audit.entries).toEqual([
      expect.objectContaining({
        event: 'billing_subscription_canceled',
        payload: expect.objectContaining({ actor: 'nimal' }),
      }),
    ]);
  });
});

describe('resuming a cancelled subscription', () => {
  it('clears the pending cancellation', async () => {
    const { service, state } = build({
      subscriptions: [subscription({ cancelAtPeriodEnd: true })],
    });

    await service.resume('tenant_1', 'user_1');

    expect(state.subscriptions[0]).toMatchObject({
      cancelAtPeriodEnd: false,
      status: SubscriptionStatus.ACTIVE,
    });
  });

  it('refuses when nothing was cancelled', async () => {
    const { service } = build();

    await expect(service.resume('tenant_1', 'user_1')).rejects.toThrow(BadRequestException);
  });

  it('refuses once the paid period has run out, so they have to pay again', async () => {
    const { service } = build({
      subscriptions: [subscription({ cancelAtPeriodEnd: true, currentPeriodEnd: daysFromNow(-1) })],
    });

    await expect(service.resume('tenant_1', 'user_1')).rejects.toThrow(/already ended/);
  });
});

describe('the billing summary', () => {
  it('tells the page whether money will be taken again on its own', async () => {
    const { service } = build({
      subscriptions: [subscription({ nextBillingAt: daysFromNow(20) })],
    });

    const summary = await service.getSubscriptionSummary('tenant_1');

    expect(summary.autoRenews).toBe(true);
    expect(summary.cancelAtPeriodEnd).toBe(false);
  });

  it('does not claim auto-renewal for a subscription that is ending', async () => {
    const { service } = build({
      subscriptions: [subscription({ nextBillingAt: daysFromNow(20), cancelAtPeriodEnd: true })],
    });

    const summary = await service.getSubscriptionSummary('tenant_1');

    expect(summary.autoRenews).toBe(false);
  });

  it('does not claim auto-renewal for a one-time payment', async () => {
    const { service } = build();

    const summary = await service.getSubscriptionSummary('tenant_1');

    expect(summary.autoRenews).toBe(false);
  });
});
