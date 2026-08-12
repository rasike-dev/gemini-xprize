import { describe, expect, it } from 'vitest';
import { InvoiceStatus } from '@ledgerpilot/shared';
import { ReportsService } from '../src/reports/reports.service.js';
import {
  createFakePrisma,
  customerFixture,
  emptyState,
  tenantFixture,
  type FakeInvoice,
  type FakePayment,
  type FakeState,
} from './fake-prisma.js';

function invoice(overrides: Partial<FakeInvoice> = {}): FakeInvoice {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return {
    id: 'inv_1',
    tenantId: 'tenant_1',
    number: 'INV-1001',
    status: InvoiceStatus.SENT,
    currency: 'LKR',
    subtotalMinor: 100_000,
    taxMinor: 0,
    totalMinor: 100_000,
    paidMinor: 0,
    dueDate: new Date(),
    customerId: 'cust_1',
    createdAt: new Date(startOfMonth.getTime() + 86_400_000),
    ...overrides,
  };
}

function payment(overrides: Partial<FakePayment> = {}): FakePayment {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return {
    id: 'pmt_1',
    tenantId: 'tenant_1',
    invoiceId: 'inv_1',
    amountMinor: 50_000,
    method: 'cash',
    paidAt: new Date(startOfMonth.getTime() + 86_400_000),
    ...overrides,
  };
}

function build(state: Partial<FakeState> = {}) {
  const full = emptyState({ tenants: [tenantFixture()], ...state });
  const service = new ReportsService(createFakePrisma(full));
  return { service };
}

describe('ReportsService.monthlySummary', () => {
  it('returns zeros for an empty month', async () => {
    const { service } = build();

    const summary = await service.monthlySummary('tenant_1');

    expect(summary.salesMinor).toBe(0);
    expect(summary.collectedMinor).toBe(0);
    expect(summary.overdueMinor).toBe(0);
    expect(summary.invoiceCount).toBe(0);
    expect(summary.pendingInvoiceCount).toBe(0);
    expect(summary.bestCustomers).toEqual([]);
    expect(summary.monthLabel).toMatch(/\d{4}/);
  });

  it('computes sales, collected, overdue, and pending from invoice statuses', async () => {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const lastMonth = new Date(startOfMonth.getTime() - 86_400_000);

    const { service } = build({
      customers: [
        customerFixture(),
        customerFixture({ id: 'cust_2', name: 'Big Buyer Ltd' }),
      ],
      invoices: [
        invoice({ id: 'i1', customerId: 'cust_1', totalMinor: 200_000, status: InvoiceStatus.SENT }),
        invoice({
          id: 'i2',
          customerId: 'cust_2',
          totalMinor: 600_000,
          paidMinor: 100_000,
          status: InvoiceStatus.PARTIALLY_PAID,
        }),
        invoice({
          id: 'i3',
          customerId: 'cust_1',
          totalMinor: 300_000,
          paidMinor: 50_000,
          status: InvoiceStatus.OVERDUE,
        }),
        invoice({
          id: 'i_old',
          customerId: 'cust_1',
          totalMinor: 999_000,
          createdAt: lastMonth,
        }),
      ],
      payments: [payment({ amountMinor: 120_000 }), payment({ amountMinor: 80_000, id: 'pmt_2' })],
    });

    const summary = await service.monthlySummary('tenant_1');

    expect(summary.salesMinor).toBe(200_000 + 600_000 + 300_000);
    expect(summary.collectedMinor).toBe(200_000);
    expect(summary.overdueMinor).toBe(500_000 + 250_000);
    expect(summary.invoiceCount).toBe(3);
    expect(summary.pendingInvoiceCount).toBe(3);
    expect(summary.bestCustomers[0]).toMatchObject({ name: 'Big Buyer Ltd', totalMinor: 600_000 });
  });
});
