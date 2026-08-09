import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '@ledgerpilot/shared';
import { EntitlementsGuard } from '../src/billing/entitlements.guard.js';
import {
  EntitlementsService,
  UpgradeRequiredException,
} from '../src/billing/entitlements.service.js';
import { AllowInactive, RequiresFeature } from '../src/billing/entitlements.decorators.js';
import { Public } from '../src/auth/decorators.js';
import {
  createFakePrisma,
  daysFromNow,
  emptyState,
  tenantFixture,
  type FakeSubscription,
} from './fake-prisma.js';

/**
 * Handlers used purely as decorator carriers. The guard reads metadata off the
 * handler and class, so exercising it needs real decorated methods rather than a
 * mocked Reflector — a mock would let the guard and the decorators drift apart.
 */
class PlainController {
  write() {}
  read() {}

  @AllowInactive()
  payUs() {}

  @RequiresFeature('reportExports')
  exportReport() {}
}

@AllowInactive()
class BillingLikeController {
  checkout() {}
}

class PublicController {
  @Public()
  shared() {}
}

function contextFor(
  instance: object,
  method: string,
  request: { method: string; auth?: { tenantId: string } },
): ExecutionContext {
  const handler = (instance as Record<string, unknown>)[method] as () => void;
  return {
    getHandler: () => handler,
    getClass: () => instance.constructor,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

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

function guardWith(sub: FakeSubscription) {
  const state = emptyState({ tenants: [tenantFixture()], subscriptions: [sub] });
  const entitlements = new EntitlementsService(createFakePrisma(state));
  return new EntitlementsGuard(new Reflector(), entitlements);
}

const lapsed = subscription({ trialEndsAt: daysFromNow(-1) });
const live = subscription();
const auth = { tenantId: 'tenant_1' };

describe('EntitlementsGuard', () => {
  it('blocks a write when the subscription has lapsed', async () => {
    const guard = guardWith(lapsed);
    const ctx = contextFor(new PlainController(), 'write', { method: 'POST', auth });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UpgradeRequiredException);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('blocks %s when lapsed', async (method) => {
    const guard = guardWith(lapsed);
    const ctx = contextFor(new PlainController(), 'write', { method, auth });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UpgradeRequiredException);
  });

  it('allows reads when lapsed, so a former customer can still export their data', async () => {
    const guard = guardWith(lapsed);
    const ctx = contextFor(new PlainController(), 'read', { method: 'GET', auth });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows a write while the trial is live', async () => {
    const guard = guardWith(live);
    const ctx = contextFor(new PlainController(), 'write', { method: 'POST', auth });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('lets a lapsed customer reach @AllowInactive routes, or they could never pay', async () => {
    const guard = guardWith(lapsed);
    const ctx = contextFor(new PlainController(), 'payUs', { method: 'POST', auth });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('honours @AllowInactive applied to the whole controller', async () => {
    const guard = guardWith(lapsed);
    const ctx = contextFor(new BillingLikeController(), 'checkout', { method: 'POST', auth });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('gates a @RequiresFeature read even though reads are otherwise open', async () => {
    const guard = guardWith(live); // Starter: no report exports
    const ctx = contextFor(new PlainController(), 'exportReport', { method: 'GET', auth });

    await expect(guard.canActivate(ctx)).rejects.toThrow(/Report exports is not part of/);
  });

  it('allows a @RequiresFeature route on a plan that includes it', async () => {
    const guard = guardWith(subscription({ plan: PlanTier.GROWTH }));
    const ctx = contextFor(new PlainController(), 'exportReport', { method: 'GET', auth });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('skips @Public routes entirely', async () => {
    const guard = guardWith(lapsed);
    const ctx = contextFor(new PublicController(), 'shared', { method: 'GET' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('defers to the auth guard when there is no tenant on the request', async () => {
    const guard = guardWith(lapsed);
    const ctx = contextFor(new PlainController(), 'write', { method: 'POST' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
