import { generateStructured, modelFor, systemPromptFor } from '@ledgerpilot/ai';
import { AgentType, cashflowResultSchema, formatMoney } from '@ledgerpilot/shared';
import { withTenant } from '@ledgerpilot/db';
import type { AgentOutcome, AgentRunRow } from './types.js';

/** Summarizes the last 7 days of sales, collections, and overdue amounts. */
export async function runCashflowAgent(run: AgentRunRow): Promise<AgentOutcome> {
  const model = modelFor(AgentType.CASHFLOW);
  const since = new Date(Date.now() - 7 * 864e5);

  const facts = await withTenant(run.tenantId, async (tx) => {
    const [invoices, payments, currency, topCustomers] = await Promise.all([
      tx.invoice.findMany({ select: { status: true, totalMinor: true, paidMinor: true } }),
      tx.payment.aggregate({ _sum: { amountMinor: true }, where: { paidAt: { gte: since } } }),
      tx.tenant.findUnique({ where: { id: run.tenantId }, select: { currency: true } }),
      tx.invoice.groupBy({
        by: ['customerId'],
        _sum: { totalMinor: true },
        orderBy: { _sum: { totalMinor: 'desc' } },
        take: 3,
      }),
    ]);
    const names = await Promise.all(
      topCustomers.map((c) =>
        tx.customer.findUnique({ where: { id: c.customerId }, select: { name: true } }),
      ),
    );
    return {
      salesMinor: invoices.reduce((a, i) => a + i.totalMinor, 0),
      collectedMinor: payments._sum.amountMinor ?? 0,
      overdueMinor: invoices
        .filter((i) => i.status === 'OVERDUE' || i.status === 'PARTIALLY_PAID')
        .reduce((a, i) => a + (i.totalMinor - i.paidMinor), 0),
      currency: currency?.currency ?? 'LKR',
      topCustomers: names.map((n) => n?.name ?? 'Unknown'),
    };
  });

  const result = await generateStructured({
    model,
    system: systemPromptFor(AgentType.CASHFLOW),
    user: `Last 7 days. Sales ${formatMoney(facts.salesMinor, facts.currency)}, collected ${formatMoney(facts.collectedMinor, facts.currency)}, overdue ${formatMoney(facts.overdueMinor, facts.currency)}. Top customers: ${facts.topCustomers.join(', ')}.`,
    schema: cashflowResultSchema,
    mock: () => ({
      periodLabel: 'Last 7 days',
      headline:
        facts.overdueMinor > 0
          ? `${formatMoney(facts.overdueMinor, facts.currency)} is overdue - chase the top 2 invoices today.`
          : 'Collections are healthy this week.',
      salesMinor: facts.salesMinor,
      collectedMinor: facts.collectedMinor,
      overdueMinor: facts.overdueMinor,
      warnings:
        facts.overdueMinor > 0 ? ['Overdue balance is rising; send reminders.'] : [],
      topCustomers: facts.topCustomers,
      confidence: 0.85,
    }),
  });

  return {
    outputJson: result.data,
    decision: 'summary_generated',
    confidence: result.data.confidence,
    model: result.model,
    tokensUsed: result.totalTokens,
    costEstimate: result.costUsd,
    status: 'COMPLETED',
  };
}
