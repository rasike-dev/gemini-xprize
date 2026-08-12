import { randomUUID } from 'node:crypto';
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
  currency?: string;
  vatNumber?: string | null;
  clerkOrgId?: string;
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

export interface FakeCustomer {
  id: string;
  tenantId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  createdAt: Date;
}

export interface FakeQuoteLine {
  id: string;
  tenantId: string;
  quoteId: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRatePct: number;
  totalMinor: number;
}

export interface FakeQuote {
  id: string;
  tenantId: string;
  customerId: string;
  number: string;
  status: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  notes?: string | null;
  validUntil?: Date | null;
  createdAt: Date;
  lines?: FakeQuoteLine[];
}

export interface FakeInvoiceLine {
  id: string;
  tenantId: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxRatePct: number;
  totalMinor: number;
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
  quoteId?: string | null;
  createdAt?: Date;
  lines?: FakeInvoiceLine[];
}

export interface FakePayment {
  id: string;
  tenantId: string;
  invoiceId: string;
  amountMinor: number;
  method: string;
  reference?: string;
  paidAt?: Date;
}

export interface FakeReminder {
  id: string;
  tenantId: string;
  invoiceId: string;
  message: string;
  subject?: string | null;
  channel?: string;
  approved?: boolean;
  sentAt?: Date | null;
  createdAt: Date;
}

export interface FakeAgentRun {
  id: string;
  tenantId: string;
  agentType: string;
  status: string;
  inquiryId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  inputJson?: object;
  outputJson?: object | null;
  idempotencyKey: string;
  humanApproved?: boolean;
  approvedBy?: string | null;
  error?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
}

export interface FakeUser {
  id: string;
  tenantId: string;
  email: string;
  name?: string | null;
  role: string;
  createdAt: Date;
}

export interface FakeState {
  tenants: FakeTenant[];
  subscriptions: FakeSubscription[];
  billingPayments: FakeBillingPayment[];
  customers: FakeCustomer[];
  quotes: FakeQuote[];
  quoteLines: FakeQuoteLine[];
  invoices: FakeInvoice[];
  invoiceLines: FakeInvoiceLine[];
  payments: FakePayment[];
  reminders: FakeReminder[];
  agentRuns: FakeAgentRun[];
  users: FakeUser[];
  /** Legacy counter used when no customer rows are seeded. */
  customerCount: number;
  userCount: number;
}

export function emptyState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    tenants: [],
    subscriptions: [],
    billingPayments: [],
    customers: [],
    quotes: [],
    quoteLines: [],
    invoices: [],
    invoiceLines: [],
    payments: [],
    reminders: [],
    agentRuns: [],
    users: [],
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

type Where = Record<string, unknown>;

function matchesField(row: Record<string, unknown>, key: string, value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const filter = value as Where;
    if ('gte' in filter) {
      const rowVal = row[key];
      if (rowVal instanceof Date) return rowVal >= (filter.gte as Date);
      if (typeof rowVal === 'number') return rowVal >= (filter.gte as number);
      return false;
    }
    if ('in' in filter) return (filter.in as unknown[]).includes(row[key]);
  }
  return row[key] === value;
}

function matches(row: Record<string, unknown>, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') {
      return (value as Where[]).every((clause) => matches(row, clause));
    }
    return matchesField(row, key, value);
  });
}

function pickFields<T extends Record<string, unknown>>(row: T, select: Where): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key as keyof T] = row[key as keyof T];
  }
  return out;
}

function customerCount(state: FakeState): number {
  return state.customers.length > 0 ? state.customers.length : state.customerCount;
}

function userCount(state: FakeState): number {
  return state.users.length > 0 ? state.users.length : state.userCount;
}

function quoteLinesFor(state: FakeState, quoteId: string): FakeQuoteLine[] {
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (quote?.lines) return quote.lines;
  return state.quoteLines.filter((l) => l.quoteId === quoteId);
}

function invoiceLinesFor(state: FakeState, invoiceId: string): FakeInvoiceLine[] {
  const invoice = state.invoices.find((i) => i.id === invoiceId);
  if (invoice?.lines) return invoice.lines;
  return state.invoiceLines.filter((l) => l.invoiceId === invoiceId);
}

