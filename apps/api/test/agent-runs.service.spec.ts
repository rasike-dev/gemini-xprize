import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AgentType, PlanTier, SubscriptionStatus } from '@ledgerpilot/shared';
import { AgentRunsService } from '../src/agent-runs/agent-runs.service.js';
import { EntitlementsService } from '../src/billing/entitlements.service.js';
import {
  agentRunFixture,
  createFakeAudit,
  createFakePrisma,
  daysFromNow,
  emptyState,
  tenantFixture,
  type FakeState,
  type FakeSubscription,
} from './fake-prisma.js';
import type { AuditLogService } from '../src/common/audit-log.service.js';
import type { TasksService } from '../src/queue/tasks.service.js';
import type { RemindersService } from '../src/reminders/reminders.service.js';

function subscription(overrides: Partial<FakeSubscription> = {}): FakeSubscription {
  return {
    id: 'sub_1',
    tenantId: 'tenant_1',
    plan: PlanTier.STARTER,
    status: SubscriptionStatus.TRIALING,
    provider: 'PAYHERE',
    trialEndsAt: daysFromNow(7),
    currentPeriodEnd: null,
    ...overrides,
  };
}

function growthSubscription(): FakeSubscription {
  return subscription({
    plan: PlanTier.GROWTH,
    status: SubscriptionStatus.ACTIVE,
    trialEndsAt: null,
    currentPeriodEnd: daysFromNow(30),
  });
}

function build(state: Partial<FakeState> = {}, opts: { agentRunsUsed?: number } = {}) {
  const full = emptyState({
    tenants: [tenantFixture({ agentRunsUsed: opts.agentRunsUsed ?? 0 })],
    subscriptions: [subscription()],
    ...state,
  });
  const audit = createFakeAudit();
  const prisma = createFakePrisma(full);
  const entitlements = new EntitlementsService(prisma);
  const tasks = { enqueueAgentRun: vi.fn(async () => {}) } as unknown as TasksService;
  const reminders = {
    dispatch: vi.fn(async () => ({
      sent: true,
      channel: 'EMAIL' as const,
      detail: 'Reminder sent.',
    })),
  } as unknown as RemindersService;
  const service = new AgentRunsService(
    prisma,
    tasks,
    audit.service as unknown as AuditLogService,
    entitlements,
    reminders,
  );
  return { service, state: full, audit, tasks, reminders };
}

describe('AgentRunsService.createAndEnqueue', () => {
  it('does not create or enqueue when the agent quota is exhausted', async () => {
    const { service, state, tasks } = build({}, { agentRunsUsed: 30 });

    await expect(
      service.createAndEnqueue({
        tenantId: 'tenant_1',
        agentType: AgentType.PAYMENT_FOLLOWUP,
        inputJson: {},
      }),
    ).rejects.toThrow(/all 30 AI actions/);
    expect(state.agentRuns).toHaveLength(0);
    expect(tasks.enqueueAgentRun).not.toHaveBeenCalled();
  });

  it('gates COMPLIANCE agent behind plan feature', async () => {
    const { service, tasks } = build();

    await expect(
      service.createAndEnqueue({
        tenantId: 'tenant_1',
        agentType: AgentType.COMPLIANCE,
        inputJson: {},
      }),
    ).rejects.toThrow(/compliance agent/i);
    expect(tasks.enqueueAgentRun).not.toHaveBeenCalled();
  });

  it('allows COMPLIANCE on Growth and enqueues a PENDING run', async () => {
    const { service, tasks, audit } = build({ subscriptions: [growthSubscription()] });

    const run = await service.createAndEnqueue({
      tenantId: 'tenant_1',
      agentType: AgentType.COMPLIANCE,
      inputJson: { note: 'check vat' },
      idempotencyKey: 'compliance-1',
    });

    expect(run.status).toBe('PENDING');
    expect(tasks.enqueueAgentRun).toHaveBeenCalledWith(
      expect.objectContaining({ agentRunId: run.id, agentType: AgentType.COMPLIANCE }),
    );
    expect(audit.entries).toEqual([expect.objectContaining({ event: 'agent_run_enqueued' })]);
  });

  it('returns an existing run for the same idempotency key without re-enqueueing', async () => {
    const { service, tasks } = build({
      agentRuns: [
        agentRunFixture({
          id: 'run_existing',
          status: 'COMPLETED',
          idempotencyKey: 'dup-key',
        }),
      ],
    });

    const run = await service.createAndEnqueue({
      tenantId: 'tenant_1',
      agentType: AgentType.PAYMENT_FOLLOWUP,
      inputJson: {},
      idempotencyKey: 'dup-key',
    });

    expect(run.id).toBe('run_existing');
    expect(tasks.enqueueAgentRun).not.toHaveBeenCalled();
  });

  it('enqueues only when the run is still PENDING', async () => {
    const { service, tasks } = build({
      agentRuns: [
        agentRunFixture({
          id: 'run_pending',
          status: 'PENDING',
          idempotencyKey: 'pending-key',
        }),
      ],
    });

    await service.createAndEnqueue({
      tenantId: 'tenant_1',
      agentType: AgentType.PAYMENT_FOLLOWUP,
      inputJson: {},
      idempotencyKey: 'pending-key',
    });

    expect(tasks.enqueueAgentRun).toHaveBeenCalled();
  });
});

