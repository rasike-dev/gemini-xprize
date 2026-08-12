import { describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '@ledgerpilot/shared';
import { CustomersService } from '../src/customers/customers.service.js';
import { EntitlementsService, UpgradeRequiredException } from '../src/billing/entitlements.service.js';
import {
  createFakeAudit,
  createFakePrisma,
  customerFixture,
  daysFromNow,
  emptyState,
  quoteFixture,
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

function build(state: Partial<FakeState> = {}) {
  const full = emptyState({
    tenants: [tenantFixture()],
    subscriptions: [subscription()],
    customers: [customerFixture()],
    ...state,
  });
  const audit = createFakeAudit();
  const prisma = createFakePrisma(full);
  const entitlements = new EntitlementsService(prisma);
  const service = new CustomersService(
    prisma,
    entitlements,
    audit.service as unknown as AuditLogService,
  );
  return { service, state: full, audit, entitlements };
}

describe('CustomersService', () => {
  it('creates a customer and writes an audit entry', async () => {
    const { service, state, audit } = build({ customers: [], customerCount: 0 });

    const created = await service.create(
      'tenant_1',
      { name: 'Kamal Silva', email: 'kamal@example.com' },
      'owner',
    );

    expect(created.name).toBe('Kamal Silva');
    expect(state.customers).toHaveLength(1);
    expect(audit.entries).toEqual([
      expect.objectContaining({ event: 'customer_created', payload: expect.objectContaining({ actor: 'owner' }) }),
    ]);
  });

  it('denies create when the plan customer limit is reached', async () => {
    const atLimit = Array.from({ length: 50 }, (_, i) =>
      customerFixture({ id: `cust_${i}`, name: `Customer ${i}` }),
    );
    const { service, state, audit } = build({ customers: atLimit });

    await expect(
      service.create('tenant_1', { name: 'Over Limit Co' }, 'owner'),
    ).rejects.toThrow(UpgradeRequiredException);
    expect(state.customers).toHaveLength(50);
    expect(audit.entries).toHaveLength(0);
  });

  it('throws NotFound when updating a missing customer', async () => {
    const { service } = build();

    await expect(
      service.update('tenant_1', 'missing', { name: 'Nobody' }, 'owner'),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses delete when invoices or quotes exist', async () => {
    const { service, state } = build({
      invoices: [
        {
          id: 'inv_1',
          tenantId: 'tenant_1',
          number: 'INV-1001',
          status: 'SENT',
          currency: 'LKR',
          subtotalMinor: 100_000,
          taxMinor: 0,
          totalMinor: 100_000,
          paidMinor: 0,
          dueDate: new Date(),
          customerId: 'cust_1',
        },
      ],
    });

    await expect(service.remove('tenant_1', 'cust_1', 'owner')).rejects.toThrow(ConflictException);
    expect(state.customers).toHaveLength(1);
  });

  it('deletes a customer with no financial history', async () => {
    const { service, state, audit } = build();

    await service.remove('tenant_1', 'cust_1', 'owner');

    expect(state.customers).toHaveLength(0);
    expect(audit.entries).toEqual([
      expect.objectContaining({ event: 'customer_deleted', payload: { tenantId: 'tenant_1', actor: 'owner', customerId: 'cust_1' } }),
    ]);
  });

  it('refuses delete when only quotes exist', async () => {
    const { service } = build({
      quotes: [quoteFixture()],
    });

    await expect(service.remove('tenant_1', 'cust_1', 'owner')).rejects.toThrow(/quote\(s\)/);
  });
});