function hydrateCustomer(state: FakeState, customerId: string) {
  return state.customers.find((c) => c.id === customerId) ?? null;
}

function hydrateQuote(state: FakeState, quote: FakeQuote, include?: Where) {
  const resolved = resolveInclude(include);
  const base: Record<string, unknown> = { ...quote, lines: quoteLinesFor(state, quote.id) };
  if (resolved?.customer) base.customer = hydrateCustomer(state, quote.customerId);
  if (resolved?.lines) base.lines = quoteLinesFor(state, quote.id);
  return base;
}

function resolveInclude(include?: Where): Where | undefined {
  if (include && typeof include === 'object' && 'include' in include) {
    return include.include as Where;
  }
  return include;
}

function hydrateInvoice(state: FakeState, invoice: FakeInvoice, include?: Where) {
  const resolved = resolveInclude(include);
  const base: Record<string, unknown> = { ...invoice, lines: invoiceLinesFor(state, invoice.id) };
  if (resolved?.customer) base.customer = hydrateCustomer(state, invoice.customerId);
  if (resolved?.lines) base.lines = invoiceLinesFor(state, invoice.id);
  if (resolved?.payments) {
    base.payments = state.payments.filter((p) => p.invoiceId === invoice.id);
  }
  if (resolved?.reminders) {
    base.reminders = state.reminders.filter((r) => r.invoiceId === invoice.id);
  }
  return base;
}

function hydrateReminder(state: FakeState, reminder: FakeReminder, include?: Where) {
  const base: Record<string, unknown> = { ...reminder };
  if (include?.invoice) {
    const invoice = state.invoices.find((i) => i.id === reminder.invoiceId);
    if (invoice) {
      base.invoice = hydrateInvoice(state, invoice, include.invoice as Where);
    }
  }
  return base;
}

/**
 * Builds an object that satisfies the parts of PrismaService the billing code
 * touches. Anything unimplemented throws, so a test never silently passes because
 * a query quietly returned undefined.
 */
