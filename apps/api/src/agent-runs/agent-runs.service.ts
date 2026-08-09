import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgentType, type AgentType as AgentTypeValue } from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { TasksService } from '../queue/tasks.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { RemindersService, type DispatchResult } from '../reminders/reminders.service.js';

interface CreateRunInput {
  tenantId: string;
  agentType: AgentTypeValue;
  inputJson: unknown;
  inquiryId?: string;
  subjectType?: string;
  subjectId?: string;
  idempotencyKey?: string;
}

interface ManualRunInput {
  tenantId: string;
  agentType: AgentTypeValue;
  inputJson: unknown;
  inquiryId?: string;
  subjectType?: string;
  subjectId?: string;
}

/** Agents that only certain plans include. */
const AGENT_FEATURES = {
  [AgentType.COMPLIANCE]: 'complianceAgent',
  [AgentType.SUPPORT]: 'supportAgent',
} as const;

@Injectable()
export class AgentRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly audit: AuditLogService,
    private readonly entitlements: EntitlementsService,
    private readonly reminders: RemindersService,
  ) {}

  /** Create a PENDING AgentRun row, then enqueue it for the worker. Idempotent. */
  async createAndEnqueue(input: CreateRunInput) {
    // Checked before anything is written, so a tenant over their limit gets a
    // clear 402 instead of a queued job that dies in the worker.
    await this.entitlements.assertCanRunAgent(input.tenantId);

    const feature = AGENT_FEATURES[input.agentType as keyof typeof AGENT_FEATURES];
    if (feature) await this.entitlements.assertFeature(input.tenantId, feature);

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

  /**
   * The owner approves a drafted action, and the action then happens.
   *
   * Approval used to only set the status to COMPLETED, so a reminder the owner
   * had explicitly approved was never actually sent. Approval now dispatches the
   * work and the run is only marked COMPLETED once that succeeds.
   */
  async approve(tenantId: string, id: string, approvedBy: string) {
    const run = await this.get(tenantId, id);
    if (!run) throw new NotFoundException('Agent run not found');

    if (run.status !== 'AWAITING_APPROVAL') {
      throw new BadRequestException(
        `This action is ${run.status.toLowerCase().replaceAll('_', ' ')} and is not waiting for approval.`,
      );
    }

    const dispatch = await this.dispatchApproved(tenantId, run, approvedBy);

    const updated = await this.prisma.forTenant(tenantId, (tx) =>
      tx.agentRun.update({
        where: { id },
        data: {
          humanApproved: true,
          approvedBy,
          status: 'COMPLETED',
          completedAt: new Date(),
          outputJson: {
            ...((run.outputJson as Record<string, string> | null) ?? {}),
            // The wa.me link is deliberately not stored: it is a one-off the
            // caller opens immediately, and it embeds the whole message.
            ...(dispatch
              ? {
                  dispatchChannel: dispatch.channel,
                  dispatchDetail: dispatch.detail,
                  dispatchSent: String(dispatch.sent),
                }
              : {}),
          },
        },
      }),
    );

    this.audit.log('agent_run_approved', {
      tenantId,
      actor: approvedBy,
      agentRunId: id,
      agentType: run.agentType,
      dispatched: dispatch?.sent ?? false,
    });

    return { ...updated, dispatch };
  }

  /**
   * Carries out whatever the approved run had drafted. Returns null for agents
   * whose output needs no delivery (a quote draft, a cash-flow summary).
   */
  private async dispatchApproved(
    tenantId: string,
    run: { agentType: string; outputJson: unknown },
    actor: string,
  ): Promise<DispatchResult | null> {
    if (run.agentType !== AgentType.PAYMENT_FOLLOWUP) return null;

    const output = (run.outputJson ?? {}) as { reminderId?: string };
    if (!output.reminderId) return null;

    return this.reminders.dispatch(tenantId, output.reminderId, actor);
  }

  async retryFailed(tenantId: string, id: string) {
    const run = await this.prisma.forTenant(tenantId, (tx) =>
      tx.agentRun.findUnique({ where: { id } }),
    );
    if (!run) throw new NotFoundException('Agent run not found');
    if (run.status !== 'FAILED') {
      throw new BadRequestException('Only failed actions can be retried.');
    }

    await this.entitlements.assertCanRunAgent(tenantId);

    await this.prisma.forTenant(tenantId, (tx) =>
      tx.agentRun.update({
        where: { id },
        data: { status: 'PENDING', error: null, startedAt: null, completedAt: null },
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
