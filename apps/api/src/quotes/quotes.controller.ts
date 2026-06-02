import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AgentType, createQuoteSchema, type CreateQuote } from '@ledgerpilot/shared';
import { TenantId } from '../auth/decorators.js';
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

  @Post(':id/send')
  send(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.quotes.setStatus(tenantId, id, 'SENT');
  }

  /** Accept a quote and convert it into an invoice. */
  @Post(':id/accept')
  async accept(@TenantId() tenantId: string, @Param('id') id: string) {
    await this.quotes.setStatus(tenantId, id, 'ACCEPTED');
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