export function createFakePrisma(state: FakeState) {
  const tx = {
    tenant: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: Where;
      }) => {
        const tenant = state.tenants.find((t) => t.id === where.id) ?? null;
        if (!tenant) return null;
        if (select) return pickFields(tenant as unknown as Record<string, unknown>, select);
        return tenant;
      },
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

    customer: {
      findMany: async ({
        where,
        orderBy,
        select,
      }: {
        where?: Where;
        orderBy?: { createdAt?: 'asc' | 'desc' };
        select?: Where;
      } = {}) => {
        let rows = state.customers.filter((c) =>
          matches(c as unknown as Record<string, unknown>, where),
        );
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else if (orderBy?.createdAt === 'asc') {
          rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (select) {
          return rows.map((r) => pickFields(r as unknown as Record<string, unknown>, select));
        }
        return rows;
      },
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: Where;
      }) => {
        const customer = state.customers.find((c) => c.id === where.id) ?? null;
        if (!customer) return null;
        const base: Record<string, unknown> = { ...customer };
        if (include?.invoices) {
          base.invoices = state.invoices.filter((i) => i.customerId === customer.id);
        }
        if (include?.quotes) {
          base.quotes = state.quotes.filter((q) => q.customerId === customer.id);
        }
        return base;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId('cust'),
          createdAt: new Date(),
          ...data,
        } as FakeCustomer;
        state.customers.push(row);
        state.customerCount = customerCount(state);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const customer = state.customers.find((c) => c.id === where.id);
        if (!customer) throw new Error(`fake prisma: no customer ${where.id}`);
        Object.assign(customer, data);
        return customer;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = state.customers.findIndex((c) => c.id === where.id);
        if (idx === -1) throw new Error(`fake prisma: no customer ${where.id}`);
        state.customers.splice(idx, 1);
        state.customerCount = customerCount(state);
        return state.customers[idx] ?? { id: where.id };
      },
      count: async ({ where }: { where?: Where } = {}) => {
        if (!where || Object.keys(where).length === 0) return customerCount(state);
        return state.customers.filter((c) =>
          matches(c as unknown as Record<string, unknown>, where),
        ).length;
      },
    },

    quote: {
      findMany: async ({
        orderBy,
        include,
      }: {
        orderBy?: { createdAt?: 'asc' | 'desc' };
        include?: Where;
      } = {}) => {
        let rows = [...state.quotes];
        if (orderBy?.createdAt === 'desc') {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        return rows.map((q) => hydrateQuote(state, q, include));
      },
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: Where;
      }) => {
        const quote = state.quotes.find((q) => q.id === where.id) ?? null;
        if (!quote) return null;
        return hydrateQuote(state, quote, include);
      },
      create: async ({
        data,
        include,
      }: {
        data: Record<string, unknown> & { lines?: { create: Record<string, unknown>[] } };
        include?: Where;
      }) => {
        const id = nextId('quote');
        const lineCreates = data.lines?.create ?? [];
        const lines = lineCreates.map((line) => {
          const row = {
            id: nextId('ql'),
            quoteId: id,
            ...line,
          } as FakeQuoteLine;
          state.quoteLines.push(row);
          return row;
        });
        const quote = {
          id,
          status: 'DRAFT',
          createdAt: new Date(),
          ...data,
          lines,
        } as FakeQuote;
        delete (quote as Record<string, unknown>).lines;
        quote.lines = lines;
        state.quotes.push(quote);
        return hydrateQuote(state, quote, include);
      },
      update: async ({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: Record<string, unknown> & { lines?: { create: Record<string, unknown>[] } };
        include?: Where;
      }) => {
        const quote = state.quotes.find((q) => q.id === where.id);
        if (!quote) throw new Error(`fake prisma: no quote ${where.id}`);
        const lineCreates = data.lines?.create;
        if (lineCreates) {
          const lines = lineCreates.map((line) => {
            const row = {
              id: nextId('ql'),
              quoteId: quote.id,
              ...line,
            } as FakeQuoteLine;
            state.quoteLines.push(row);
            return row;
          });
          quote.lines = lines;
        }
        const { lines: _lines, ...rest } = data;
        Object.assign(quote, rest);
        return hydrateQuote(state, quote, include);
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = state.quotes.findIndex((q) => q.id === where.id);
        if (idx === -1) throw new Error(`fake prisma: no quote ${where.id}`);
        state.quotes.splice(idx, 1);
        state.quoteLines = state.quoteLines.filter((l) => l.quoteId !== where.id);
        return { id: where.id };
      },
      count: async ({ where }: { where?: Where } = {}) => {
        if (!where) return state.quotes.length;
        return state.quotes.filter((q) =>
          matches(q as unknown as Record<string, unknown>, where),
        ).length;
      },
    },

    quoteLine: {
      deleteMany: async ({ where }: { where: { quoteId: string } }) => {
        const before = state.quoteLines.length;
        state.quoteLines = state.quoteLines.filter((l) => l.quoteId !== where.quoteId);
        state.quotes.forEach((q) => {
          if (q.id === where.quoteId) q.lines = [];
        });
        return { count: before - state.quoteLines.length };
      },
    },

    invoice: {
      findMany: async ({
        where,
        select,
        orderBy,
        include,
      }: {
        where?: Where;
        select?: Where;
        orderBy?: { createdAt?: 'asc' | 'desc' };
        include?: Where;
      } = {}) => {
        let rows = state.invoices.filter((i) =>
          matches(i as unknown as Record<string, unknown>, where),
        );
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort(
            (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
          );
        }
        if (select) {
          return rows.map((r) => pickFields(r as unknown as Record<string, unknown>, select));
        }
        if (include) {
          return rows.map((r) => hydrateInvoice(state, r, include));
        }
        return rows;
      },
      findUnique: async ({
        where,
        include,
      }: {
        where: { id?: string; quoteId?: string; shareToken?: string };
        include?: Where;
      }) => {
        let invoice: FakeInvoice | undefined;
        if (where.id) invoice = state.invoices.find((i) => i.id === where.id);
        else if (where.quoteId) invoice = state.invoices.find((i) => i.quoteId === where.quoteId);
        else if (where.shareToken)
          invoice = state.invoices.find((i) => i.shareToken === where.shareToken);
        if (!invoice) return null;
        return include ? hydrateInvoice(state, invoice, include) : invoice;
      },
      create: async ({
        data,
        include,
      }: {
        data: Record<string, unknown> & { lines?: { create: Record<string, unknown>[] } };
        include?: Where;
      }) => {
        const id = nextId('inv');
        const lineCreates = data.lines?.create ?? [];
        const lines = lineCreates.map((line) => {
          const row = {
            id: nextId('il'),
            invoiceId: id,
            ...line,
          } as FakeInvoiceLine;
          state.invoiceLines.push(row);
          return row;
        });
        const invoice = {
          id,
          paidMinor: 0,
          shareToken: randomUUID(),
          createdAt: new Date(),
          ...data,
          lines,
        } as FakeInvoice;
        delete (invoice as Record<string, unknown>).lines;
        invoice.lines = lines;
        state.invoices.push(invoice);
        return include ? hydrateInvoice(state, invoice, include) : invoice;
      },
      update: async ({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
        include?: Where;
      }) => {
        const invoice = state.invoices.find((i) => i.id === where.id);
        if (!invoice) throw new Error(`fake prisma: no invoice ${where.id}`);
        Object.assign(invoice, data);
        return include ? hydrateInvoice(state, invoice, include) : invoice;
      },
      count: async ({ where }: { where?: Where } = {}) => {
        if (!where) return state.invoices.length;
        return state.invoices.filter((i) =>
          matches(i as unknown as Record<string, unknown>, where),
        ).length;
      },
      groupBy: async ({
        by,
        where,
        _sum,
        orderBy,
        take,
      }: {
        by: ['customerId'];
        where?: Where;
        _sum?: { totalMinor?: boolean };
        orderBy?: { _sum?: { totalMinor?: 'asc' | 'desc' } };
        take?: number;
      }) => {
        const rows = state.invoices.filter((i) =>
          matches(i as unknown as Record<string, unknown>, where),
        );
        const grouped = new Map<string, number>();
        for (const inv of rows) {
          grouped.set(inv.customerId, (grouped.get(inv.customerId) ?? 0) + inv.totalMinor);
        }
        let result = [...grouped.entries()].map(([customerId, totalMinor]) => ({
          customerId,
          _sum: { totalMinor: _sum?.totalMinor ? totalMinor : undefined },
        }));
        if (orderBy?._sum?.totalMinor === 'desc') {
          result.sort((a, b) => (b._sum.totalMinor ?? 0) - (a._sum.totalMinor ?? 0));
        }
        if (take) result = result.slice(0, take);
        return result;
      },
    },

    payment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId('pmt'),
          paidAt: new Date(),
          ...data,
        } as FakePayment;
        state.payments.push(row);
        return row;
      },
      aggregate: async ({
        _sum,
        where,
      }: {
        _sum?: { amountMinor?: boolean };
        where?: Where;
      }) => {
        const rows = state.payments.filter((p) =>
          matches(p as unknown as Record<string, unknown>, where),
        );
        const sum = rows.reduce((acc, p) => acc + p.amountMinor, 0);
        return { _sum: { amountMinor: _sum?.amountMinor ? sum : undefined } };
      },
    },

    reminder: {
      findMany: async ({
        orderBy,
        take,
        include,
      }: {
        orderBy?: Array<
          { sentAt?: { sort: 'asc' | 'desc'; nulls: 'first' | 'last' } } | { createdAt?: 'asc' | 'desc' }
        >;
        take?: number;
        include?: Where;
      } = {}) => {
        let rows = [...state.reminders];
        rows.sort((a, b) => {
          if (a.sentAt === null || a.sentAt === undefined) {
            if (b.sentAt !== null && b.sentAt !== undefined) return -1;
          } else if (b.sentAt === null || b.sentAt === undefined) {
            return 1;
          } else if (a.sentAt && b.sentAt) {
            const cmp = a.sentAt.getTime() - b.sentAt.getTime();
            if (cmp !== 0) return cmp;
          }
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
        if (take) rows = rows.slice(0, take);
        return rows.map((r) => hydrateReminder(state, r, include));
      },
      findUnique: async ({
        where,
        include,
      }: {
        where: { id: string };
        include?: Where;
      }) => {
        const reminder = state.reminders.find((r) => r.id === where.id) ?? null;
        if (!reminder) return null;
        return hydrateReminder(state, reminder, include);
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const reminder = state.reminders.find((r) => r.id === where.id);
        if (!reminder) throw new Error(`fake prisma: no reminder ${where.id}`);
        Object.assign(reminder, data);
        return reminder;
      },
    },

    agentRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: nextId('run'),
          createdAt: new Date(),
          ...data,
        } as FakeAgentRun;
        state.agentRuns.push(row);
        return row;
      },
      findUnique: async ({
        where,
      }: {
        where: { id?: string; tenantId_idempotencyKey?: { tenantId: string; idempotencyKey: string } };
      }) => {
        if (where.id) return state.agentRuns.find((r) => r.id === where.id) ?? null;
        if (where.tenantId_idempotencyKey) {
          const { tenantId, idempotencyKey } = where.tenantId_idempotencyKey;
          return (
            state.agentRuns.find(
              (r) => r.tenantId === tenantId && r.idempotencyKey === idempotencyKey,
            ) ?? null
          );
        }
        return null;
      },
      findFirst: async ({ where }: { where?: Where } = {}) =>
        state.agentRuns.find((r) => matches(r as unknown as Record<string, unknown>, where)) ??
        null,
      findMany: async ({
        orderBy,
        take,
      }: {
        orderBy?: { createdAt?: 'asc' | 'desc' };
        take?: number;
      } = {}) => {
        let rows = [...state.agentRuns];
        if (orderBy?.createdAt === 'desc') {
          rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (take) rows = rows.slice(0, take);
        return rows;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const run = state.agentRuns.find((r) => r.id === where.id);
        if (!run) throw new Error(`fake prisma: no agent run ${where.id}`);
        Object.assign(run, data);
        return run;
      },
      count: async ({ where }: { where?: Where } = {}) =>
        state.agentRuns.filter((r) => matches(r as unknown as Record<string, unknown>, where))
          .length,
    },

    user: {
      findMany: async ({
        orderBy,
        select,
      }: {
        orderBy?: { createdAt?: 'asc' | 'desc' };
        select?: Where;
      } = {}) => {
        let rows = [...state.users];
        if (orderBy?.createdAt === 'asc') {
          rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (select) {
          return rows.map((r) => pickFields(r as unknown as Record<string, unknown>, select));
        }
        return rows;
      },
      count: async () => userCount(state),
    },
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
      invoice: {
        findUnique: async ({
          where,
          include,
        }: {
          where: { shareToken: string };
          include?: Where;
        }) => {
          const invoice = state.invoices.find((i) => i.shareToken === where.shareToken) ?? null;
          if (!invoice) return null;
          return include ? hydrateInvoice(state, invoice, include) : invoice;
        },
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
    currency: 'LKR',
    autoSend: false,
    clerkOrgId: 'org_demo_printpro',
    ...overrides,
  };
}

