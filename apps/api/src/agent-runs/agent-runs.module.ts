import { Module } from '@nestjs/common';
import { AgentRunsService } from './agent-runs.service.js';
import { AgentRunsController } from './agent-runs.controller.js';

@Module({
  providers: [AgentRunsService],
  controllers: [AgentRunsController],
  exports: [AgentRunsService],
})
export class AgentRunsModule {}
