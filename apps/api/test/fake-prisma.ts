import type { Prisma } from '@ledgerpilot/db';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * A hand-written stand-in for PrismaService.
 *
 * Billing logic is decision-making rather than querying, so testing it against a
 * real Postgres would mostly test Postgres. This keeps the billing tests fast and
 * runnable without a database, which matters because they are the tests most
 * likely to be run in a hurry before a release.
 *
 * Tenant isolation itself is not tested here — that lives in the database and is
 * checked by the RLS verification in infra/scripts/cloudsql-migrate-seed.sh.
 */

export interface FakeTenant {
  id: string;
  createdAt: Date;
  tokenBudget: bigint;
  tokensUsed: bigint;
  agentRunsUsed: number;
  usagePeriodStart: Date;
  name?: string;
  countryCode?: string;
  autoSend?: boolean;
}

export interface FakeSubscription {
  id: string;
  tenantId: string;
  plan: string;
  status: string;
  provider: string;
  interval?: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  nextBillingAt?: Date | null;
  cancelAtPeriodEnd?: boolean;
  externalSubId?: string | null;
  externalCustomerId?: string | null;
}

export interface FakeBillingPayment {
  id: string;
  tenantId: string;
  subscriptionId: string;
  provider: string;
  orderId: string;
  plan: string;
  interval: string;
  amountMinor: number;
  currency: string;
  statusCode: string;
  succeeded: boolean;
  installment?: number;
  externalRef?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  createdAt: Date;
}

export interface FakeInvoice {
  id: string;
  tenantId: string;
  number: string;
  status: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueDate: Date | null;
  notes?: string | null;
  shareToken?: string | null;
  pdfUrl?: string | null;
  customerId: string;
}

export interface FakePayment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amountMinor: number;
  method: string;
  reference?: string;
}

export interface FakeState {
  tenants: FakeTenant[];
  subscriptions: FakeSubscription[];
  billingPayments: FakeBillingPayment[];
  invoices: FakeInvoice[];
  payments: FakePayment[];
  customerCount: number;
  userCount: number;
}

export function emptyState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    tenants: [],
    subscriptions: [],
    billingPayments: [],
    invoices: [],
    payments: [],
    customerCount: 0,
    userCount: 1,
    ...overrides,
  };
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

function matches(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

/**
 * Builds an object that satisfies the parts of PrismaService the billing code
 * touches. Anything unimplemented throws, so a test never silently passes because
 * a query quietly returned undefined.
 */
export function createFakePrisma(state: FakeState) {
  const tx = {
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.tenants.find((t) => t.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const tenant = state.tenants.find((t) => t.id === where.id);
        if (!tenant) throw new Error(`fake prisma: no tenant ${where.id}`);
        Object.assign(tenant, data);
        return tenant;
      },
    },

    subscription: {
      findUnique: async ({ where }: { where: { tenantId: string } }) =>
        state.subscriptions.find((s) => s.tenantId === where.tenantId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId('sub'),
          trialEndsAt: null,
          currentPeriodEnd: null,
          ...data,
        } as FakeSubscription;
        state.subscriptions.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { tenantId: string };
        data: Record<string, unknown>;
      }) => {
        const row = state.subscriptions.find((s) => s.tenantId === where.tenantId);
        if (!row) throw new Error(`fake prisma: no subscription for ${where.tenantId}`);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = state.subscriptions.filter((s) =>
          matches(s as unknown as Record<string, unknown>, where),
        );
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },

    billingPayment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: nextId('pay'), createdAt: new Date(), ...data } as FakeBillingPayment;
        state.billingPayments.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.billingPayments.find((p) =>
          matches(p as unknown as Record<string, unknown>, where),
        ) ?? null,
      findMany: async () => [...state.billingPayments],
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { tenantId_orderId: { tenantId: string; orderId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const { tenantId, orderId } = where.tenantId_orderId;
        const existing = state.billingPayments.find(
          (p) => p.tenantId === tenantId && p.orderId === orderId,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: nextId('pay'), createdAt: new Date(), ...create } as FakeBillingPayment;
        state.billingPayments.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.billingPayments.find((p) => p.id === where.id);
        if (!row) throw new Error(`fake prisma: no payment ${where.id}`);
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = state.billingPayments.filter((p) =>
          matches(p as unknown as Record<string, unknown>, where),
        );
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },

    invoice: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.invoices.find((i) => i.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const invoice = state.invoices.find((i) => i.id === where.id);
        if (!invoice) throw new Error(`fake prisma: no invoice ${where.id}`);
        Object.assign(invoice, data);
        return invoice;
      },
      count: async () => state.invoices.length,
    },

    payment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: nextId('pmt'), ...data } as FakePayment;
        state.payments.push(row);
        return row;
      },
    },

    customer: { count: async () => state.customerCount },
    user: { count: async () => state.userCount },
  };

  const service = {
    client: {
      // Stands in for the SECURITY DEFINER lookup functions the webhook handlers
      // use to find a tenant without a tenant context.
      $queryRaw: async (strings: readonly string[], value: string) => {
        const sql = strings.join('');

        if (sql.includes('resolve_subscription_tenant')) {
          const subscription = state.subscriptions.find((s) => s.externalSubId === value);
          return [{ resolve_subscription_tenant: subscription?.tenantId ?? null }];
        }

        const payment = state.billingPayments.find((p) => p.orderId === value);
        return [{ resolve_billing_order_tenant: payment?.tenantId ?? null }];
      },
    },
    forTenant: async <T>(_tenantId: string, fn: (t: Prisma.TransactionClient) => Promise<T>) =>
      fn(tx as unknown as Prisma.TransactionClient),
  };

  return service as unknown as PrismaService;
}

/** A no-op audit logger that records what it was asked to log. */
export function createFakeAudit() {
  const entries: { event: string; payload: Record<string, unknown> }[] = [];
  return {
    entries,
    service: {
      log: (event: string, payload: Record<string, unknown>) => entries.push({ event, payload }),
      list: async () => [],
    },
  };
}

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

export function tenantFixture(overrides: Partial<FakeTenant> = {}): FakeTenant {
  return {
    id: 'tenant_1',
    createdAt: new Date(),
    tokenBudget: 500_000n,
    tokensUsed: 0n,
    agentRunsUsed: 0,
    usagePeriodStart: new Date(),
    name: 'PrintPro Lanka',
    countryCode: 'LK',
    autoSend: false,
    ...overrides,
  };
}
