import { Global, Module } from '@nestjs/common';
import { ClerkModule } from '../clerk/clerk.module.js';
import { TenantController } from './tenant.controller.js';
import { TenantService } from './tenant.service.js';
import { TenantProvisioningService } from './tenant-provisioning.service.js';

/** Global: the auth guard and the Clerk webhook both provision tenants. */
@Global()
@Module({
  imports: [ClerkModule],
  providers: [TenantService, TenantProvisioningService],
  controllers: [TenantController],
  exports: [TenantService, TenantProvisioningService],
})
export class TenantModule {}
