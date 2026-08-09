import { randomUUID } from 'node:crypto';
import { withTenant } from '@ledgerpilot/db';
import { AgentType, type AgentTask } from '@ledgerpilot/shared';
import { runInquiryAgent } from './agents/inquiry.js';
import { runQuoteAgent } from './agents/quote.js';
import { runInvoiceAgent } from './agents/invoice.js';
import { runPaymentFollowupAgent } from './agents/payment-followup.js';
import { runCashflowAgent } from './agents/cashflow.js';
import { runComplianceAgent } from './agents/compliance.js';
import { runSupportAgent } from './agents/support.js';
import type { AgentOutcome, AgentRunRow } from './agents/types.js';
import {
  assertWithinBudget,
  assertWithinRunQuota,
  BudgetExceededError,
  recordAgentRun,
  recordTokenUsage,
} from './budget.js';

/** Create a PENDING AgentRun then process it (used for chaining inside the worker). */
export async function createAndProcessRun(input: {
  tenantId: string;
  agentType: AgentType;
  inputJson: unknown;
  inquiryId?: string;
  subjectType?: string;
  subjectId?: string;
}): Promise<string> {
  const run = await withTenant(input.tenantId, (tx) =>
    tx.agentRun.create({
      data: {
        tenantId: input.tenantId,
        agentType: input.agentType,
        status: 'PENDING',
        inquiryId: input.inquiryId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        inputJson: input.inputJson as object,
        idempotencyKey: randomUUID(),
      },
    }),
  );
  await processAgentRun({ agentRunId: run.id, tenantId: input.tenantId, agentType: input.agentType });
  return run.id;
}

/** Main entry: load the run, dispatch to its agent, persist the outcome. */
export async function processAgentRun(task: AgentTask): Promise<void> {
  const { agentRunId, tenantId } = task;

  const run = await withTenant(tenantId, (tx) =>
    tx.agentRun.findUnique({ where: { id: agentRunId } }),
  );
  if (!run) throw new Error(`AgentRun ${agentRunId} not found`);
  if (run.status === 'COMPLETED' || run.status === 'AWAITING_APPROVAL') return; // idempotent

  await withTenant(tenantId, (tx) =>
    tx.agentRun.update({
      where: { id: agentRunId },
      data: { status: 'RUNNING', startedAt: new Date() },
    }),
  );

  const row: AgentRunRow = {
    id: run.id,
    tenantId: run.tenantId,
    agentType: run.agentType,
    inquiryId: run.inquiryId,
    subjectType: run.subjectType,
    subjectId: run.subjectId,
    inputJson: run.inputJson,
  };

  try {
    // Scheduled work never passes through the API, so both plan limits are
    // enforced here as well as at the API boundary.
    await assertWithinRunQuota(tenantId);
    await assertWithinBudget(tenantId);
    await recordAgentRun(tenantId);

    const outcome = await dispatch(row);

    await withTenant(tenantId, (tx) =>
      tx.agentRun.update({
        where: { id: agentRunId },
        data: {
          status: outcome.status,
          outputJson: outcome.outputJson as object,
          decision: outcome.decision,
          confidence: outcome.confidence,
          geminiModel: outcome.model,
          tokensUsed: outcome.tokensUsed,
          costEstimate: outcome.costEstimate,
          subjectType: outcome.subjectType ?? run.subjectType,
          subjectId: outcome.subjectId ?? run.subjectId,
          completedAt: new Date(),
        },
      }),
    );
    await recordTokenUsage(tenantId, outcome.tokensUsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await withTenant(tenantId, (tx) =>
      tx.agentRun.update({
        where: { id: agentRunId },
        data: {
          status: 'FAILED',
          error: message,
          completedAt: new Date(),
        },
      }),
    );
    if (!(err instanceof BudgetExceededError)) throw err;
  }
}

async function dispatch(row: AgentRunRow): Promise<AgentOutcome> {
  switch (row.agentType) {
    case AgentType.INQUIRY:
      return runInquiryAgent(row, async (agentType, inputJson, inquiryId) => {
        await createAndProcessRun({ tenantId: row.tenantId, agentType, inputJson, inquiryId });
      });
    case AgentType.QUOTE:
      return runQuoteAgent(row);
    case AgentType.INVOICE:
      return runInvoiceAgent(row);
    case AgentType.PAYMENT_FOLLOWUP:
      return runPaymentFollowupAgent(row);
    case AgentType.CASHFLOW:
      return runCashflowAgent(row);
    case AgentType.COMPLIANCE:
      return runComplianceAgent(row);
    case AgentType.SUPPORT:
      return runSupportAgent(row);
    default:
      throw new Error(`No handler for agent type ${row.agentType}`);
  }
}
