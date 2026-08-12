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
import { TenantProvisioningService } from '../tenant/tenant-provisioning.service.js';
import { IS_PUBLIC_KEY } from './decorators.js';
import { clerkOrgIdFromToken, clerkRoleHintFromToken } from './clerk-claims.js';

/** True only when dev-header auth is both requested and permitted. */
export function devAuthEnabled(): boolean {
  return process.env.DISABLE_AUTH === 'true' && process.env.NODE_ENV !== 'production';
}

/**
 * Verifies the Clerk session JWT (stateless, via JWKS) and resolves the active
 * organization to our internal tenant id. Attaches an AuthContext to the request.
 *
 * Dev mode (DISABLE_AUTH=true) trusts `x-dev-org-id` / `x-dev-role` headers so the
 * stack runs without Clerk configured. It is refused outright when NODE_ENV is
 * production — see assertAuthConfigIsSafe, which stops the process at boot rather
 * than letting a misconfigured deploy serve unauthenticated traffic.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly logger = new Logger(ClerkAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly provisioning: TenantProvisioningService,
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
    let roleHint: UserRole;
    let email: string | undefined;
    let name: string | undefined;

    if (devAuthEnabled()) {
      clerkOrgId = (req.header('x-dev-org-id') ?? 'org_demo_printpro').trim();
      clerkUserId = (req.header('x-dev-user-id') ?? 'user_demo_owner').trim();
      roleHint = (req.header('x-dev-role') as UserRole) ?? UserRole.OWNER;
    } else {
      const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) throw new UnauthorizedException('Missing bearer token');
      try {
        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
          authorizedParties: undefined,
        });
        clerkOrgId = clerkOrgIdFromToken(payload as Record<string, unknown>);
        clerkUserId = String(payload.sub ?? '');
        roleHint = clerkRoleHintFromToken(payload as Record<string, unknown>);
        email = payload['email'] ? String(payload['email']) : undefined;
        name = payload['name'] ? String(payload['name']) : undefined;
      } catch (err) {
        this.logger.warn(`Token verification failed: ${(err as Error).message}`);
        throw new UnauthorizedException('Invalid token');
      }
      if (!clerkOrgId) throw new UnauthorizedException('No active organization');
      if (!clerkUserId) throw new UnauthorizedException('Token has no subject');
    }

    // Provisions on first sight, so a customer who has just finished sign-up is
    // never told their organization does not exist while the webhook catches up.
    const { tenantId, role } = await this.provisioning.authorize({
      clerkOrgId,
      clerkUserId,
      roleHint,
      email,
      name,
    });

    req.auth = { tenantId, clerkOrgId, clerkUserId, role };
    return true;
  }
}

/**
 * Boot-time configuration check. Called before the server starts listening so a
 * dangerous combination fails visibly at deploy rather than silently in traffic.
 */
export function assertAuthConfigIsSafe(): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (process.env.DISABLE_AUTH === 'true') {
    throw new Error(
      'DISABLE_AUTH=true is not permitted when NODE_ENV=production. It would accept ' +
        'any caller-supplied organization header as authentication. Unset it and redeploy.',
    );
  }
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error('CLERK_SECRET_KEY is required in production; tokens cannot be verified.');
  }
  if (!process.env.INTAKE_HMAC_SECRET) {
    throw new Error('INTAKE_HMAC_SECRET is required in production to sign intake webhooks.');
  }
}
