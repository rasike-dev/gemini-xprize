import { vi } from 'vitest';

vi.mock('@ledgerpilot/notify', () => ({
  sendEmail: vi.fn(async () => ({ simulated: false, id: 'email_1' })),
  quoteEmail: vi.fn(() => ({ subject: 'Quote', text: 'text', html: '<p>html</p>' })),
  reminderEmail: vi.fn(() => ({ text: 'Pay please', html: '<p>Pay please</p>' })),
}));

import { describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { PlanTier, SubscriptionStatus } from '@ledgerpilot/shared';
import { sendEmail } from '@ledgerpilot/notify';
import { RemindersService } from '../src/reminders/reminders.service.js';
import { EntitlementsService, UpgradeRequiredException } from '../src/billing/entitlements.service.js';
import {
  createFakeAudit,
  createFakePrisma,
  customerFixture,
  daysFromNow,
  emptyState,
  reminderFixture,
  tenantFixture,
  type FakeInvoice,
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

function invoice(overrides: Partial<FakeInvoice> = {}): FakeInvoice {
  return {
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
    shareToken: 'share-token-1',
    ...overrides,
  };
}

function build(state: Partial<FakeState> = {}) {
  const full = emptyState({
    tenants: [tenantFixture()],
    subscriptions: [subscription()],
    customers: [customerFixture()],
    invoices: [invoice()],
    reminders: [reminderFixture()],
    ...state,
  });
  const audit = createFakeAudit();
  const prisma = createFakePrisma(full);
  const entitlements = new EntitlementsService(prisma);
  const service = new RemindersService(
    prisma,
    audit.service as unknown as AuditLogService,
    entitlements,
  );
  return { service, state: full, audit };
}

describe('RemindersService.dispatch', () => {
  it('is idempotent when the reminder was already sent', async () => {
    const { service, audit } = build({
      reminders: [reminderFixture({ sentAt: new Date(), channel: 'EMAIL' })],
    });

    const result = await service.dispatch('tenant_1', 'rem_1', 'owner');

    expect(result).toMatchObject({ sent: true, channel: 'EMAIL' });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(audit.entries).toHaveLength(0);
  });

  it('sends email, marks sent, and audits', async () => {
    const { service, state, audit } = build();

    const result = await service.dispatch('tenant_1', 'rem_1', 'owner');

    expect(result).toMatchObject({ sent: true, channel: 'EMAIL' });
    expect(sendEmail).toHaveBeenCalled();
    expect(state.reminders[0]!.sentAt).toBeInstanceOf(Date);
    expect(audit.entries).toEqual([
      expect.objectContaining({ event: 'reminder_sent', payload: expect.objectContaining({ channel: 'EMAIL' }) }),
    ]);
  });

  it('returns a WhatsApp link without marking sent for phone-only customers', async () => {
    const { service, state, audit } = build({
      subscriptions: [growthSubscription()],
      customers: [customerFixture({ email: null, phone: '+94771234567' })],
      reminders: [reminderFixture({ sentAt: null })],
    });

    const result = await service.dispatch('tenant_1', 'rem_1', 'owner');

    expect(result).toMatchObject({ sent: false, channel: 'WHATSAPP' });
    expect(result.whatsAppLink).toMatch(/^https:\/\/wa\.me\//);
    expect(state.reminders[0]!.sentAt).toBeNull();
    expect(state.reminders[0]!.approved).toBe(true);
    expect(audit.entries).toEqual([
      expect.objectContaining({ event: 'reminder_whatsapp_prepared' }),
    ]);
  });

  it('returns NONE when the customer has no contact channel', async () => {
    const { service } = build({
      customers: [customerFixture({ email: null, phone: null })],
    });

    const result = await service.dispatch('tenant_1', 'rem_1', 'owner');

    expect(result).toMatchObject({ sent: false, channel: 'NONE' });
    expect(result.detail).toMatch(/no email address or phone number/i);
  });

  it('throws NotFound for a missing reminder', async () => {
    const { service } = build({ reminders: [] });

    await expect(service.dispatch('tenant_1', 'missing', 'owner')).rejects.toThrow(NotFoundException);
  });
});

describe('RemindersService.whatsAppLinkFor', () => {
  it('returns a link when entitled and the customer has a phone number', async () => {
    const { service } = build({
      subscriptions: [growthSubscription()],
      customers: [customerFixture({ email: null, phone: '+94771234567' })],
    });

    const { url } = await service.whatsAppLinkFor('tenant_1', 'rem_1');

    expect(url).toMatch(/^https:\/\/wa\.me\//);
  });

  it('returns null when whatsappLinks is not on the plan', async () => {
    const { service } = build({
      customers: [customerFixture({ email: null, phone: '+94771234567' })],
    });

    await expect(service.whatsAppLinkFor('tenant_1', 'rem_1')).rejects.toThrow(
      UpgradeRequiredException,
    );
  });
});
