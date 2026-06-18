import { BadRequestException, Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { Webhook } from 'svix';
import { UserRole } from '@ledgerpilot/shared';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Throttle } from '@nestjs/throttler';

/**
 * Provisions our own Tenant/User rows from Clerk events so all FKs are ours.
 * organization.created -> Tenant; organizationMembership.created -> User.
 * Verified with the Clerk (svix) signing secret.
 */
@Controller('webhooks')
export class ClerkWebhookController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('clerk')
  async handle(
    @Req() req: Request,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTs: string,
    @Headers('svix-signature') svixSig: string,
  ) {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    const raw = req.rawBody?.toString() ?? '';

    let evt: { type: string; data: Record<string, unknown> };
    if (secret) {
      const wh = new Webhook(secret);
      evt = wh.verify(raw, {
        'svix-id': svixId,
        'svix-timestamp': svixTs,
        'svix-signature': svixSig,
      }) as typeof evt;
    } else {
      evt = JSON.parse(raw);
    }

    switch (evt.type) {
      case 'organization.created':
        await this.createTenant(evt.data);
        break;
      case 'organizationMembership.created':
        await this.createUser(evt.data);
        break;
      default:
        break;
    }
    return { received: true };
  }

  private async createTenant(data: Record<string, unknown>) {
    const clerkOrgId = String(data.id ?? '');
    const name = String(data.name ?? 'New Business');
    if (!clerkOrgId) throw new BadRequestException('Missing org id');
    const tenantId = randomUUID();
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.tenant.upsert({
        where: { clerkOrgId },
        update: { name },
        create: { id: tenantId, clerkOrgId, name },
      });
    });
  }

  private async createUser(data: Record<string, unknown>) {
    const org = (data.organization ?? {}) as Record<string, unknown>;
    const pub = (data.public_user_data ?? {}) as Record<string, unknown>;
    const clerkOrgId = String(org.id ?? '');
    const clerkUserId = String(pub.user_id ?? '');
    const role = String(data.role ?? '').includes('admin') ? UserRole.OWNER : UserRole.STAFF;
    if (!clerkOrgId || !clerkUserId) return;

    const rows = await this.prisma.client.$queryRaw<{ resolve_tenant_id: string | null }[]>`
      SELECT resolve_tenant_id(${clerkOrgId}) AS resolve_tenant_id
    `;
    const tenantId = rows[0]?.resolve_tenant_id;
    if (!tenantId) return;

    await this.prisma.forTenant(tenantId, (tx) =>
      tx.user.upsert({
        where: { clerkUserId },
        update: { role },
        create: {
          tenantId,
          clerkUserId,
          email: String(pub.identifier ?? `${clerkUserId}@unknown`),
          name: [pub.first_name, pub.last_name].filter(Boolean).join(' ') || null,
          role,
        },
      }),
    );
  }
}
