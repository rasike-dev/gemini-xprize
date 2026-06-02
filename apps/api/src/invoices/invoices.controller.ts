import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { TenantId, Public } from '../auth/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { InvoicesService } from './invoices.service.js';

const paymentSchema = z.object({
  amountMinor: z.number().int().positive(),
  method: z.string().max(40).default('manual'),
});

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

  @Post(':id/payments')
  async pay(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body(new ZodPipe(paymentSchema)) body: z.infer<typeof paymentSchema>,
  ) {
    return this.service.recordPayment(tenantId, id, body.amountMinor, body.method);
  }
}

/** Public, unauthenticated customer-facing invoice view by share token. */
@Controller('public/invoices')
export class PublicInvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Public()
  @Get(':shareToken')
  async view(@Param('shareToken') shareToken: string) {
    const invoice = await this.service.getByShareToken(shareToken);
    if (!invoice) throw new BadRequestException('Invoice not found');
    return invoice;
  }
}
