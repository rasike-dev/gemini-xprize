import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { deriveIntakeSecret } from '../common/intake-secret.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { ClerkAdminService } from '../clerk/clerk-admin.service.js';

export interface TenantSettingsInput {
  name?: string;
  currency?: string;
  countryCode?: string;
  vatNumber?: string | null;
  autoSend?: boolean;
}

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly entitlements: EntitlementsService,
    private readonly clerk: ClerkAdminService,
  ) {}

  async get(tenantId: string) {
    const tenant = await this.prisma.forTenant(tenantId, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId } }),
    );
    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      id: tenant.id,
      name: tenant.name,
      currency: tenant.currency,
      countryCode: tenant.countryCode,
      vatNumber: tenant.vatNumber,
      autoSend: tenant.autoSend,
      createdAt: tenant.createdAt,
    };
  }

  async update(
    tenantId: string,
    input: TenantSettingsInput,
    actor: string,
    clerkOrgId?: string,
  ) {
    // Automatic sending lets the AI message customers unsupervised, so it is a
    // paid feature and must be checked before it can be switched on.
    if (input.autoSend === true) {
      await this.entitlements.assertFeature(tenantId, 'autoSend');
    }

    const updated = await this.prisma.forTenant(tenantId, (tx) =>
      tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
          ...(input.vatNumber !== undefined ? { vatNumber: input.vatNumber } : {}),
          ...(input.autoSend !== undefined ? { autoSend: input.autoSend } : {}),
        },
      }),
    );

    this.audit.log('tenant_settings_updated', {
      tenantId,
      actor,
      fields: Object.keys(input),
    });

    if (input.name !== undefined && clerkOrgId) {
      await this.clerk.syncOrganizationName(clerkOrgId, input.name);
    }

    return this.get(updated.id);
  }

  /**
   * The tenant's inbound webhook details, for connecting WhatsApp or email
   * forwarding. The secret is derived, not stored, so it can be shown on demand.
   */
  async integration(tenantId: string) {
    const tenant = await this.prisma.forTenant(tenantId, (tx) =>
      tx.tenant.findUnique({ where: { id: tenantId }, select: { clerkOrgId: true } }),
    );
    if (!tenant) throw new NotFoundException('Tenant not found');

    return {
      intakeUrl: `${process.env.PUBLIC_API_URL ?? ''}/api/intake`,
      orgHeader: tenant.clerkOrgId,
      signingSecret: deriveIntakeSecret(tenantId),
    };
  }

  async listUsers(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.user.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      }),
    );
  }
}
