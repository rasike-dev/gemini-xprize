import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ledgerpilot/notify', () => ({
  sendEmail: vi.fn(async () => ({ simulated: false, id: 'email_1' })),
  quoteEmail: vi.fn(() => ({
    subject: 'Your quote from PrintPro',
    text: 'Quote body text',
    html: '<p>Quote body</p>',
  })),
  reminderEmail: vi.fn(() => ({ text: 'Reminder text', html: '<p>Reminder</p>' })),
}));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PlanTier, QuoteStatus, SubscriptionStatus } from '@ledgerpilot/shared';
import { sendEmail } from '@ledgerpilot/notify';
import { QuotesService } from '../src/quotes/quotes.service.js';
import { InvoicesService } from '../src/invoices/invoices.service.js';
import { EntitlementsService, UpgradeRequiredException } from '../src/billing/entitlements.service.js';
import {
  createFakeAudit,
  createFakePrisma,
  customerFixture,
  daysFromNow,
  emptyState,
  quoteFixture,
  tenantFixture,
  type FakeQuoteLine,
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
    customers: [customerFixture()],
    ...state,
  });
  const audit = createFakeAudit();
  const prisma = createFakePrisma(full);
  const entitlements = new EntitlementsService(prisma);
  const service = new QuotesService(
    prisma,
    audit.service as unknown as AuditLogService,
    entitlements,
  );
  return { service, state: full, audit, prisma, entitlements };
}

describe('QuotesService.create', () => {
  it('computes line totals, tax, and assigns a quote number', async () => {
    const { service } = build({ quotes: [] });

    const quote = await service.create('tenant_1', {
      customerId: 'cust_1',
      currency: 'LKR',
      lines: [{ description: 'Posters', quantity: 10, unitPriceMinor: 10_000, taxRatePct: 18 }],
    });

    expect(quote.number).toMatch(/^Q-\d+/);
    expect(quote.subtotalMinor).toBe(100_000);
    expect(quote.totalMinor).toBeGreaterThan(quote.subtotalMinor);
    expect(quote.lines).toHaveLength(1);
    expect(quote.lines![0]!.totalMinor).toBeGreaterThan(10_000 * 10);
  });
});

describe('QuotesService.update and remove', () => {
  it('updates a DRAFT quote', async () => {
    const { service, audit } = build({ quotes: [quoteFixture()] });

    const updated = await service.update(
      'tenant_1',
      'quote_1',
      { notes: 'Rush order' },
      'owner',
    );

    expect(updated.notes).toBe('Rush order');
    expect(audit.entries).toEqual([
      expect.objectContaining({ event: 'quote_updated', payload: expect.objectContaining({ quoteId: 'quote_1' }) }),
    ]);
  });

  it('refuses to update a SENT quote', async () => {
    const { service } = build({ quotes: [quoteFixture({ status: QuoteStatus.SENT })] });

    await expect(
      service.update('tenant_1', 'quote_1', { notes: 'Too late' }, 'owner'),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses to delete a SENT quote', async () => {
    const { service, state } = build({ quotes: [quoteFixture({ status: QuoteStatus.SENT })] });

    await expect(service.remove('tenant_1', 'quote_1', 'owner')).rejects.toThrow(ConflictException);
    expect(state.quotes).toHaveLength(1);
  });

  it('deletes a DRAFT quote', async () => {
    const { service, state, audit } = build({ quotes: [quoteFixture()] });

    await service.remove('tenant_1', 'quote_1', 'owner');

    expect(state.quotes).toHaveLength(0);
    expect(audit.entries).toEqual([
      expect.objectContaining({ event: 'quote_deleted' }),
    ]);
  });
});

describe('QuotesService.send', () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockClear();
  });

  it('emails the customer and marks the quote SENT', async () => {
    const { service, audit } = build({ quotes: [quoteFixture()] });

    const result = await service.send('tenant_1', 'quote_1', 'owner');

    expect(result.status).toBe(QuoteStatus.SENT);
    expect(result.whatsAppLink).toBeNull();
    expect(sendEmail).toHaveBeenCalled();
    expect(audit.entries).toEqual([
      expect.objectContaining({ event: 'quote_sent', payload: expect.objectContaining({ viaEmail: true }) }),
    ]);
  });

  it('returns a WhatsApp link for phone-only customers when entitled', async () => {
    const { service } = build({
      subscriptions: [growthSubscription()],
      customers: [customerFixture({ email: null, phone: '+94771234567' })],
      quotes: [quoteFixture()],
    });

    const result = await service.send('tenant_1', 'quote_1', 'owner');

    expect(result.status).toBe(QuoteStatus.SENT);
    expect(result.whatsAppLink).toMatch(/^https:\/\/wa\.me\//);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('requires whatsappLinks entitlement for phone-only send', async () => {
    const { service } = build({
      customers: [customerFixture({ email: null, phone: '+94771234567' })],
      quotes: [quoteFixture()],
    });

    await expect(service.send('tenant_1', 'quote_1', 'owner')).rejects.toThrow(
      UpgradeRequiredException,
    );
  });

  it('rejects send when the customer has no contact details', async () => {
    const { service } = build({
      customers: [customerFixture({ email: null, phone: null })],
      quotes: [quoteFixture()],
    });

    await expect(service.send('tenant_1', 'quote_1', 'owner')).rejects.toThrow(BadRequestException);
  });
});

describe('QuotesService accept flow', () => {
  const quoteLines: FakeQuoteLine[] = [
    {
      id: 'ql_1',
      tenantId: 'tenant_1',
      quoteId: 'quote_1',
      description: 'Brochures',
      quantity: 5,
      unitPriceMinor: 20_000,
      taxRatePct: 18,
      totalMinor: 118_000,
    },
  ];

  it('accept status plus createFromQuote produces an invoice', async () => {
    const { service, prisma } = build({
      quotes: [quoteFixture()],
      quoteLines,
      invoices: [],
    });
    const invoices = new InvoicesService(prisma, { log: () => {}, list: async () => [] } as never);

    await service.setStatus('tenant_1', 'quote_1', QuoteStatus.ACCEPTED);
    const invoice = await invoices.createFromQuote('tenant_1', 'quote_1');

    expect(invoice.quoteId).toBe('quote_1');
    expect(invoice.lines).toHaveLength(1);
  });

  it('throws NotFound for setStatus on a missing quote', async () => {
    const { service } = build({ quotes: [] });

    await expect(service.setStatus('tenant_1', 'missing', QuoteStatus.ACCEPTED)).rejects.toThrow(
      NotFoundException,
    );
  });
});
