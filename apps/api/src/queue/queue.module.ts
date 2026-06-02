import { Global, Module } from '@nestjs/common';
import { TasksService } from './tasks.service.js';

@Global()
@Module({
  providers: [TasksService],
  exports: [TasksService],
})
export class QueueModule {}
