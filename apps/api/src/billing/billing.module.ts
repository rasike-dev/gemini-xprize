import { Global, Module } from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { PayHereService } from './payhere.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { BillingController, BillingWebhookController } from './billing.controller.js';

/**
 * Global so EntitlementsService can be injected by the guard registered in
 * AppModule and by feature services that enforce their own quotas.
 */
@Global()
@Module({
  providers: [BillingService, PayHereService, EntitlementsService],
  controllers: [BillingController, BillingWebhookController],
  exports: [BillingService, PayHereService, EntitlementsService],
})
export class BillingModule {}
