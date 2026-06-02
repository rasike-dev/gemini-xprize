import { withTenant } from '@ledgerpilot/db';

export class BudgetExceededError extends Error {
  constructor() {
    super('Tenant monthly token budget exceeded');
    this.name = 'BudgetExceededError';
  }
}

/** Throw if the tenant is over its token budget; otherwise allow the run. */
export async function assertWithinBudget(tenantId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { tokensUsed: true, tokenBudget: true },
    });
    if (tenant && tenant.tokensUsed >= tenant.tokenBudget) {
      throw new BudgetExceededError();
    }
  });
}

/** Record token usage against the tenant's monthly budget. */
export async function recordTokenUsage(tenantId: string, tokens: number): Promise<void> {
  if (tokens <= 0) return;
  await withTenant(tenantId, (tx) =>
    tx.tenant.update({
      where: { id: tenantId },
      data: { tokensUsed: { increment: BigInt(tokens) } },
    }),
  );
}
