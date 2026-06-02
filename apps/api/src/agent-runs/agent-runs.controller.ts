import { Controller, Get, Param, Post } from '@nestjs/common';
import { Auth, TenantId } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AgentRunsService } from './agent-runs.service.js';

@Controller('agent-runs')
export class AgentRunsController {
  constructor(private readonly service: AgentRunsService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.service.list(tenantId);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.get(tenantId, id);
  }

  @Post(':id/approve')
  approve(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.service.approve(auth.tenantId, id, auth.clerkUserId);
  }
}
