import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { BillingInterval, PlanTier, UserRole } from '@ledgerpilot/shared';
import { Auth, Public, Roles } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { BillingService } from './billing.service.js';
import { PayHereService } from './payhere.service.js';
import { AllowInactive } from './entitlements.decorators.js';
import { Throttle } from '@nestjs/throttler';

const payHereCheckoutSchema = z.object({
  plan: z.nativeEnum(PlanTier),
  interval: z.nativeEnum(BillingInterval).default(BillingInterval.MONTHLY),
  returnUrl: z.string().url(),
  cancelUrl: z.string().url(),
  customer: z.object({
    firstName: z.string().min(1).max(60),
    lastName: z.string().min(1).max(60),
    email: z.string().email(),
    phone: z.string().min(7).max(20),
  }),
});

const stripeCheckoutSchema = z.object({
  plan: z.nativeEnum(PlanTier),
  interval: z.nativeEnum(BillingInterval).default(BillingInterval.MONTHLY),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

/**
 * Every route here is @AllowInactive: a customer whose trial or paid period has
 * lapsed is exactly the customer who needs to reach these endpoints.
 */
@Controller('billing')
@AllowInactive()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly payhere: PayHereService,
  ) {}

  @Get('subscription')
  subscription(@Auth() auth: AuthContext) {
    return this.billing.getSubscriptionSummary(auth.tenantId);
  }

  @Roles(UserRole.OWNER)
  @Post('payhere/checkout')
  payHereCheckout(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(payHereCheckoutSchema)) body: z.infer<typeof payHereCheckoutSchema>,
  ) {
    return this.payhere.createCheckout({ tenantId: auth.tenantId, ...body });
  }

  @Roles(UserRole.OWNER)
  @Post('stripe/checkout')
  stripeCheckout(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(stripeCheckoutSchema)) body: z.infer<typeof stripeCheckoutSchema>,
  ) {
    return this.billing.createStripeCheckout(
      auth.tenantId,
      body.plan,
      body.successUrl,
      body.cancelUrl,
      body.interval,
    );
  }

  @Roles(UserRole.OWNER)
  @Post('cancel')
  cancel(@Auth() auth: AuthContext) {
    return this.billing.cancel(auth.tenantId, auth.clerkUserId);
  }

  /** Undoes a cancellation while the paid period is still running. */
  @Roles(UserRole.OWNER)
  @Post('resume')
  resume(@Auth() auth: AuthContext) {
    return this.billing.resume(auth.tenantId, auth.clerkUserId);
  }

  /**
   * Asks the gateway to try a failed recurring charge again. Rate-limited
   * because each attempt costs the customer a gateway retry.
   */
  @Roles(UserRole.OWNER)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @Post('retry-payment')
  async retryPayment(@Auth() auth: AuthContext) {
    const accepted = await this.payhere.retryRecurring(auth.tenantId);
    return {
      ok: accepted,
      message: accepted
        ? 'We have asked your bank to try the payment again. This usually takes a few minutes.'
        : 'We could not reach the payment provider. Please try paying again instead.',
    };
  }
}

@Controller('webhooks')
@AllowInactive()
export class BillingWebhookController {
  constructor(
    private readonly billing: BillingService,
    private readonly payhere: PayHereService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('stripe')
  stripe(@Req() req: Request) {
    const signature = req.header('stripe-signature') ?? '';
    return this.billing.handleStripeWebhook(req.rawBody ?? Buffer.from(''), signature);
  }

  /** PayHere posts application/x-www-form-urlencoded, not JSON. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('payhere')
  payHereNotify(@Body() body: Record<string, string>) {
    return this.payhere.handleNotify(body);
  }
}