export function customerFixture(overrides: Partial<FakeCustomer> = {}): FakeCustomer {
  return {
    id: 'cust_1',
    tenantId: 'tenant_1',
    name: 'Nimal Perera',
    email: 'nimal@example.com',
    phone: '+94771234567',
    createdAt: new Date(),
    ...overrides,
  };
}

export function quoteFixture(overrides: Partial<FakeQuote> = {}): FakeQuote {
  return {
    id: 'quote_1',
    tenantId: 'tenant_1',
    customerId: 'cust_1',
    number: 'Q-1001',
    status: 'DRAFT',
    currency: 'LKR',
    subtotalMinor: 1_000_000,
    taxMinor: 180_000,
    totalMinor: 1_180_000,
    createdAt: new Date(),
    ...overrides,
  };
}

export function reminderFixture(overrides: Partial<FakeReminder> = {}): FakeReminder {
  return {
    id: 'rem_1',
    tenantId: 'tenant_1',
    invoiceId: 'inv_1',
    message: 'Please pay your invoice.',
    createdAt: new Date(),
    ...overrides,
  };
}

export function agentRunFixture(overrides: Partial<FakeAgentRun> = {}): FakeAgentRun {
  return {
    id: 'run_1',
    tenantId: 'tenant_1',
    agentType: 'PAYMENT_FOLLOWUP',
    status: 'PENDING',
    idempotencyKey: 'key_1',
    createdAt: new Date(),
    ...overrides,
  };
}
