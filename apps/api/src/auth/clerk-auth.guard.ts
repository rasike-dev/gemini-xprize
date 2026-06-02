import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken } from '@clerk/backend';
import type { Request } from 'express';
import { UserRole } from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from './decorators.js';

/**
 * Verifies the Clerk session JWT (stateless, via JWKS) and resolves the active
 * organization to our internal tenant id. Attaches an AuthContext to the request.
 *
 * Dev mode (DISABLE_AUTH=true): trusts `x-dev-org-id` / `x-dev-role` headers so
 * the stack runs without Clerk configured. Never enable in production.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();

    let clerkOrgId: string;
    let clerkUserId: string;
    let role: UserRole;

    if (process.env.DISABLE_AUTH === 'true') {
      clerkOrgId = (req.header('x-dev-org-id') ?? 'org_demo_printpro').trim();
      clerkUserId = (req.header('x-dev-user-id') ?? 'user_demo_owner').trim();
      role = (req.header('x-dev-role') as UserRole) ?? UserRole.OWNER;
    } else {
      const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) throw new UnauthorizedException('Missing bearer token');
      try {
        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
          authorizedParties: undefined,
        });
        clerkOrgId = String(payload.org_id ?? payload['orgId'] ?? '');
        clerkUserId = String(payload.sub ?? '');
        role =
          String(payload.org_role ?? '').includes('admin') || payload['role'] === 'OWNER'
            ? UserRole.OWNER
            : UserRole.STAFF;
      } catch (err) {
        this.logger.warn(`Token verification failed: ${(err as Error).message}`);
        throw new UnauthorizedException('Invalid token');
      }
      if (!clerkOrgId) throw new UnauthorizedException('No active organization');
    }

    const rows = await this.prisma.client.$queryRaw<{ resolve_tenant_id: string | null }[]>`
      SELECT resolve_tenant_id(${clerkOrgId}) AS resolve_tenant_id
    `;
    const tenantId = rows[0]?.resolve_tenant_id ?? null;
    if (!tenantId) throw new UnauthorizedException('Tenant not provisioned for organization');

    req.auth = { tenantId, clerkOrgId, clerkUserId, role };
    return true;
  }
}
