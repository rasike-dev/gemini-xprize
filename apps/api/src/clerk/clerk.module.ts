import { Module } from '@nestjs/common';
import { ClerkWebhookController } from './clerk-webhook.controller.js';
import { ClerkAdminService } from './clerk-admin.service.js';

@Module({
  controllers: [ClerkWebhookController],
  providers: [ClerkAdminService],
  exports: [ClerkAdminService],
})
export class ClerkModule {}
