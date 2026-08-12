import { Body, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { UserRole } from '@ledgerpilot/shared';
import { Auth, Roles } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AllowInactive } from '../billing/entitlements.decorators.js';
import { TenantService } from './tenant.service.js';

const updateTenantSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    currency: z.string().length(3).optional(),
    countryCode: z.string().length(2).optional(),
    vatNumber: z.string().max(40).nullable().optional(),
    autoSend: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update' });

@Controller('tenant')
export class TenantController {
  constructor(private readonly tenant: TenantService) {}

  @Get()
  get(@Auth() auth: AuthContext) {
    return this.tenant.get(auth.tenantId);
  }

  /**
   * Also the last step of onboarding, which runs during the trial. Left open to
   * inactive subscriptions so a lapsed customer can still correct their details.
   */
  @AllowInactive()
  @Roles(UserRole.OWNER)
  @Patch()
  update(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(updateTenantSchema)) body: z.infer<typeof updateTenantSchema>,
  ) {
    return this.tenant.update(auth.tenantId, body, auth.clerkUserId, auth.clerkOrgId);
  }

  @Get('integration')
  integration(@Auth() auth: AuthContext) {
    return this.tenant.integration(auth.tenantId);
  }

  @Get('users')
  users(@Auth() auth: AuthContext) {
    return this.tenant.listUsers(auth.tenantId);
  }
}
