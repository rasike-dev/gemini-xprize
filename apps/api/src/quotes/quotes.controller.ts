import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AgentType,
  QuoteStatus,
  createQuoteSchema,
  updateQuoteSchema,
  type CreateQuote,
  type UpdateQuote,
} from '@ledgerpilot/shared';
import { Auth, TenantId } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { QuotesService } from './quotes.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import { AgentRunsService } from '../agent-runs/agent-runs.service.js';

@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly invoices: InvoicesService,
    private readonly agentRuns: AgentRunsService,
  ) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.quotes.list(tenantId);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.quotes.get(tenantId, id);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body(new ZodPipe(createQuoteSchema)) body: CreateQuote) {
    return this.quotes.create(tenantId, body);
  }

  @Patch(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodPipe(updateQuoteSchema)) body: UpdateQuote,
  ) {
    return this.quotes.update(auth.tenantId, id, body, auth.clerkUserId);
  }

  @Delete(':id')
  remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.quotes.remove(auth.tenantId, id, auth.clerkUserId);
  }

  @Post(':id/send')
  send(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.quotes.send(auth.tenantId, id, auth.clerkUserId);
  }

  @Post(':id/reject')
  reject(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.quotes.setStatus(tenantId, id, QuoteStatus.REJECTED);
  }

  /** Accept a quote and convert it into an invoice. */
  @Post(':id/accept')
  async accept(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.quotes.setStatus(tenantId, id, QuoteStatus.ACCEPTED);
    const invoice = await this.invoices.createFromQuote(tenantId, id);
    // Invoice Agent renders the PDF asynchronously (logged as an AgentRun).
    await this.agentRuns.createAndEnqueue({
      tenantId,
      agentType: AgentType.INVOICE,
      inputJson: { invoiceId: invoice.id },
      subjectType: 'invoice',
      subjectId: invoice.id,
    });
    return invoice;
  }
}
