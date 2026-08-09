import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PlanFeatures } from '@ledgerpilot/shared';
import { IS_PUBLIC_KEY } from '../auth/decorators.js';
import { ALLOW_INACTIVE_KEY, REQUIRES_FEATURE_KEY } from './entitlements.decorators.js';
import { EntitlementsService } from './entitlements.service.js';

/** Methods that change tenant data, and therefore require a live subscription. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Global subscription gate. This is the difference between a demo and a business.
 *
 * Policy:
 *  - Reads stay open even when a subscription has lapsed, so a former customer
 *    can always get their own data out.
 *  - Writes require a live trial or a paid period.
 *  - `@RequiresFeature(...)` additionally checks the plan includes a feature,
 *    which is how we gate reads such as report exports.
 *  - `@AllowInactive()` exempts a route entirely.
 *
 * Runs after ClerkAuthGuard, so `req.auth` is already populated.
 */
@Injectable()
export class EntitlementsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const tenantId = req.auth?.tenantId;
    if (!tenantId) return true; // Unauthenticated routes are handled by the auth guard.

    const feature = this.reflector.getAllAndOverride<keyof PlanFeatures | undefined>(
      REQUIRES_FEATURE_KEY,
      targets,
    );

    if (feature) {
      await this.entitlements.assertFeature(tenantId, feature);
      return true;
    }

    if (MUTATING_METHODS.has(req.method.toUpperCase())) {
      await this.entitlements.assertActive(tenantId);
    }
    return true;
  }
}
