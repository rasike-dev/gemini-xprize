import { withTenant } from '@ledgerpilot/db';
import type { AgentOutcome, AgentRunRow } from './types.js';
import { generateInvoicePdf } from '../pdf.js';

/**
 * Invoice Agent: deterministic action (no LLM) that renders the invoice PDF,
 * stores it, and records the URL. Logged as an AgentRun for a complete audit trail.
 */
export async function runInvoiceAgent(run: AgentRunRow): Promise<AgentOutcome> {
  const input = run.inputJson as { invoiceId: string };

  const ctx = await withTenant(run.tenantId, async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { customer: true, lines: true },
    });
    const tenant = await tx.tenant.findUnique({
      where: { id: run.tenantId },
      select: { name: true },
    });
    return { invoice, tenant };
  });

  if (!ctx.invoice) {
    return {
      outputJson: { error: 'invoice_not_found' },
      decision: 'skipped',
      confidence: 1,
      model: 'none',
      tokensUsed: 0,
      costEstimate: 0,
      status: 'COMPLETED',
    };
  }

  const pdfUrl = await generateInvoicePdf(
    {
      number: ctx.invoice.number,
      currency: ctx.invoice.currency,
      totalMinor: ctx.invoice.totalMinor,
      subtotalMinor: ctx.invoice.subtotalMinor,
      taxMinor: ctx.invoice.taxMinor,
      dueDate: ctx.invoice.dueDate,
      customer: { name: ctx.invoice.customer.name, email: ctx.invoice.customer.email },
      lines: ctx.invoice.lines,
    },
    ctx.tenant?.name ?? 'BizOpsMate AI',
  );

  await withTenant(run.tenantId, (tx) =>
    tx.invoice.update({ where: { id: ctx.invoice!.id }, data: { pdfUrl } }),
  );

  return {
    outputJson: { pdfUrl, invoiceNumber: ctx.invoice.number },
    decision: 'invoice_pdf_generated',
    confidence: 1,
    model: 'none',
    tokensUsed: 0,
    costEstimate: 0,
    status: 'COMPLETED',
    subjectType: 'invoice',
    subjectId: ctx.invoice.id,
  };
}
