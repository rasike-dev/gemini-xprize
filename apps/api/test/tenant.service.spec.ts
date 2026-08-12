import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '@ledgerpilot/shared';
import { TenantService } from '../src/tenant/tenant.service.js';
import { EntitlementsService, UpgradeRequiredException } from '../src/billing/entitlements.service.js';
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
    plan: PlanTier.STARTER,
    status: SubscriptionStatus.TRIALING,
    provider: 'PAYHERE',
    trialEndsAt: daysFromNow(7),
    currentPeriodEnd: null,
    ...overrides,
  };
}

function growthSubscription(): FakeSubscription {
  return subscription({
    plan: PlanTier.GROWTH,
    status: SubscriptionStatus.ACTIVE,
    trialEndsAt: null,
    currentPeriodEnd: daysFromNow(30),
  });
}

function build(state: Partial<FakeState> = {}) {
  const full = emptyState({
    tenants: [tenantFixture()],
    subscriptions: [subscription()],
    ...state,
  });
  const audit = createFakeAudit();
  const prisma = createFakePrisma(full);
  const entitlements = new EntitlementsService(prisma);
  const service = new TenantService(
    prisma,
    audit.service as unknown as AuditLogService,
    entitlements,
  );
  return { service, state: full, audit };
}

describe('TenantService', () => {
  beforeEach(() => {
    process.env.INTAKE_HMAC_SECRET = 'test-intake-master-secret';
    process.env.PUBLIC_API_URL = 'https://api.example.com';
  });

  it('throws NotFound for a missing tenant', async () => {
    const { service } = build({ tenants: [] });

    await expect(service.get('tenant_1')).rejects.toThrow(NotFoundException);
  });

  it('returns profile fields for an existing tenant', async () => {
    const { service } = build({
      tenants: [tenantFixture({ vatNumber: 'LK-VAT-123', currency: 'LKR' })],
    });

    const profile = await service.get('tenant_1');

    expect(profile).toMatchObject({
      id: 'tenant_1',
      name: 'PrintPro Lanka',
      currency: 'LKR',
      vatNumber: 'LK-VAT-123',
      autoSend: false,
    });
  });

  it('updates profile fields and audits the change', async () => {
    const { service, state, audit } = build();

    const updated = await service.update(
      'tenant_1',
      { name: 'PrintPro Updated', currency: 'USD', vatNumber: 'VAT-99' },
      'owner',
    );

    expect(updated.name).toBe('PrintPro Updated');
    expect(state.tenants[0]).toMatchObject({ currency: 'USD', vatNumber: 'VAT-99' });
    expect(audit.entries).toEqual([
      expect.objectContaining({
        event: 'tenant_settings_updated',
        payload: expect.objectContaining({ actor: 'owner' }),
      }),
    ]);
  });

  it('blocks autoSend on Starter without the feature', async () => {
    const { service, state } = build();

    await expect(service.update('tenant_1', { autoSend: true }, 'owner')).rejects.toThrow(
      UpgradeRequiredException,
    );
    expect(state.tenants[0]!.autoSend).toBe(false);
  });

  it('allows autoSend when the plan includes it', async () => {
    const { service, state } = build({ subscriptions: [growthSubscription()] });

    const updated = await service.update('tenant_1', { autoSend: true }, 'owner');

    expect(updated.autoSend).toBe(true);
    expect(state.tenants[0]!.autoSend).toBe(true);
  });

  it('returns intake integration details with a derived signing secret', async () => {
    const { service } = build();

    const integration = await service.integration('tenant_1');
    const expectedSecret = createHmac('sha256', 'test-intake-master-secret')
      .update('intake:tenant_1')
      .digest('hex');

    expect(integration).toEqual({
      intakeUrl: 'https://api.example.com/api/intake',
      orgHeader: 'org_demo_printpro',
      signingSecret: expectedSecret,
    });
  });
});
