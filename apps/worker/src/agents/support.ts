import { generateStructured, modelFor, systemPromptFor } from '@ledgerpilot/ai';
import { AgentType, supportResultSchema } from '@ledgerpilot/shared';
import { withTenant } from '@ledgerpilot/db';
import type { AgentOutcome, AgentRunRow } from './types.js';

/**
 * Answers customer support questions around invoice/payment status.
 * Input: { question: string, invoiceId?: string, customerId?: string }
 */
export async function runSupportAgent(run: AgentRunRow): Promise<AgentOutcome> {
  const input = run.inputJson as { question?: string; invoiceId?: string; customerId?: string };
  const model = modelFor(AgentType.SUPPORT);
  const question = (input.question ?? '').trim();

  if (!question) {
    return {
      outputJson: { response: 'Please provide your question.', suggestedAction: null, confidence: 1 },
      decision: 'invalid_input',
      confidence: 1,
      model,
      tokensUsed: 0,
      costEstimate: 0,
      status: 'COMPLETED',
    };
  }

  const ctx = await withTenant(run.tenantId, async (tx) => {
    const invoice = input.invoiceId
      ? await tx.invoice.findUnique({
          where: { id: input.invoiceId },
          include: { customer: true },
        })
      : null;
    const customer = input.customerId
      ? await tx.customer.findUnique({ where: { id: input.customerId } })
      : invoice?.customer ?? null;
    return { invoice, customer };
  });

  const result = await generateStructured({
    model,
    system: systemPromptFor(AgentType.SUPPORT),
    user: JSON.stringify(
      {
        question,
        customer: ctx.customer
          ? { name: ctx.customer.name, email: ctx.customer.email, phone: ctx.customer.phone }
          : null,
        invoice: ctx.invoice
          ? {
              number: ctx.invoice.number,
              status: ctx.invoice.status,
              totalMinor: ctx.invoice.totalMinor,
              paidMinor: ctx.invoice.paidMinor,
              dueDate: ctx.invoice.dueDate,
            }
          : null,
      },
      null,
      2,
    ),
    schema: supportResultSchema,
    mock: () => {
      if (ctx.invoice) {
        const outstanding = ctx.invoice.totalMinor - ctx.invoice.paidMinor;
        return {
          response:
            `Invoice ${ctx.invoice.number} is currently ${ctx.invoice.status}. ` +
            `Outstanding amount is ${(outstanding / 100).toFixed(2)} ${ctx.invoice.currency}.`,
          suggestedAction:
            ctx.invoice.status === 'OVERDUE'
              ? 'Send a friendly reminder and provide payment link.'
              : 'Confirm expected payment date with the customer.',
          confidence: 0.84,
        };
      }
      return {
        response:
          'I can help with invoice/payment status. Please share the invoice number or customer name.',
        suggestedAction: 'Request invoice number from the customer.',
        confidence: 0.8,
      };
    },
  });

  return {
    outputJson: result.data,
    decision: 'support_response_generated',
    confidence: result.data.confidence,
    model: result.model,
    tokensUsed: result.totalTokens,
    costEstimate: result.costUsd,
    status: 'COMPLETED',
    subjectType: ctx.invoice ? 'invoice' : undefined,
    subjectId: ctx.invoice?.id,
  };
}
