import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  UserRole,
  createInvoiceSchema,
  recordPaymentSchema,
  type CreateInvoice,
  type RecordPayment,
} from '@ledgerpilot/shared';
import { Auth, Public, Roles, TenantId } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AllowInactive } from '../billing/entitlements.decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { InvoicesService } from './invoices.service.js';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.service.list(tenantId);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  create(@Auth() auth: AuthContext, @Body(new ZodPipe(createInvoiceSchema)) body: CreateInvoice) {
    return this.service.create(auth.tenantId, body, auth.clerkUserId);
  }

  /** Recording money received affects the books, so owner-only. */
  @Roles(UserRole.OWNER)
  @Post(':id/payments')
  pay(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodPipe(recordPaymentSchema)) body: RecordPayment,
  ) {
    return this.service.recordPayment(
      auth.tenantId,
      id,
      body.amountMinor,
      body.method,
      auth.clerkUserId,
      body.reference,
    );
  }

  @Roles(UserRole.OWNER)
  @Post(':id/void')
  void(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.service.voidInvoice(auth.tenantId, id, auth.clerkUserId);
  }
}

/**
 * Public, unauthenticated customer-facing invoice view by share token.
 *
 * Rate limited because it is the only unauthenticated read of tenant data in the
 * system. Share tokens are UUIDs and so not practically guessable, but a tight
 * limit removes enumeration as an option entirely and caps the damage a leaked
 * token can do.
 */
@Controller('public/invoices')
@AllowInactive()
export class PublicInvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get(':shareToken')
  async view(@Param('shareToken') shareToken: string) {
    const invoice = await this.service.getByShareToken(shareToken);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }
}