describe('AgentRunsService.approve', () => {
  it('rejects approval when the run is not AWAITING_APPROVAL', async () => {
    const { service, reminders } = build({
      agentRuns: [agentRunFixture({ status: 'COMPLETED' })],
    });

    await expect(service.approve('tenant_1', 'run_1', 'owner')).rejects.toThrow(BadRequestException);
    expect(reminders.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches PAYMENT_FOLLOWUP reminders and marks COMPLETED', async () => {
    const { service, reminders, audit } = build({
      agentRuns: [
        agentRunFixture({
          status: 'AWAITING_APPROVAL',
          agentType: AgentType.PAYMENT_FOLLOWUP,
          outputJson: { reminderId: 'rem_1' },
        }),
      ],
    });

    const updated = await service.approve('tenant_1', 'run_1', 'owner');

    expect(reminders.dispatch).toHaveBeenCalledWith('tenant_1', 'rem_1', 'owner');
    expect(updated.status).toBe('COMPLETED');
    expect(updated.humanApproved).toBe(true);
    expect(audit.entries).toEqual([
      expect.objectContaining({ event: 'agent_run_approved', payload: expect.objectContaining({ dispatched: true }) }),
    ]);
  });

  it('throws NotFound for a missing run', async () => {
    const { service } = build({ agentRuns: [] });

    await expect(service.approve('tenant_1', 'missing', 'owner')).rejects.toThrow(NotFoundException);
  });
});

describe('AgentRunsService.retryFailed', () => {
  it('only retries FAILED runs', async () => {
    const { service, tasks } = build({
      agentRuns: [agentRunFixture({ status: 'PENDING' })],
    });

    await expect(service.retryFailed('tenant_1', 'run_1')).rejects.toThrow(BadRequestException);
    expect(tasks.enqueueAgentRun).not.toHaveBeenCalled();
  });

  it('re-checks quota, resets status, and enqueues again', async () => {
    const { service, state, tasks, audit } = build({
      agentRuns: [
        agentRunFixture({
          status: 'FAILED',
          error: 'worker died',
          agentType: AgentType.PAYMENT_FOLLOWUP,
        }),
      ],
    });

    await service.retryFailed('tenant_1', 'run_1');

    expect(state.agentRuns[0]).toMatchObject({ status: 'PENDING', error: null });
    expect(tasks.enqueueAgentRun).toHaveBeenCalled();
    expect(audit.entries).toEqual([expect.objectContaining({ event: 'agent_run_retried' })]);
  });

  it('blocks retry when quota is exhausted', async () => {
    const { service, tasks } = build(
      {
        agentRuns: [agentRunFixture({ status: 'FAILED' })],
      },
      { agentRunsUsed: 30 },
    );

    await expect(service.retryFailed('tenant_1', 'run_1')).rejects.toThrow(/all 30 AI actions/);
    expect(tasks.enqueueAgentRun).not.toHaveBeenCalled();
  });
});
