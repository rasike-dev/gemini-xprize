import {
  generateStructured,
  modelFor,
  systemPromptFor,
} from '@ledgerpilot/ai';
import { AgentType, inquiryResultSchema } from '@ledgerpilot/shared';
import { withTenant } from '@ledgerpilot/db';
import type { AgentOutcome, AgentRunRow } from './types.js';

/** Classifies an inquiry, links/creates the customer, and (if a quote request) spawns a QUOTE run. */
export async function runInquiryAgent(
  run: AgentRunRow,
  enqueue: (agentType: AgentType, inputJson: unknown, inquiryId?: string) => Promise<void>,
): Promise<AgentOutcome> {
  const input = run.inputJson as { body: string; from?: string };
  const model = modelFor(AgentType.INQUIRY);

  const result = await generateStructured({
    model,
    system: systemPromptFor(AgentType.INQUIRY),
    user: `Inquiry text:\n"""${input.body}"""\nSender: ${input.from ?? 'unknown'}`,
    schema: inquiryResultSchema,
    mock: () => ({
      intent: /quote|price|cost|how much/i.test(input.body) ? 'QUOTE_REQUEST' : 'OTHER',
      customerName: input.from ?? null,
      customerContact: input.from ?? null,
      summary: input.body.slice(0, 200),
      confidence: 0.9,
    }),
  });

  // Link inquiry to a customer (match by contact, else create).
  if (run.inquiryId) {
    await withTenant(run.tenantId, async (tx) => {
      const contact = result.data.customerContact ?? input.from;
      let customer = contact
        ? await tx.customer.findFirst({
            where: { OR: [{ phone: contact }, { email: contact }] },
          })
        : null;
      if (!customer && (result.data.customerName || contact)) {
        customer = await tx.customer.create({
          data: {
            tenantId: run.tenantId,
            name: result.data.customerName ?? contact ?? 'Unknown',
            phone: contact?.startsWith('+') ? contact : undefined,
            email: contact?.includes('@') ? contact : undefined,
            lastContact: new Date(),
          },
        });
      }
      if (customer) {
        await tx.inquiry.update({
          where: { id: run.inquiryId! },
          data: { customerId: customer.id },
        });
      }
    });
  }

  // Chain to the Quote agent when appropriate.
  if (result.data.intent === 'QUOTE_REQUEST' && run.inquiryId) {
    await enqueue(AgentType.QUOTE, { inquiryId: run.inquiryId, body: input.body }, run.inquiryId);
  }

  return {
    outputJson: result.data,
    decision: result.data.intent,
    confidence: result.data.confidence,
    model: result.model,
    tokensUsed: result.totalTokens,
    costEstimate: result.costUsd,
    status: 'COMPLETED',
  };
}
