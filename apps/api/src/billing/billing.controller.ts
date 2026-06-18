import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { PlanTier } from '@ledgerpilot/shared';
import { Auth, Public, Roles } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { UserRole } from '@ledgerpilot/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { BillingService } from './billing.service.js';
import { Throttle } from '@nestjs/throttler';

const checkoutSchema = z.object({
  plan: z.nativeEnum(PlanTier),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Roles(UserRole.OWNER)
  @Post('checkout')
  checkout(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(checkoutSchema)) body: z.infer<typeof checkoutSchema>,
  ) {
    return this.billing.createCheckout(auth.tenantId, body.plan, body.successUrl, body.cancelUrl);
  }
}

@Controller('webhooks')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('stripe')
  stripe(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    return this.billing.handleStripeWebhook(req.rawBody ?? Buffer.from(''), signature ?? '');
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('payhere')
  payhere(@Body() body: Record<string, string>) {
    return this.billing.handlePayHereNotify(body);
  }
}
