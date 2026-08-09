/** Response shapes from the LedgerPilot API, as consumed by the dashboard. */

import type { PlanDefinition, PlanFeatures, PlanTier, SubscriptionStatus } from '@ledgerpilot/shared';

export interface UsageSnapshot {
  agentRuns: number;
  agentRunsLimit: number;
  customers: number;
  customersLimit: number;
  users: number;
  usersLimit: number;
  tokensUsed: number;
  tokenBudget: number;
  periodStart: string;
}

export interface BillingPaymentSummary {
  id: string;
  orderId: string;
  plan: PlanTier;
  interval: 'MONTHLY' | 'ANNUAL';
  amountMinor: number;
  currency: string;
  paidAt: string;
  periodEnd: string | null;
}

export interface SubscriptionSummary {
  plan: {
    tier: PlanTier;
    name: string;
    monthlyPriceMinor: number;
    annualPriceMinor: number;
    features: PlanFeatures;
  };
  status: SubscriptionStatus;
  active: boolean;
  reason: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  currentPeriodEnd: string | null;
  /** Cancelled, but still inside the period they paid for. */
  cancelAtPeriodEnd: boolean;
  nextBillingAt: string | null;
  /** True when the gateway renews on its own, so no reminder to pay is needed. */
  autoRenews: boolean;
  currency: string;
  usage: UsageSnapshot;
  availablePlans: PlanDefinition[];
  payments: BillingPaymentSummary[];
}

export interface TenantProfile {
  id: string;
  name: string;
  currency: string;
  countryCode: string;
  vatNumber: string | null;
  autoSend: boolean;
  createdAt: string;
}

export interface TenantIntegration {
  intakeUrl: string;
  orgHeader: string;
  signingSecret: string;
}

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes?: string | null;
  lastContact: string | null;
}

export interface QuoteRow {
  id: string;
  number: string;
  status: string;
  currency: string;
  totalMinor: number;
  customer: { id: string; name: string };
  createdAt: string;
}

export interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  currency: string;
  totalMinor: number;
  paidMinor: number;
  dueDate: string | null;
  pdfUrl: string | null;
  shareToken: string;
  customer: { id: string; name: string };
}

export interface ReminderRow {
  id: string;
  channel: string;
  subject: string | null;
  message: string;
  tone: string;
  sentAt: string | null;
  approved: boolean;
  createdAt: string;
  invoice: {
    id: string;
    number: string;
    currency: string;
    totalMinor: number;
    paidMinor: number;
    dueDate: string | null;
    customer: { id: string; name: string; phone: string | null; email: string | null };
  };
}

export interface AgentRunRow {
  id: string;
  agentType: string;
  status: string;
  decision: string | null;
  confidence: number | null;
  geminiModel: string | null;
  tokensUsed: number | null;
  error: string | null;
  humanApproved: boolean;
  subjectId: string | null;
  outputJson: unknown;
  createdAt: string;
}
