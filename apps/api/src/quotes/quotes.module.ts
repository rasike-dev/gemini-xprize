import { Module } from '@nestjs/common';
import { QuotesService } from './quotes.service.js';
import { QuotesController } from './quotes.controller.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { AgentRunsModule } from '../agent-runs/agent-runs.module.js';

@Module({
  imports: [InvoicesModule, AgentRunsModule],
  providers: [QuotesService],
  controllers: [QuotesController],
  exports: [QuotesService],
})
export class QuotesModule {}
