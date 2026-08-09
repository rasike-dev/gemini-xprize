import { BadRequestException, Controller, Headers, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Webhook } from 'svix';
import { UserRole } from '@ledgerpilot/shared';
import { Public } from '../auth/decorators.js';
import { AllowInactive } from '../billing/entitlements.decorators.js';
import { TenantProvisioningService } from '../tenant/tenant-provisioning.service.js';
import { Throttle } from '@nestjs/throttler';

/**
 * Keeps our Tenant/User rows in step with Clerk organizations and memberships.
 *
 * Tenants are also provisioned just-in-time by the auth guard, so this webhook is
 * a synchroniser rather than the only way in: it handles renames, role changes,
 * and removals that would otherwise never reach us.
 */
@Controller('webhooks')
@AllowInactive()
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(private readonly provisioning: TenantProvisioningService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('clerk')
  async handle(
    @Req() req: Request,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTs: string,
    @Headers('svix-signature') svixSig: string,
  ) {
    const evt = this.verify(req, svixId, svixTs, svixSig);

    switch (evt.type) {
      case 'organization.created':
        await this.provisioning.createTenant(
          String(evt.data.id ?? ''),
          String(evt.data.name ?? 'New Business'),
        );
        break;

      case 'organization.updated':
        await this.provisioning.renameTenant(
          String(evt.data.id ?? ''),
          String(evt.data.name ?? 'New Business'),
        );
        break;

      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        await this.upsertMembership(evt.data);
        break;

      case 'organizationMembership.deleted':
        await this.removeMembership(evt.data);
        break;

      default:
        this.logger.debug(`Unhandled Clerk event ${evt.type}`);
    }
    return { received: true };
  }

  private verify(
    req: Request,
    svixId: string,
    svixTs: string,
    svixSig: string,
  ): { type: string; data: Record<string, unknown> } {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    const raw = req.rawBody?.toString() ?? '';

    // Fail closed: an unverified payload can create tenants and grant roles.
    if (!secret) {
      this.logger.error('CLERK_WEBHOOK_SECRET is not set; refusing to process webhook.');
      throw new BadRequestException('Webhook verification is not configured.');
    }

    return new Webhook(secret).verify(raw, {
      'svix-id': svixId,
      'svix-timestamp': svixTs,
      'svix-signature': svixSig,
    }) as { type: string; data: Record<string, unknown> };
  }

  private async upsertMembership(data: Record<string, unknown>) {
    const org = (data.organization ?? {}) as Record<string, unknown>;
    const pub = (data.public_user_data ?? {}) as Record<string, unknown>;
    const clerkOrgId = String(org.id ?? '');
    const clerkUserId = String(pub.user_id ?? '');
    if (!clerkOrgId || !clerkUserId) return;

    const tenantId = await this.provisioning.resolveTenantId(clerkOrgId);
    if (!tenantId) return;

    await this.provisioning.ensureUser(tenantId, {
      clerkUserId,
      email: String(pub.identifier ?? `${clerkUserId}@unknown`),
      name: [pub.first_name, pub.last_name].filter(Boolean).join(' ') || undefined,
      role: String(data.role ?? '').includes('admin') ? UserRole.OWNER : UserRole.STAFF,
    });
  }

  private async removeMembership(data: Record<string, unknown>) {
    const org = (data.organization ?? {}) as Record<string, unknown>;
    const pub = (data.public_user_data ?? {}) as Record<string, unknown>;
    const clerkOrgId = String(org.id ?? '');
    const clerkUserId = String(pub.user_id ?? '');
    if (!clerkOrgId || !clerkUserId) return;

    await this.provisioning.removeUser(clerkOrgId, clerkUserId);
  }
}
