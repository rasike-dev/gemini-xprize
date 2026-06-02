import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';
import { InvoicesController, PublicInvoicesController } from './invoices.controller.js';

@Module({
  providers: [InvoicesService],
  controllers: [InvoicesController, PublicInvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
