import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { createCustomerSchema, type CreateCustomer } from '@ledgerpilot/shared';
import { TenantId } from '../auth/decorators.js';
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
    @TenantId() tenantId: string,
    @Body(new ZodPipe(createCustomerSchema)) body: CreateCustomer,
  ) {
    return this.service.create(tenantId, body);
  }
}
