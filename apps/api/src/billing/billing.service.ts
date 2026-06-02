import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { createHash } from 'node:crypto';
import { PlanTier } from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Billing across Stripe (cards/subscriptions) and PayHere (Sri Lanka LKR).
 * Subscription state is the source of truth for plan gating + revenue evidence.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe?: Stripe;

  constructor(private readonly prisma: PrismaService) {}

  private getStripe(): Stripe {
    if (!this.stripe) {
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder');
    }
    return this.stripe;
  }

  /** Create a Stripe Checkout session for a plan. */
  async createCheckout(tenantId: string, plan: PlanTier, successUrl: string, cancelUrl: string) {
    const price =
      plan === PlanTier.GROWTH ? process.env.STRIPE_PRICE_GROWTH : process.env.STRIPE_PRICE_STARTER;
    const session = await this.getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: tenantId,
      metadata: { tenantId, plan },
    });
    return { url: session.url };
  }

  /** Verify + handle a Stripe webhook. */
  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;
    if (secret) {
      event = this.getStripe().webhooks.constructEvent(rawBody, signature, secret);
    } else {
      event = JSON.parse(rawBody.toString()) as Stripe.Event;
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const tenantId = s.metadata?.tenantId ?? s.client_reference_id ?? undefined;
        const plan = (s.metadata?.plan as PlanTier) ?? PlanTier.STARTER;
        if (tenantId) {
          await this.upsertSubscription(tenantId, {
            plan,
            status: 'active',
            provider: 'stripe',
            externalCustomerId: String(s.customer ?? ''),
            externalSubId: String(s.subscription ?? ''),
          });
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = sub.metadata?.tenantId;
        if (tenantId) await this.upsertSubscription(tenantId, { status: 'canceled' });
        break;
      }
      default:
        this.logger.debug(`Unhandled Stripe event ${event.type}`);
    }
    return { received: true };
  }

  /** Verify a PayHere notify callback via md5 signature, then record payment. */
  async handlePayHereNotify(params: Record<string, string>) {
    const merchantId = process.env.PAYHERE_MERCHANT_ID ?? '';
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET ?? '';
    const { order_id, payhere_amount, payhere_currency, status_code, md5sig, custom_1: tenantId } =
      params;

    if (merchantSecret) {
      const hashedSecret = createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
      const local = createHash('md5')
        .update(merchantId + order_id + payhere_amount + payhere_currency + status_code + hashedSecret)
        .digest('hex')
        .toUpperCase();
      if (local !== md5sig) {
        this.logger.warn('PayHere signature mismatch');
        return { received: false };
      }
    }

    if (status_code === '2' && tenantId) {
      await this.upsertSubscription(tenantId, { status: 'active', provider: 'payhere' });
    }
    return { received: true };
  }

  private async upsertSubscription(
    tenantId: string,
    data: Partial<{
      plan: PlanTier;
      status: string;
      provider: string;
      externalCustomerId: string;
      externalSubId: string;
    }>,
  ) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.subscription.upsert({
        where: { tenantId },
        update: data,
        create: { tenantId, plan: data.plan ?? PlanTier.STARTER, ...data },
      }),
    );
  }
}
