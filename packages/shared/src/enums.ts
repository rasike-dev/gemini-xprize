/** Domain enums shared across API, worker, and web. Keep in sync with Prisma schema. */

export const AgentType = {
  INQUIRY: 'INQUIRY',
  QUOTE: 'QUOTE',
  INVOICE: 'INVOICE',
  PAYMENT_FOLLOWUP: 'PAYMENT_FOLLOWUP',
  CASHFLOW: 'CASHFLOW',
  COMPLIANCE: 'COMPLIANCE',
  SUPPORT: 'SUPPORT',
} as const;
export type AgentType = (typeof AgentType)[keyof typeof AgentType];

export const AgentRunStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type AgentRunStatus = (typeof AgentRunStatus)[keyof typeof AgentRunStatus];

export const QuoteStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const UserRole = {
  OWNER: 'OWNER',
  STAFF: 'STAFF',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const PlanTier = {
  STARTER: 'STARTER',
  GROWTH: 'GROWTH',
} as const;
export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

export const SubscriptionStatus = {
  /** Free trial, gated by Subscription.trialEndsAt. */
  TRIALING: 'TRIALING',
  /** Paid and inside the paid period. */
  ACTIVE: 'ACTIVE',
  /** Period lapsed without renewal; read-only grace state. */
  PAST_DUE: 'PAST_DUE',
  /** Cancelled by the customer or by us. */
  CANCELED: 'CANCELED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const BillingProvider = {
  PAYHERE: 'PAYHERE',
  STRIPE: 'STRIPE',
} as const;
export type BillingProvider = (typeof BillingProvider)[keyof typeof BillingProvider];

export const IntakeChannel = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  WEB: 'WEB',
} as const;
export type IntakeChannel = (typeof IntakeChannel)[keyof typeof IntakeChannel];
