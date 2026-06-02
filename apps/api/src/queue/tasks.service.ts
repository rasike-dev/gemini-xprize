import { Injectable, Logger } from '@nestjs/common';
import { CloudTasksClient } from '@google-cloud/tasks';
import type { AgentTask } from '@ledgerpilot/shared';

/**
 * Enqueues AgentRun tasks. Two drivers:
 *  - cloud:  Google Cloud Tasks -> OIDC-authenticated POST to the worker.
 *  - inline: plain HTTP POST to the worker (local dev / no GCP).
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private client?: CloudTasksClient;

  private get driver(): 'cloud' | 'inline' {
    return process.env.TASKS_DRIVER === 'cloud' ? 'cloud' : 'inline';
  }

  async enqueueAgentRun(task: AgentTask): Promise<void> {
    const workerUrl = process.env.WORKER_URL ?? 'http://localhost:8081';
    const target = `${workerUrl}/tasks/agent-run`;

    if (this.driver === 'inline') {
      // Fire-and-forget; the worker writes results back to the DB.
      void fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(task),
      }).catch((err) => this.logger.error(`Inline enqueue failed: ${(err as Error).message}`));
      this.logger.log(`[inline] enqueued ${task.agentType} run ${task.agentRunId}`);
      return;
    }

    this.client ??= new CloudTasksClient();
    const project = process.env.GCP_PROJECT_ID!;
    const location = process.env.TASKS_LOCATION ?? 'us-central1';
    const queue = process.env.TASKS_QUEUE ?? 'agent-runs';
    const parent = this.client.queuePath(project, location, queue);

    await this.client.createTask({
      parent,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: target,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(task)).toString('base64'),
          oidcToken: {
            serviceAccountEmail: process.env.WORKER_SERVICE_ACCOUNT!,
            audience: workerUrl,
          },
        },
      },
    });
    this.logger.log(`[cloud] enqueued ${task.agentType} run ${task.agentRunId}`);
  }
}
