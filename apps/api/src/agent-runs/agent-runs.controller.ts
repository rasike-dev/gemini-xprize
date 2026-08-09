import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AgentType, UserRole } from '@ledgerpilot/shared';
import { Auth, Roles, TenantId } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AgentRunsService } from './agent-runs.service.js';

const triggerSchema = z.object({
  agentType: z.nativeEnum(AgentType),
  inputJson: z.record(z.string(), z.unknown()).default({}),
  inquiryId: z.string().uuid().optional(),
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
});

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

  /**
   * Owner-only: approving a run sends the drafted message to a customer under the
   * business's name, and for a payment reminder that is a debt-collection message.
   * That is the owner's call, not a staff member's.
   */
  @Roles(UserRole.OWNER)
  @Post(':id/approve')
  approve(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.service.approve(auth.tenantId, id, auth.clerkUserId);
  }

  @Post(':id/retry')
  retry(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.retryFailed(tenantId, id);
  }

  @Post()
  createManual(
    @TenantId() tenantId: string,
    @Body(new ZodPipe(triggerSchema)) body: z.infer<typeof triggerSchema>,
  ) {
    return this.service.createManualRun({
      tenantId,
      agentType: body.agentType,
      inputJson: body.inputJson,
      inquiryId: body.inquiryId,
      subjectType: body.subjectType,
      subjectId: body.subjectId,
    });
  }
}
