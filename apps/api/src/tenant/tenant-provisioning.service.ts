import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BillingProvider,
  PLANS,
  PlanTier,
  SubscriptionStatus,
  TRIAL_DAYS,
  UserRole,
} from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Creates the Tenant, its trial subscription, and the signed-in user.
 *
 * Provisioning happens just-in-time on the first authenticated request rather
 * than only via the Clerk webhook. The webhook is asynchronous, so a customer who
 * finished sign-up could otherwise reach the app before their tenant existed and
 * be told their organization was not provisioned. The webhook still runs and
 * keeps names and roles in step; both paths are idempotent.
 */
@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantId(clerkOrgId: string): Promise<string | null> {
    const rows = await this.prisma.client.$queryRaw<{ resolve_tenant_id: string | null }[]>`
      SELECT resolve_tenant_id(${clerkOrgId}) AS resolve_tenant_id
    `;
    return rows[0]?.resolve_tenant_id ?? null;
  }

  /**
   * Per-request resolution used by the auth guard.
   *
   * In the steady state this is two reads. It only writes on a tenant's or a
   * user's very first request. The returned role comes from our own `users` table
   * rather than from the JWT, so revoking someone's access in the database takes
   * effect immediately instead of waiting for their token to expire.
   */
  async authorize(input: {
    clerkOrgId: string;
    clerkUserId: string;
    roleHint: UserRole;
    email?: string;
    name?: string;
  }): Promise<{ tenantId: string; role: UserRole }> {
    let tenantId = await this.resolveTenantId(input.clerkOrgId);
    if (!tenantId) {
      tenantId = await this.createTenant(input.clerkOrgId);
    }

    const user = await this.prisma.forTenant(tenantId, (tx) =>
      tx.user.findUnique({
        where: { clerkUserId: input.clerkUserId },
        select: { role: true, tenantId: true },
      }),
    );

    if (!user) {
      await this.ensureUser(tenantId, { ...input, role: input.roleHint });
      return { tenantId, role: input.roleHint };
    }

    return { tenantId, role: user.role as UserRole };
  }

  /** Returns the tenant id for a Clerk org, creating it on first sight. */
  async resolveOrProvision(input: {
    clerkOrgId: string;
    clerkUserId?: string;
    email?: string;
    name?: string;
    role?: UserRole;
  }): Promise<string> {
    const existing = await this.resolveTenantId(input.clerkOrgId);
    if (existing) {
      if (input.clerkUserId) await this.ensureUser(existing, input);
      return existing;
    }

    const tenantId = await this.createTenant(input.clerkOrgId, input.name);
    if (input.clerkUserId) {
      // The first person into a new workspace owns it.
      await this.ensureUser(tenantId, { ...input, role: input.role ?? UserRole.OWNER });
    }
    this.logger.log(`Provisioned tenant ${tenantId} for org ${input.clerkOrgId}`);
    return tenantId;
  }

  /**
   * Creates a tenant plus its trial subscription in one transaction, so a tenant
   * can never exist without an entitlement record.
   */
  async createTenant(clerkOrgId: string, name?: string): Promise<string> {
    const tenantId = randomUUID();
    const starter = PLANS[PlanTier.STARTER];
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

      const tenant = await tx.tenant.upsert({
        where: { clerkOrgId },
        update: name ? { name } : {},
        create: {
          id: tenantId,
          clerkOrgId,
          name: name?.trim() || 'New Business',
          tokenBudget: BigInt(starter.monthlyTokenBudget),
          usagePeriodStart: new Date(),
        },
      });

      await tx.subscription.upsert({
        where: { tenantId: tenant.id },
        update: {},
        create: {
          tenantId: tenant.id,
          plan: PlanTier.STARTER,
          status: SubscriptionStatus.TRIALING,
          provider: BillingProvider.PAYHERE,
          trialEndsAt,
        },
      });

      return tenant;
    });

    // An upsert on an existing org keeps its original id, so read it back.
    return (await this.resolveTenantId(clerkOrgId)) ?? tenantId;
  }

  /** Keeps the tenant name in step with the Clerk organization. */
  async renameTenant(clerkOrgId: string, name: string): Promise<void> {
    const tenantId = await this.resolveTenantId(clerkOrgId);
    if (!tenantId) return;
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { name } }),
    );
  }

  async ensureUser(
    tenantId: string,
    input: { clerkUserId?: string; email?: string; name?: string; role?: UserRole },
  ): Promise<void> {
    if (!input.clerkUserId) return;

    await this.prisma.forTenant(tenantId, (tx) =>
      tx.user.upsert({
        where: { clerkUserId: input.clerkUserId! },
        update: input.role ? { role: input.role } : {},
        create: {
          tenantId,
          clerkUserId: input.clerkUserId!,
          email: input.email ?? `${input.clerkUserId}@unknown`,
          name: input.name ?? null,
          role: input.role ?? UserRole.STAFF,
        },
      }),
    );
  }

  async removeUser(clerkOrgId: string, clerkUserId: string): Promise<void> {
    const tenantId = await this.resolveTenantId(clerkOrgId);
    if (!tenantId) return;
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.user.deleteMany({ where: { tenantId, clerkUserId } }),
    );
  }
}
