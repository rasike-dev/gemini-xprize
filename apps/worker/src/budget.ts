import { withTenant } from '@ledgerpilot/db';
import { PlanTier, isOverLimit, planFor } from '@ledgerpilot/shared';

export class BudgetExceededError extends Error {
  constructor(message = 'Tenant token budget exceeded for this period') {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/** One billing period. Matches the monthly plan allowance. */
const PERIOD_MS = 30 * 864e5;

/**
 * Rolls the tenant's usage period when it has expired, resetting counters and
 * re-applying the allowance from the current plan.
 *
 * Called on every budget check, not just from the scheduler. Without a lazy roll,
 * one missed scheduler run would leave a paying customer locked out of their own
 * AI features until someone noticed.
 */
export async function ensureCurrentPeriod(tenantId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { usagePeriodStart: true },
    });
    if (!tenant) return;

    const elapsed = Date.now() - tenant.usagePeriodStart.getTime();
    if (elapsed < PERIOD_MS) return;

    const subscription = await tx.subscription.findUnique({
      where: { tenantId },
      select: { plan: true },
    });
    const plan = planFor((subscription?.plan as PlanTier) ?? PlanTier.STARTER);

    // Advance by whole periods so a long gap does not hand out extra allowances.
    const periods = Math.floor(elapsed / PERIOD_MS);
    const periodStart = new Date(tenant.usagePeriodStart.getTime() + periods * PERIOD_MS);

    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        tokensUsed: BigInt(0),
        agentRunsUsed: 0,
        tokenBudget: BigInt(plan.monthlyTokenBudget),
        usagePeriodStart: periodStart,
      },
    });
  });
}

/** Throw if the tenant is over its token budget for the current period. */
export async function assertWithinBudget(tenantId: string): Promise<void> {
  await ensureCurrentPeriod(tenantId);

  await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { tokensUsed: true, tokenBudget: true },
    });
    if (tenant && tenant.tokensUsed >= tenant.tokenBudget) {
      throw new BudgetExceededError(
        'This period\u2019s AI allowance has been used up. It resets at the start of the next period, or upgrade for a larger allowance.',
      );
    }
  });
}

/**
 * Throw if the tenant has no agent runs left this period. The API checks this
 * too, but scheduled work (the overdue scan) never passes through the API.
 */
export async function assertWithinRunQuota(tenantId: string): Promise<void> {
  await ensureCurrentPeriod(tenantId);

  await withTenant(tenantId, async (tx) => {
    const [tenant, subscription] = await Promise.all([
      tx.tenant.findUnique({ where: { id: tenantId }, select: { agentRunsUsed: true } }),
      tx.subscription.findUnique({ where: { tenantId }, select: { plan: true } }),
    ]);
    if (!tenant) return;

    const plan = planFor((subscription?.plan as PlanTier) ?? PlanTier.STARTER);
    if (isOverLimit(tenant.agentRunsUsed, plan.monthlyAgentRuns)) {
      throw new BudgetExceededError(
        `All ${plan.monthlyAgentRuns} AI actions in the ${plan.name} plan have been used this period.`,
      );
    }
  });
}

/** Record token usage against the tenant's budget for this period. */
export async function recordTokenUsage(tenantId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  await withTenant(tenantId, (tx) =>
    tx.tenant.update({
      where: { id: tenantId },
      data: { tokensUsed: { increment: BigInt(tokens) } },
    }),
  );
}

/** Count one agent run against the period allowance. */
export async function recordAgentRun(tenantId: string): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx.tenant.update({
      where: { id: tenantId },
      data: { agentRunsUsed: { increment: 1 } },
    }),
  );
}
