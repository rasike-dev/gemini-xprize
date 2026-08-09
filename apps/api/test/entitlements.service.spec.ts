import { describe, expect, it } from 'vitest';
import { PlanTier, SubscriptionStatus } from '@ledgerpilot/shared';
import { EntitlementsService, UpgradeRequiredException } from '../src/billing/entitlements.service.js';
import {
  createFakePrisma,
  daysFromNow,
  emptyState,
  tenantFixture,
  type FakeState,
  type FakeSubscription,
} from './fake-prisma.js';

function subscription(overrides: Partial<FakeSubscription> = {}): FakeSubscription {
  return {
    id: 'sub_1',
    tenantId: 'tenant_1',
    plan: PlanTier.STARTER,
    status: SubscriptionStatus.TRIALING,
    provider: 'PAYHERE',
    trialEndsAt: daysFromNow(7),
    currentPeriodEnd: null,
    ...overrides,
  };
}

function build(state: Partial<FakeState> = {}) {
  const full = emptyState({ tenants: [tenantFixture()], ...state });
  return new EntitlementsService(createFakePrisma(full));
}

describe('EntitlementsService access decisions', () => {
  it('allows a trial that has not expired', async () => {
    const service = build({ subscriptions: [subscription()] });
    const state = await service.getState('tenant_1');

    expect(state.active).toBe(true);
    expect(state.reason).toBeNull();
    expect(state.trialDaysRemaining).toBe(7);
  });

  it('denies access once the trial has run out, with a reason worth showing', async () => {
    const service = build({ subscriptions: [subscription({ trialEndsAt: daysFromNow(-1) })] });
    const state = await service.getState('tenant_1');

    expect(state.active).toBe(false);
    expect(state.reason).toMatch(/free trial has ended/i);
  });

  it('treats a tenant with no subscription row as trialing from its creation date', async () => {
    // Happens in the window between sign-up and the Clerk webhook landing. A new
    // customer must not be told their account does not exist.
    const service = build({ tenants: [tenantFixture({ createdAt: new Date() })] });
    const state = await service.getState('tenant_1');

    expect(state.active).toBe(true);
    expect(state.status).toBe(SubscriptionStatus.TRIALING);
  });

  it('allows an active subscription whose paid period is still running', async () => {
    const service = build({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: daysFromNow(20),
        }),
      ],
    });

    expect((await service.getState('tenant_1')).active).toBe(true);
  });

  it('denies an active subscription whose period has lapsed, without needing a cron job', async () => {
    const service = build({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: daysFromNow(-1),
        }),
      ],
    });
    const state = await service.getState('tenant_1');

    expect(state.active).toBe(false);
    expect(state.reason).toMatch(/period has ended/i);
  });

  it('fails closed when a subscription is ACTIVE but has no period end', async () => {
    // A row like this means we never confirmed a payment, so granting access would
    // be giving the product away on the strength of a column we did not write.
    const service = build({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.ACTIVE,
          trialEndsAt: null,
          currentPeriodEnd: null,
        }),
      ],
    });

    expect((await service.getState('tenant_1')).active).toBe(false);
  });

  it.each([
    [SubscriptionStatus.PAST_DUE, /did not go through/i],
    [SubscriptionStatus.CANCELED, /cancelled/i],
  ])('denies access when the status is %s', async (status, reason) => {
    const service = build({
      subscriptions: [subscription({ status, trialEndsAt: null, currentPeriodEnd: daysFromNow(20) })],
    });
    const state = await service.getState('tenant_1');

    expect(state.active).toBe(false);
    expect(state.reason).toMatch(reason);
  });
});

describe('EntitlementsService feature gating', () => {
  it('refuses a Growth feature on Starter with a 402 and an explanation', async () => {
    const service = build({ subscriptions: [subscription({ plan: PlanTier.STARTER })] });

    await expect(service.assertFeature('tenant_1', 'whatsappLinks')).rejects.toThrow(
      UpgradeRequiredException,
    );
    await expect(service.assertFeature('tenant_1', 'whatsappLinks')).rejects.toThrow(
      /WhatsApp follow-ups is not part of the Starter plan/,
    );
  });

  it('allows a Growth feature on Growth', async () => {
    const service = build({ subscriptions: [subscription({ plan: PlanTier.GROWTH })] });

    await expect(service.assertFeature('tenant_1', 'whatsappLinks')).resolves.toBeDefined();
  });

  it('checks the subscription is live before it checks the feature', async () => {
    // Order matters for the message the customer sees: "your trial ended" is more
    // useful than "that feature is not in your plan".
    const service = build({
      subscriptions: [subscription({ plan: PlanTier.GROWTH, trialEndsAt: daysFromNow(-1) })],
    });

    await expect(service.assertFeature('tenant_1', 'whatsappLinks')).rejects.toThrow(
      /free trial has ended/i,
    );
  });
});

describe('EntitlementsService quotas', () => {
  it('blocks an agent run once the period allowance is spent', async () => {
    const service = build({
      tenants: [tenantFixture({ agentRunsUsed: 30 })], // Starter allows 30
      subscriptions: [subscription()],
    });

    await expect(service.assertCanRunAgent('tenant_1')).rejects.toThrow(/all 30 AI actions/);
  });

  it('allows an agent run with allowance remaining', async () => {
    const service = build({
      tenants: [tenantFixture({ agentRunsUsed: 29 })],
      subscriptions: [subscription()],
    });

    await expect(service.assertCanRunAgent('tenant_1')).resolves.toBeUndefined();
  });

  it('blocks the 51st customer on Starter', async () => {
    const service = build({ subscriptions: [subscription()], customerCount: 50 });

    await expect(service.assertCanAddCustomer('tenant_1')).rejects.toThrow(/covers 50 customers/);
  });

  it('never blocks customers on Growth, which is unlimited', async () => {
    const service = build({
      subscriptions: [subscription({ plan: PlanTier.GROWTH })],
      customerCount: 10_000,
    });

    await expect(service.assertCanAddCustomer('tenant_1')).resolves.toBeUndefined();
  });

  it('blocks a second user on Starter, which is single-seat', async () => {
    const service = build({ subscriptions: [subscription()], userCount: 1 });

    await expect(service.assertCanAddUser('tenant_1')).rejects.toThrow(/1 team members/);
  });

  it('reports usage against the limits the plan advertises', async () => {
    const service = build({
      tenants: [tenantFixture({ agentRunsUsed: 12, tokensUsed: 120_000n })],
      subscriptions: [subscription()],
      customerCount: 8,
      userCount: 1,
    });
    const { usage } = await service.getState('tenant_1');

    expect(usage).toMatchObject({
      agentRuns: 12,
      agentRunsLimit: 30,
      customers: 8,
      customersLimit: 50,
      users: 1,
      usersLimit: 1,
      tokensUsed: 120_000,
    });
  });
});

describe('UpgradeRequiredException', () => {
  it('is a 402 so the client can tell "pay us" apart from "you are wrong"', () => {
    expect(new UpgradeRequiredException('nope').getStatus()).toBe(402);
  });
});
