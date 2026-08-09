import { describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InvoiceStatus } from '@ledgerpilot/shared';
import { InvoicesService } from '../src/invoices/invoices.service.js';
import {
  createFakeAudit,
  createFakePrisma,
  emptyState,
  tenantFixture,
  type FakeInvoice,
  type FakeState,
} from './fake-prisma.js';
import type { AuditLogService } from '../src/common/audit-log.service.js';

function invoice(overrides: Partial<FakeInvoice> = {}): FakeInvoice {
  return {
    id: 'inv_1',
    tenantId: 'tenant_1',
    number: 'INV-1001',
    status: InvoiceStatus.SENT,
    currency: 'LKR',
    subtotalMinor: 1_000_000,
    taxMinor: 180_000,
    totalMinor: 1_180_000,
    paidMinor: 0,
    dueDate: new Date(),
    customerId: 'cust_1',
    ...overrides,
  };
}

function build(state: Partial<FakeState> = {}) {
  const full = emptyState({ tenants: [tenantFixture()], invoices: [invoice()], ...state });
  const audit = createFakeAudit();
  const service = new InvoicesService(
    createFakePrisma(full),
    audit.service as unknown as AuditLogService,
  );
  return { service, state: full, audit };
}

describe('recording a payment', () => {
  it('marks the invoice paid when the full amount comes in', async () => {
    const { service, state } = build();

    await service.recordPayment('tenant_1', 'inv_1', 1_180_000, 'Bank transfer', 'user_1');

    expect(state.invoices[0]).toMatchObject({
      paidMinor: 1_180_000,
      status: InvoiceStatus.PAID,
    });
  });

  it('marks it partially paid when only some of it arrives', async () => {
    const { service, state } = build();

    await service.recordPayment('tenant_1', 'inv_1', 500_000, 'Cash', 'user_1');

    expect(state.invoices[0]).toMatchObject({
      paidMinor: 500_000,
      status: InvoiceStatus.PARTIALLY_PAID,
    });
  });

  it('accumulates instalments until the invoice is settled', async () => {
    const { service, state } = build();

    await service.recordPayment('tenant_1', 'inv_1', 600_000, 'Cash', 'user_1');
    await service.recordPayment('tenant_1', 'inv_1', 580_000, 'Cash', 'user_1');

    expect(state.invoices[0]!.status).toBe(InvoiceStatus.PAID);
    expect(state.payments).toHaveLength(2);
  });

  it('rejects more than the outstanding balance, since that is nearly always a typo', async () => {
    const { service, state } = build();

    await expect(
      service.recordPayment('tenant_1', 'inv_1', 2_000_000, 'Cash', 'user_1'),
    ).rejects.toThrow(BadRequestException);
    // Nothing should have been written.
    expect(state.payments).toHaveLength(0);
    expect(state.invoices[0]!.paidMinor).toBe(0);
  });

  it('tells the customer how much is actually outstanding when they overpay', async () => {
    const { service } = build({ invoices: [invoice({ paidMinor: 1_000_000 })] });

    await expect(service.recordPayment('tenant_1', 'inv_1', 500_000, 'Cash', 'user_1')).rejects.toThrow(
      /1800\.00 still outstanding/,
    );
  });

  it('refuses to record against a voided invoice', async () => {
    const { service } = build({ invoices: [invoice({ status: InvoiceStatus.VOID })] });

    await expect(
      service.recordPayment('tenant_1', 'inv_1', 100_000, 'Cash', 'user_1'),
    ).rejects.toThrow(ConflictException);
  });

  it('fails clearly for an invoice that does not exist', async () => {
    const { service } = build();

    await expect(
      service.recordPayment('tenant_1', 'nope', 100_000, 'Cash', 'user_1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('writes an audit entry, because money moving needs a record of who said so', async () => {
    const { service, audit } = build();

    await service.recordPayment('tenant_1', 'inv_1', 100_000, 'Cash', 'nimal');

    expect(audit.entries).toEqual([
      expect.objectContaining({
        event: 'payment_recorded',
        payload: expect.objectContaining({ actor: 'nimal', amountMinor: 100_000 }),
      }),
    ]);
  });
});

describe('voiding an invoice', () => {
  it('voids an unpaid invoice', async () => {
    const { service, state } = build();

    await service.voidInvoice('tenant_1', 'inv_1', 'user_1');

    expect(state.invoices[0]!.status).toBe(InvoiceStatus.VOID);
  });

  it('refuses to void an invoice that has payments against it', async () => {
    // Voiding would erase a record of money actually received.
    const { service, state } = build({ invoices: [invoice({ paidMinor: 500_000 })] });

    await expect(service.voidInvoice('tenant_1', 'inv_1', 'user_1')).rejects.toThrow(
      /credit note/,
    );
    expect(state.invoices[0]!.status).toBe(InvoiceStatus.SENT);
  });
});
