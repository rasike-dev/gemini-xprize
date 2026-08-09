import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  PLANS,
  PlanTier,
  SubscriptionStatus,
  TRIAL_DAYS,
  isOverLimit,
  isUnlimited,
  planFor,
  type PlanDefinition,
  type PlanFeatures,
} from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/** 402: the request is well-formed but the tenant's plan does not allow it. */
export class UpgradeRequiredException extends HttpException {
  constructor(message: string) {
    super({ statusCode: HttpStatus.PAYMENT_REQUIRED, message, error: 'Upgrade Required' }, HttpStatus.PAYMENT_REQUIRED);
  }
}

export interface UsageSnapshot {
  agentRuns: number;
  agentRunsLimit: number;
  customers: number;
  customersLimit: number;
  users: number;
  usersLimit: number;
  tokensUsed: number;
  tokenBudget: number;
  periodStart: Date;
}

export interface EntitlementState {
  plan: PlanDefinition;
  status: SubscriptionStatus;
  /** True when paid features may be used. Computed, never trusted from a column. */
  active: boolean;
  /** Why access is denied, when it is. Safe to show the customer. */
  reason: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  trialDaysRemaining: number | null;
  /** True when the customer has cancelled but the paid period is still running. */
  cancelAtPeriodEnd: boolean;
  /** When the gateway will charge again. Null unless on automatic renewal. */
  nextBillingAt: Date | null;
  /** True when money will be taken again without the customer doing anything. */
  autoRenews: boolean;
  usage: UsageSnapshot;
}

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

/**
 * Decides what a tenant is allowed to do, based on its subscription and usage.
 *
 * Two rules matter most:
 *  - Access is derived from dates at read time, so a lapsed subscription loses
 *    access without needing a cron job to notice.
 *  - Limits come from the shared plan catalogue, so the pricing page and this
 *    file can never disagree.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(tenantId: string): Promise<EntitlementState> {
    const { tenant, subscription, customers, users } = await this.prisma.forTenant(
      tenantId,
      async (tx) => ({
        tenant: await tx.tenant.findUnique({ where: { id: tenantId } }),
        subscription: await tx.subscription.findUnique({ where: { tenantId } }),
        customers: await tx.customer.count(),
        users: await tx.user.count(),
      }),
    );

    if (!tenant) throw new UpgradeRequiredException('Tenant not found.');

    // A tenant with no subscription row is mid-provisioning: treat it as a trial
    // measured from when it was created, rather than locking it out.
    const plan = planFor((subscription?.plan as PlanTier) ?? PlanTier.STARTER);
    const status = (subscription?.status as SubscriptionStatus) ?? SubscriptionStatus.TRIALING;
    const trialEndsAt =
      subscription?.trialEndsAt ??
      new Date(tenant.createdAt.getTime() + TRIAL_DAYS * 86_400_000);
    const currentPeriodEnd = subscription?.currentPeriodEnd ?? null;

    const { active, reason } = this.evaluate(status, trialEndsAt, currentPeriodEnd);

    return {
      plan,
      status,
      active,
      reason,
      trialEndsAt,
      currentPeriodEnd,
      trialDaysRemaining:
        status === SubscriptionStatus.TRIALING && trialEndsAt ? daysUntil(trialEndsAt) : null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      nextBillingAt: subscription?.nextBillingAt ?? null,
      autoRenews: !!subscription?.nextBillingAt && !subscription.cancelAtPeriodEnd,
      usage: {
        agentRuns: tenant.agentRunsUsed,
        agentRunsLimit: plan.monthlyAgentRuns,
        customers,
        customersLimit: plan.maxCustomers,
        users,
        usersLimit: plan.maxUsers,
        tokensUsed: Number(tenant.tokensUsed),
        tokenBudget: Number(tenant.tokenBudget),
        periodStart: tenant.usagePeriodStart,
      },
    };
  }

  private evaluate(
    status: SubscriptionStatus,
    trialEndsAt: Date | null,
    currentPeriodEnd: Date | null,
  ): { active: boolean; reason: string | null } {
    const now = Date.now();

    switch (status) {
      case SubscriptionStatus.TRIALING:
        if (trialEndsAt && trialEndsAt.getTime() > now) return { active: true, reason: null };
        return {
          active: false,
          reason: 'Your free trial has ended. Choose a plan to carry on.',
        };

      case SubscriptionStatus.ACTIVE:
        // No end date means we never recorded a payment period; fail closed.
        if (!currentPeriodEnd) {
          return { active: false, reason: 'We could not confirm your current billing period.' };
        }
        if (currentPeriodEnd.getTime() > now) return { active: true, reason: null };
        return {
          active: false,
          reason: 'Your subscription period has ended. Renew to carry on.',
        };

      case SubscriptionStatus.PAST_DUE:
        return { active: false, reason: 'Your last payment did not go through. Please renew.' };

      case SubscriptionStatus.CANCELED:
      default:
        return { active: false, reason: 'Your subscription is cancelled. Choose a plan to restart.' };
    }
  }

  /** Gate for any change to tenant data. Reads stay available so data can be exported. */
  async assertActive(tenantId: string): Promise<EntitlementState> {
    const state = await this.getState(tenantId);
    if (!state.active) throw new UpgradeRequiredException(state.reason ?? 'Subscription inactive.');
    return state;
  }

  async assertFeature(tenantId: string, feature: keyof PlanFeatures): Promise<EntitlementState> {
    const state = await this.assertActive(tenantId);
    if (!state.plan.features[feature]) {
      throw new UpgradeRequiredException(
        `${FEATURE_LABELS[feature]} is not part of the ${state.plan.name} plan.`,
      );
    }
    return state;
  }

  /**
   * Gate before queueing AI work. Checks the plan is live and the tenant has
   * agent runs left this period, so the customer gets an immediate, explanatory
   * 402 rather than a job that silently fails later.
   *
   * The counter itself is incremented by the worker, which is the single place
   * where a run actually consumes anything.
   */
  async assertCanRunAgent(tenantId: string): Promise<void> {
    const state = await this.assertActive(tenantId);
    const { agentRuns, agentRunsLimit } = state.usage;

    if (isOverLimit(agentRuns, agentRunsLimit)) {
      throw new UpgradeRequiredException(
        `You have used all ${agentRunsLimit} AI actions in your plan this period. Upgrade for more, or wait for the period to reset.`,
      );
    }
  }

  async assertCanAddCustomer(tenantId: string): Promise<void> {
    const state = await this.assertActive(tenantId);
    const { customers, customersLimit } = state.usage;

    if (isOverLimit(customers, customersLimit)) {
      throw new UpgradeRequiredException(
        `The ${state.plan.name} plan covers ${customersLimit} customers. Upgrade to add more.`,
      );
    }
  }

  async assertCanAddUser(tenantId: string): Promise<void> {
    const state = await this.assertActive(tenantId);
    const { users, usersLimit } = state.usage;

    if (isOverLimit(users, usersLimit)) {
      throw new UpgradeRequiredException(
        `The ${state.plan.name} plan covers ${isUnlimited(usersLimit) ? 'unlimited' : usersLimit} team members. Upgrade to invite more.`,
      );
    }
  }

  /** Plans offered for upgrade, cheapest first. Used by the billing page. */
  availablePlans(): PlanDefinition[] {
    return Object.values(PLANS);
  }
}

const FEATURE_LABELS: Record<keyof PlanFeatures, string> = {
  whatsappLinks: 'WhatsApp follow-ups',
  complianceAgent: 'The compliance agent',
  supportAgent: 'The support agent',
  reportExports: 'Report exports',
  autoSend: 'Automatic sending',
};
