import { prisma, withTenant } from '@ledgerpilot/db';
import { AgentType } from '@ledgerpilot/shared';
import { createAndProcessRun } from './runner.js';

async function allTenantIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ all_tenant_ids: string }[]>`
    SELECT all_tenant_ids() AS all_tenant_ids
  `;
  return rows.map((r) => r.all_tenant_ids).filter(Boolean);
}

/**
 * Cloud Scheduler -> /jobs/overdue-scan (daily). For each tenant, flag newly
 * overdue invoices and spawn a Payment Follow-up agent run per invoice.
 */
export async function runOverdueScan(): Promise<{ scanned: number; reminders: number }> {
  const tenantIds = await allTenantIds();
  let reminders = 0;

  for (const tenantId of tenantIds) {
    const overdue = await withTenant(tenantId, async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: {
          dueDate: { lt: new Date() },
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
      });
      // Mark SENT/PARTIALLY_PAID as OVERDUE.
      await tx.invoice.updateMany({
        where: { id: { in: invoices.map((i) => i.id) }, status: { in: ['SENT'] } },
        data: { status: 'OVERDUE' },
      });
      return invoices;
    });

    for (const invoice of overdue) {
      await createAndProcessRun({
        tenantId,
        agentType: AgentType.PAYMENT_FOLLOWUP,
        inputJson: { invoiceId: invoice.id },
        subjectType: 'invoice',
        subjectId: invoice.id,
      });
      reminders += 1;
    }
  }

  return { scanned: tenantIds.length, reminders };
}

/**
 * Cloud Scheduler -> /jobs/cashflow-summary (daily/weekly). One Cash-flow agent
 * run per tenant.
 */
export async function runCashflowSummaries(): Promise<{ tenants: number }> {
  const tenantIds = await allTenantIds();
  for (const tenantId of tenantIds) {
    await createAndProcessRun({
      tenantId,
      agentType: AgentType.CASHFLOW,
      inputJson: { period: 'last_7_days' },
    });
  }
  return { tenants: tenantIds.length };
}
