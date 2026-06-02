import { randomUUID } from 'node:crypto';
import { prisma, withTenant } from '@ledgerpilot/db';
import { AgentType, formatMoney } from '@ledgerpilot/shared';
import { createAndProcessRun } from './runner.js';
import { runOverdueScan, runCashflowSummaries } from './scheduler-jobs.js';

/**
 * End-to-end smoke test of the agent pipeline (runs fully offline via mock AI):
 *   Inquiry -> Quote -> Invoice (PDF) -> Payment Reminder -> Cash-flow -> Agent Logs
 */
async function main() {
  const tenantId = randomUUID();
  const orgId = `org_smoke_${tenantId.slice(0, 8)}`;

  console.log('1. Provisioning tenant...');
  await withTenant(tenantId, (tx) =>
    tx.tenant.create({
      data: {
        id: tenantId,
        clerkOrgId: orgId,
        name: 'Smoke Test Prints',
        currency: 'LKR',
        autoSend: true,
      },
    }),
  );

  console.log('2. Inbound inquiry -> Inquiry Agent (chains to Quote Agent)...');
  const inquiry = await withTenant(tenantId, (tx) =>
    tx.inquiry.create({
      data: {
        tenantId,
        channel: 'WHATSAPP',
        fromIdentifier: '+94770000001',
        fromName: 'Acme Events',
        body: 'Hi! Can you send me a quote for 20 printed T-shirts, full color front?',
        idempotencyKey: randomUUID(),
      },
    }),
  );
  await createAndProcessRun({
    tenantId,
    agentType: AgentType.INQUIRY,
    inputJson: { body: inquiry.body, from: inquiry.fromIdentifier, channel: 'WHATSAPP' },
    inquiryId: inquiry.id,
  });

  const quote = await withTenant(tenantId, (tx) =>
    tx.quote.findFirst({ orderBy: { createdAt: 'desc' }, include: { lines: true } }),
  );
  if (!quote) throw new Error('Quote agent did not produce a quote');
  console.log(`   -> Quote ${quote.number}: ${formatMoney(quote.totalMinor, quote.currency)}`);

  console.log('3. Owner accepts quote -> Invoice created -> Invoice Agent (PDF)...');
  const invoice = await withTenant(tenantId, async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        tenantId,
        customerId: quote.customerId,
        quoteId: quote.id,
        number: 'INV-9001',
        status: 'SENT',
        currency: quote.currency,
        subtotalMinor: quote.subtotalMinor,
        taxMinor: quote.taxMinor,
        totalMinor: quote.totalMinor,
        dueDate: new Date(Date.now() - 8 * 864e5), // already overdue for the demo
        lines: {
          create: quote.lines.map((l) => ({
            tenantId,
            description: l.description,
            quantity: l.quantity,
            unitPriceMinor: l.unitPriceMinor,
            taxRatePct: l.taxRatePct,
            totalMinor: l.totalMinor,
          })),
        },
      },
    });
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED' } });
    return inv;
  });
  await createAndProcessRun({
    tenantId,
    agentType: AgentType.INVOICE,
    inputJson: { invoiceId: invoice.id },
    subjectType: 'invoice',
    subjectId: invoice.id,
  });
  const withPdf = await withTenant(tenantId, (tx) =>
    tx.invoice.findUnique({ where: { id: invoice.id } }),
  );
  console.log(`   -> Invoice PDF: ${withPdf?.pdfUrl}`);

  console.log('4. Daily overdue scan -> Payment Follow-up Agent...');
  const scan = await runOverdueScan();
  console.log(`   -> scanned ${scan.scanned} tenant(s), drafted/sent ${scan.reminders} reminder(s)`);

  console.log('5. Daily cash-flow summary...');
  await runCashflowSummaries();

  console.log('\n6. Agent run audit log:');
  const runs = await withTenant(tenantId, (tx) =>
    tx.agentRun.findMany({ orderBy: { createdAt: 'asc' } }),
  );
  for (const r of runs) {
    console.log(
      `   [${r.agentType}] ${r.status} decision=${r.decision} confidence=${r.confidence ?? '-'} model=${r.geminiModel ?? '-'} tokens=${r.tokensUsed}`,
    );
  }

  console.log(`\nSmoke test OK. Tenant ${tenantId}, ${runs.length} agent runs.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('SMOKE FAILED:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
