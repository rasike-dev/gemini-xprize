import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AgentType } from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { TasksService } from '../queue/tasks.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

interface CreateRunInput {
  tenantId: string;
  agentType: AgentType;
  inputJson: unknown;
  inquiryId?: string;
  subjectType?: string;
  subjectId?: string;
  idempotencyKey?: string;
}

interface ManualRunInput {
  tenantId: string;
  agentType: AgentType;
  inputJson: unknown;
  inquiryId?: string;
  subjectType?: string;
  subjectId?: string;
}

@Injectable()
export class AgentRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly audit: AuditLogService,
  ) {}

  /** Create a PENDING AgentRun row, then enqueue it for the worker. Idempotent. */
  async createAndEnqueue(input: CreateRunInput) {
    const idempotencyKey = input.idempotencyKey ?? randomUUID();

    const run = await this.prisma.forTenant(input.tenantId, async (tx) => {
      const existing = await tx.agentRun.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey } },
      });
      if (existing) return existing;

      return tx.agentRun.create({
        data: {
          tenantId: input.tenantId,
          agentType: input.agentType,
          status: 'PENDING',
          inquiryId: input.inquiryId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          inputJson: input.inputJson as object,
          idempotencyKey,
        },
      });
    });

    if (run.status === 'PENDING') {
      await this.tasks.enqueueAgentRun({
        agentRunId: run.id,
        tenantId: input.tenantId,
        agentType: input.agentType,
      });
      this.audit.log('agent_run_enqueued', {
        tenantId: input.tenantId,
        agentType: input.agentType,
        agentRunId: run.id,
      });
    }
    return run;
  }

  async createManualRun(input: ManualRunInput) {
    return this.createAndEnqueue({
      tenantId: input.tenantId,
      agentType: input.agentType,
      inputJson: input.inputJson,
      inquiryId: input.inquiryId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      idempotencyKey: `manual:${input.agentType}:${input.subjectType ?? 'none'}:${input.subjectId ?? randomUUID()}:${Date.now()}`,
    });
  }

  async list(tenantId: string, limit = 50) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.agentRun.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
    );
  }

  async get(tenantId: string, id: string) {
    return this.prisma.forTenant(tenantId, (tx) => tx.agentRun.findUnique({ where: { id } }));
  }

  /** Owner approves an agent's drafted action (e.g. send reminder). */
  async approve(tenantId: string, id: string, approvedBy: string) {
    const approved = await this.prisma.forTenant(tenantId, (tx) =>
      tx.agentRun.update({
        where: { id },
        data: { humanApproved: true, approvedBy, status: 'COMPLETED' },
      }),
    );
    this.audit.log('agent_run_approved', {
      tenantId,
      agentRunId: id,
      approvedBy,
    });
    return approved;
  }

  async retryFailed(tenantId: string, id: string) {
    const run = await this.prisma.forTenant(tenantId, (tx) =>
      tx.agentRun.findUnique({ where: { id } }),
    );
    if (!run) throw new Error('AgentRun not found');
    if (run.status !== 'FAILED') throw new Error('Only FAILED runs can be retried');

    await this.prisma.forTenant(tenantId, (tx) =>
      tx.agentRun.update({
        where: { id },
        data: {
          status: 'PENDING',
          error: null,
          startedAt: null,
          completedAt: null,
        },
      }),
    );
    await this.tasks.enqueueAgentRun({
      agentRunId: id,
      tenantId,
      agentType: run.agentType,
    });
    this.audit.log('agent_run_retried', { tenantId, agentRunId: id, agentType: run.agentType });
    return { ok: true };
  }
}
