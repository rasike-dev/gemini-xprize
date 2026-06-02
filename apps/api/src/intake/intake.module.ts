import { Module } from '@nestjs/common';
import { IntakeController } from './intake.controller.js';
import { AgentRunsModule } from '../agent-runs/agent-runs.module.js';

@Module({
  imports: [AgentRunsModule],
  controllers: [IntakeController],
})
export class IntakeModule {}
