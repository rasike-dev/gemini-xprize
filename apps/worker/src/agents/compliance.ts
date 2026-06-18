import { generateStructured, modelFor, systemPromptFor } from '@ledgerpilot/ai';
import { AgentType, complianceResultSchema } from '@ledgerpilot/shared';
import { withTenant } from '@ledgerpilot/db';
import type { AgentOutcome, AgentRunRow } from './types.js';

/**
 * Validates invoice VAT/e-invoicing readiness and returns missing fields.
 * Input: { invoiceId: string }
 */
export async function runComplianceAgent(run: AgentRunRow): Promise<AgentOutcome> {
  const input = run.inputJson as { invoiceId?: string };
  const model = modelFor(AgentType.COMPLIANCE);

  if (!input.invoiceId) {
    return {
      outputJson: { ready: false, missingFields: ['invoiceId'], warnings: [], confidence: 1 },
      decision: 'invalid_input',
      confidence: 1,
      model,
      tokensUsed: 0,
      costEstimate: 0,
      status: 'COMPLETED',
    };
  }

  const facts = await withTenant(run.tenantId, async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { customer: true, lines: true },
    });
    const tenant = await tx.tenant.findUnique({
      where: { id: run.tenantId },
      select: { name: true, vatNumber: true, countryCode: true },
    });
    return { invoice, tenant };
  });

  if (!facts.invoice) {
    return {
      outputJson: { ready: false, missingFields: ['invoice'], warnings: [], confidence: 1 },
      decision: 'invoice_not_found',
      confidence: 1,
      model,
      tokensUsed: 0,
      costEstimate: 0,
      status: 'COMPLETED',
    };
  }
  const invoice = facts.invoice;

  const result = await generateStructured({
    model,
    system: systemPromptFor(AgentType.COMPLIANCE),
    user: JSON.stringify(
      {
        tenant: facts.tenant,
        invoice: {
          number: invoice.number,
          currency: invoice.currency,
          dueDate: invoice.dueDate,
          customer: {
            name: invoice.customer.name,
            email: invoice.customer.email,
          },
          lineCount: invoice.lines.length,
          subtotalMinor: invoice.subtotalMinor,
          taxMinor: invoice.taxMinor,
          totalMinor: invoice.totalMinor,
        },
        expectedFields: [
          'supplier name',
          'supplier VAT/TIN',
          'invoice number',
          'invoice date',
          'customer name',
          'currency',
          'line items',
          'subtotal/tax/total',
        ],
      },
      null,
      2,
    ),
    schema: complianceResultSchema,
    mock: () => {
      const missingFields: string[] = [];
      if (!facts.tenant?.vatNumber) missingFields.push('supplier VAT/TIN');
      if (!invoice.customer.name) missingFields.push('customer name');
      if (!invoice.lines.length) missingFields.push('line items');
      return {
        ready: missingFields.length === 0,
        missingFields,
        warnings:
          missingFields.length === 0
            ? ['Invoice appears VAT/e-invoice ready.']
            : ['Review missing fields before submission.'],
        confidence: 0.86,
      };
    },
  });

  return {
    outputJson: result.data,
    decision: result.data.ready ? 'compliance_ready' : 'compliance_missing_fields',
    confidence: result.data.confidence,
    model: result.model,
    tokensUsed: result.totalTokens,
    costEstimate: result.costUsd,
    status: 'COMPLETED',
    subjectType: 'invoice',
    subjectId: invoice.id,
  };
}
