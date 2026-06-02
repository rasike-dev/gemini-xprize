import { Module } from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { BillingController, BillingWebhookController } from './billing.controller.js';

@Module({
  providers: [BillingService],
  controllers: [BillingController, BillingWebhookController],
  exports: [BillingService],
})
export class BillingModule {}
