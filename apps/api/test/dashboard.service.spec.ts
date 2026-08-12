import { describe, expect, it } from 'vitest';
import { InvoiceStatus } from '@ledgerpilot/shared';
import { DashboardService } from '../src/dashboard/dashboard.service.js';
import {
  agentRunFixture,
  createFakePrisma,
  customerFixture,
  emptyState,
  tenantFixture,
  type FakeInvoice,
  type FakePayment,
  type FakeState,
} from './fake-prisma.js';

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

function payment(overrides: Partial<FakePayment> = {}): FakePayment {
  return {
    id: 'pmt_1',
    tenantId: 'tenant_1',
    invoiceId: 'inv_1',
    amountMinor: 500_000,
    method: 'cash',
    paidAt: new Date(),
    ...overrides,
  };
}

function build(state: Partial<FakeState> = {}) {
  const full = emptyState({ tenants: [tenantFixture()], ...state });
  const service = new DashboardService(createFakePrisma(full));
  return { service, state: full };
}

describe('DashboardService.summary', () => {
  it('returns zeros for an empty tenant', async () => {
    const { service } = build();

    const summary = await service.summary('tenant_1');

    expect(summary).toEqual({
      salesTodayMinor: 0,
      revenueThisMonthMinor: 0,
      overdueMinor: 0,
      pendingInvoices: 0,
      aiActionsThisMonth: 0,
      customerCount: 0,
    });
  });

  it('sums outstanding on overdue and partially paid invoices', async () => {
    const { service } = build({
      invoices: [
        invoice({ id: 'inv_overdue', status: InvoiceStatus.OVERDUE, totalMinor: 1_000_000, paidMinor: 200_000 }),
        invoice({ id: 'inv_partial', status: InvoiceStatus.PARTIALLY_PAID, totalMinor: 500_000, paidMinor: 100_000 }),
        invoice({ id: 'inv_paid', status: InvoiceStatus.PAID, totalMinor: 300_000, paidMinor: 300_000 }),
      ],
    });

    const summary = await service.summary('tenant_1');

    expect(summary.overdueMinor).toBe(800_000 + 400_000);
  });

  it('counts pending invoices in SENT, OVERDUE, and PARTIALLY_PAID', async () => {
    const { service } = build({
      invoices: [
        invoice({ id: 'i1', status: InvoiceStatus.SENT }),
        invoice({ id: 'i2', status: InvoiceStatus.OVERDUE }),
        invoice({ id: 'i3', status: InvoiceStatus.PARTIALLY_PAID }),
        invoice({ id: 'i4', status: InvoiceStatus.PAID }),
        invoice({ id: 'i5', status: InvoiceStatus.DRAFT }),
      ],
    });

    const summary = await service.summary('tenant_1');

    expect(summary.pendingInvoices).toBe(3);
  });

  it('aggregates payments this month and today', async () => {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const startOfDay = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const lastMonth = new Date(startOfMonth.getTime() - 86_400_000);

    const { service } = build({
      payments: [
        payment({ id: 'p1', amountMinor: 100_000, paidAt: startOfDay }),
        payment({ id: 'p2', amountMinor: 250_000, paidAt: new Date(startOfDay.getTime() + 3_600_000) }),
        payment({ id: 'p3', amountMinor: 999_000, paidAt: lastMonth }),
      ],
    });

    const summary = await service.summary('tenant_1');

    expect(summary.salesTodayMinor).toBe(350_000);
    expect(summary.revenueThisMonthMinor).toBe(350_000);
  });

  it('counts agent runs and customers for the month', async () => {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const { service } = build({
      customers: [customerFixture(), customerFixture({ id: 'cust_2', name: 'Other' })],
      agentRuns: [
        agentRunFixture({ id: 'run_1', createdAt: new Date(startOfMonth.getTime() + 1_000) }),
        agentRunFixture({ id: 'run_2', createdAt: new Date(startOfMonth.getTime() + 2_000) }),
        agentRunFixture({
          id: 'run_old',
          createdAt: new Date(startOfMonth.getTime() - 86_400_000),
        }),
      ],
    });

    const summary = await service.summary('tenant_1');

    expect(summary.aiActionsThisMonth).toBe(2);
    expect(summary.customerCount).toBe(2);
  });
});
