/**
 * Plan catalogue: the single source of truth for pricing, limits, and features.
 *
 * The pricing page renders from this, and the API enforces from this, so
 * advertised limits can never drift from enforced ones.
 *
 * All money is in minor units (LKR cents) to match the rest of the domain.
 */

import { PlanTier } from './enums.js';

export const PLAN_CURRENCY = 'LKR';

/** Sentinel for "no limit". Compare with `isUnlimited`, never with `> 0`. */
export const UNLIMITED = -1;

/** Free trial length, applied at tenant creation. */
export const TRIAL_DAYS = 14;

/** Billing intervals we sell. PayHere LITE bills these as one-time payments. */
export const BillingInterval = {
  MONTHLY: 'MONTHLY',
  ANNUAL: 'ANNUAL',
} as const;
export type BillingInterval = (typeof BillingInterval)[keyof typeof BillingInterval];

export interface PlanFeatures {
  /** One-click wa.me deep links for AI-drafted messages. */
  whatsappLinks: boolean;
  /** VAT / e-invoice readiness agent. */
  complianceAgent: boolean;
  /** Customer support answering agent. */
  supportAgent: boolean;
  /** CSV / PDF report exports. */
  reportExports: boolean;
  /** Allow agents to send without human approval. */
  autoSend: boolean;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  blurb: string;
  /** Monthly price in LKR minor units. */
  monthlyPriceMinor: number;
  /** Annual price in LKR minor units (two months free). */
  annualPriceMinor: number;
  maxUsers: number;
  maxCustomers: number;
  /** Agent runs allowed per billing period. */
  monthlyAgentRuns: number;
  /** Gemini token allowance per billing period. */
  monthlyTokenBudget: number;
  features: PlanFeatures;
  /** Marketing bullets for the pricing page. */
  highlights: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  [PlanTier.STARTER]: {
    tier: PlanTier.STARTER,
    name: 'Starter',
    blurb: 'For solo owners who want quotes and invoices to stop eating their evenings.',
    monthlyPriceMinor: 250_000, // LKR 2,500
    annualPriceMinor: 2_500_000, // LKR 25,000 (2 months free)
    maxUsers: 1,
    maxCustomers: 50,
    monthlyAgentRuns: 30,
    monthlyTokenBudget: 500_000,
    features: {
      whatsappLinks: false,
      complianceAgent: false,
      supportAgent: false,
      reportExports: false,
      autoSend: false,
    },
    highlights: [
      '1 user',
      'Up to 50 customers',
      '30 AI agent actions per month',
      'Inquiry, quote and invoice agents',
      'Email reminders',
      'Full AI decision audit log',
    ],
  },
  [PlanTier.GROWTH]: {
    tier: PlanTier.GROWTH,
    name: 'Growth',
    blurb: 'For growing shops with a team, chasing payments across WhatsApp and email.',
    monthlyPriceMinor: 750_000, // LKR 7,500
    annualPriceMinor: 7_500_000, // LKR 75,000 (2 months free)
    maxUsers: 5,
    maxCustomers: UNLIMITED,
    monthlyAgentRuns: 300,
    monthlyTokenBudget: 5_000_000,
    features: {
      whatsappLinks: true,
      complianceAgent: true,
      supportAgent: true,
      reportExports: true,
      autoSend: true,
    },
    highlights: [
      'Up to 5 users',
      'Unlimited customers',
      '300 AI agent actions per month',
      'One-click WhatsApp follow-ups',
      'Cash-flow, compliance and support agents',
      'CSV and PDF exports',
      'Automatic sending (optional)',
    ],
  },
};

/** Plans in display order, cheapest first. */
export const PLAN_ORDER: PlanTier[] = [PlanTier.STARTER, PlanTier.GROWTH];

export function planFor(tier: PlanTier): PlanDefinition {
  return PLANS[tier] ?? PLANS[PlanTier.STARTER];
}

export function isUnlimited(limit: number): boolean {
  return limit === UNLIMITED;
}

/** True when `used` has reached a limit. Unlimited never blocks. */
export function isOverLimit(used: number, limit: number): boolean {
  return !isUnlimited(limit) && used >= limit;
}

export function priceMinorFor(tier: PlanTier, interval: BillingInterval): number {
  const plan = planFor(tier);
  return interval === BillingInterval.ANNUAL ? plan.annualPriceMinor : plan.monthlyPriceMinor;
}

/** Months of access granted by one payment of the given interval. */
export function periodMonthsFor(interval: BillingInterval): number {
  return interval === BillingInterval.ANNUAL ? 12 : 1;
}

/**
 * PayHere LITE (our launch tier) caps a single payment at LKR 50,000. Annual
 * Growth exceeds it, so checkout must reject that combination with a clear
 * message rather than failing on PayHere's payment page.
 */
export const PAYHERE_LITE_MAX_PAYMENT_MINOR = 5_000_000;

/** PayHere PLUS raises the per-payment ceiling to LKR 250,000. */
export const PAYHERE_PLUS_MAX_PAYMENT_MINOR = 25_000_000;

/**
 * Which PayHere merchant plan we are on. LITE is free but one-time payments
 * only; PLUS costs LKR 3,990/month and unlocks the Recurring API. Set by
 * `PAYHERE_MERCHANT_PLAN` so the switch is a config change, not a deploy of
 * different code.
 */
export const PayHereMerchantPlan = {
  LITE: 'LITE',
  PLUS: 'PLUS',
} as const;
export type PayHereMerchantPlan =
  (typeof PayHereMerchantPlan)[keyof typeof PayHereMerchantPlan];

export function payHereMaxPaymentMinor(merchantPlan: PayHereMerchantPlan): number {
  return merchantPlan === PayHereMerchantPlan.PLUS
    ? PAYHERE_PLUS_MAX_PAYMENT_MINOR
    : PAYHERE_LITE_MAX_PAYMENT_MINOR;
}

/** The `recurrence` value PayHere's Recurring API expects for an interval. */
export function payHereRecurrence(interval: BillingInterval): string {
  return interval === BillingInterval.ANNUAL ? '1 Year' : '1 Month';
}

/** Plan prices are always whole rupees, so render them without decimals. */
export function formatPlanPrice(minor: number, currency = PLAN_CURRENCY): string {
  return `${currency} ${Math.round(minor / 100).toLocaleString('en-US')}`;
}

/** Renders a limit for display, turning the unlimited sentinel into a word. */
export function formatLimit(limit: number): string {
  return isUnlimited(limit) ? 'Unlimited' : limit.toLocaleString('en-US');
}
