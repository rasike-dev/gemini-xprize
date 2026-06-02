import { Controller, Get } from '@nestjs/common';
import { TenantId } from '../auth/decorators.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  summary(@TenantId() tenantId: string) {
    return this.service.summary(tenantId);
  }
}
