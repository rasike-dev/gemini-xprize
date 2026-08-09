import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  UserRole,
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomer,
  type UpdateCustomer,
} from '@ledgerpilot/shared';
import { Auth, Roles, TenantId } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CustomersService } from './customers.service.js';

@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.service.list(tenantId);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post()
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(createCustomerSchema)) body: CreateCustomer,
  ) {
    return this.service.create(auth.tenantId, body, auth.clerkUserId);
  }

  @Patch(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodPipe(updateCustomerSchema)) body: UpdateCustomer,
  ) {
    return this.service.update(auth.tenantId, id, body, auth.clerkUserId);
  }

  /** Destructive, so owner-only. */
  @Roles(UserRole.OWNER)
  @Delete(':id')
  remove(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.service.remove(auth.tenantId, id, auth.clerkUserId);
  }
}
