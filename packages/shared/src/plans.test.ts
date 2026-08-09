import { describe, expect, it } from 'vitest';
import { PlanTier } from './enums.js';
import {
  BillingInterval,
  PAYHERE_LITE_MAX_PAYMENT_MINOR,
  PLANS,
  PLAN_ORDER,
  PayHereMerchantPlan,
  UNLIMITED,
  formatLimit,
  formatPlanPrice,
  isOverLimit,
  isUnlimited,
  payHereMaxPaymentMinor,
  payHereRecurrence,
  periodMonthsFor,
  planFor,
  priceMinorFor,
} from './plans.js';

describe('plan catalogue', () => {
  it('covers every tier, so planFor can never fall back silently', () => {
    for (const tier of Object.values(PlanTier)) {
      expect(PLANS[tier]?.tier).toBe(tier);
    }
    expect(PLAN_ORDER).toHaveLength(Object.values(PlanTier).length);
  });

  it('prices annually at ten months, which is the two-months-free promise', () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.annualPriceMinor).toBe(plan.monthlyPriceMinor * 10);
    }
  });

  it('gives every higher tier at least as much of everything', () => {
    const starter = PLANS[PlanTier.STARTER];
    const growth = PLANS[PlanTier.GROWTH];

    expect(growth.monthlyPriceMinor).toBeGreaterThan(starter.monthlyPriceMinor);
    expect(growth.monthlyAgentRuns).toBeGreaterThan(starter.monthlyAgentRuns);
    expect(growth.monthlyTokenBudget).toBeGreaterThan(starter.monthlyTokenBudget);
    expect(growth.maxUsers).toBeGreaterThan(starter.maxUsers);

    // A feature available on a cheaper plan must not disappear on a dearer one.
    for (const [feature, enabled] of Object.entries(starter.features)) {
      if (enabled) {
        expect(growth.features[feature as keyof typeof growth.features]).toBe(true);
      }
    }
  });

  it('states prices in whole rupees, since the pricing page shows no decimals', () => {
    for (const plan of Object.values(PLANS)) {
      expect(plan.monthlyPriceMinor % 100).toBe(0);
      expect(plan.annualPriceMinor % 100).toBe(0);
    }
  });
});

describe('limit helpers', () => {
  it('never blocks an unlimited allowance', () => {
    expect(isUnlimited(UNLIMITED)).toBe(true);
    expect(isOverLimit(1_000_000, UNLIMITED)).toBe(false);
  });

  it('blocks at the limit, not one past it', () => {
    expect(isOverLimit(49, 50)).toBe(false);
    expect(isOverLimit(50, 50)).toBe(true);
    expect(isOverLimit(51, 50)).toBe(true);
  });

  it('renders the unlimited sentinel as a word rather than -1', () => {
    expect(formatLimit(UNLIMITED)).toBe('Unlimited');
    expect(formatLimit(1000)).toBe('1,000');
  });
});

describe('pricing helpers', () => {
  it('charges the monthly price for a monthly interval and the annual price for annual', () => {
    expect(priceMinorFor(PlanTier.STARTER, BillingInterval.MONTHLY)).toBe(250_000);
    expect(priceMinorFor(PlanTier.STARTER, BillingInterval.ANNUAL)).toBe(2_500_000);
  });

  it('grants one month or twelve, matching what was paid for', () => {
    expect(periodMonthsFor(BillingInterval.MONTHLY)).toBe(1);
    expect(periodMonthsFor(BillingInterval.ANNUAL)).toBe(12);
  });

  it('formats prices the way a Sri Lankan customer expects to read them', () => {
    expect(formatPlanPrice(250_000)).toBe('LKR 2,500');
    expect(formatPlanPrice(7_500_000)).toBe('LKR 75,000');
  });

  it('flags exactly which plan and interval exceed the PayHere LITE ceiling', () => {
    // Annual Growth is the one combination checkout has to refuse, and the
    // pricing page must not offer it as though it will work.
    const overCeiling = PLAN_ORDER.flatMap((tier) =>
      Object.values(BillingInterval).map((interval) => ({
        tier,
        interval,
        over: priceMinorFor(tier, interval) > PAYHERE_LITE_MAX_PAYMENT_MINOR,
      })),
    ).filter((combo) => combo.over);

    expect(overCeiling).toEqual([{ tier: PlanTier.GROWTH, interval: 'ANNUAL', over: true }]);
  });
});

describe('planFor', () => {
  it('falls back to Starter for an unknown tier from an old database row', () => {
    expect(planFor('LEGACY' as PlanTier).tier).toBe(PlanTier.STARTER);
  });
});

describe('PayHere merchant plans', () => {
  it('raises the per-payment ceiling on PLUS', () => {
    expect(payHereMaxPaymentMinor(PayHereMerchantPlan.LITE)).toBe(PAYHERE_LITE_MAX_PAYMENT_MINOR);
    expect(payHereMaxPaymentMinor(PayHereMerchantPlan.PLUS)).toBeGreaterThan(
      PAYHERE_LITE_MAX_PAYMENT_MINOR,
    );
  });

  it('lets every plan and interval be sold once we are on PLUS', () => {
    // The one combination LITE cannot take is annual Growth; upgrading is what
    // unblocks selling a year up front.
    const ceiling = payHereMaxPaymentMinor(PayHereMerchantPlan.PLUS);
    for (const tier of PLAN_ORDER) {
      for (const interval of Object.values(BillingInterval)) {
        expect(priceMinorFor(tier, interval)).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('names recurrences the way the Recurring API expects', () => {
    expect(payHereRecurrence(BillingInterval.MONTHLY)).toBe('1 Month');
    expect(payHereRecurrence(BillingInterval.ANNUAL)).toBe('1 Year');
  });
});
