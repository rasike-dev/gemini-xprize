import { generateStructured, modelFor, systemPromptFor } from '@ledgerpilot/ai';
import { AgentType, lineTotalMinor, quoteResultSchema, sumMinor } from '@ledgerpilot/shared';
import { withTenant } from '@ledgerpilot/db';
import type { AgentOutcome, AgentRunRow } from './types.js';

const AUTOSEND_THRESHOLD = Number(process.env.AGENT_AUTOSEND_CONFIDENCE_THRESHOLD ?? 0.8);

/** Turns an inquiry into a DRAFT quote. Low-confidence quotes await human approval. */
export async function runQuoteAgent(run: AgentRunRow): Promise<AgentOutcome> {
  const input = run.inputJson as { inquiryId?: string; body: string };
  const model = modelFor(AgentType.QUOTE);

  const { tenant, customerId } = await withTenant(run.tenantId, async (tx) => {
    const t = await tx.tenant.findUnique({
      where: { id: run.tenantId },
      select: { currency: true },
    });
    let cid: string | undefined;
    if (input.inquiryId) {
      const inq = await tx.inquiry.findUnique({ where: { id: input.inquiryId } });
      cid = inq?.customerId ?? undefined;
    }
    return { tenant: t, customerId: cid };
  });

  const currency = tenant?.currency ?? 'LKR';

  const result = await generateStructured({
    model,
    system: systemPromptFor(AgentType.QUOTE),
    user: `Tenant currency: ${currency}. Inquiry:\n"""${input.body}"""\nReturn quote lines with integer minor-unit prices.`,
    schema: quoteResultSchema,
    mock: () => ({
      currency,
      lines: [
        {
          description: 'Printed T-shirt, full color front',
          quantity: 20,
          unitPriceMinor: 200000,
          taxRatePct: 18,
        },
      ],
      notes: 'Auto-generated from inquiry. Lead time 5 business days.',
      assumptions: ['Assumed standard cotton T-shirt', 'Assumed single-side print'],
      confidence: 0.82,
    }),
  });

  let quoteId: string | undefined;
  if (customerId) {
    quoteId = await withTenant(run.tenantId, async (tx) => {
      const count = await tx.quote.count();
      const lines = result.data.lines.map((l) => ({
        tenantId: run.tenantId,
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        taxRatePct: l.taxRatePct,
        totalMinor: lineTotalMinor(l.quantity, l.unitPriceMinor, l.taxRatePct),
      }));
      const subtotalMinor = sumMinor(lines.map((l) => l.quantity * l.unitPriceMinor));
      const totalMinor = sumMinor(lines.map((l) => l.totalMinor));
      const quote = await tx.quote.create({
        data: {
          tenantId: run.tenantId,
          customerId,
          number: `Q-${1001 + count}`,
          status: 'DRAFT',
          currency: result.data.currency,
          notes: result.data.notes,
          subtotalMinor,
          taxMinor: totalMinor - subtotalMinor,
          totalMinor,
          lines: { create: lines },
        },
      });
      return quote.id;
    });
  }

  const status = result.data.confidence >= AUTOSEND_THRESHOLD ? 'COMPLETED' : 'AWAITING_APPROVAL';

  return {
    outputJson: { ...result.data, quoteId },
    decision: 'quote_generated',
    confidence: result.data.confidence,
    model: result.model,
    tokensUsed: result.totalTokens,
    costEstimate: result.costUsd,
    status,
    subjectType: 'quote',
    subjectId: quoteId,
  };
}
