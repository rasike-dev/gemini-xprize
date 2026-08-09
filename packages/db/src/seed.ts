import { randomUUID } from 'node:crypto';
import { createOwnerClient } from './client.js';

/**
 * Seeds a demo tenant with a realistic small-business dataset: a printing shop
 * with customers, an inquiry, a quote, invoices (one overdue), a payment,
 * reminders, and a history of AgentRuns. Powers the demo + smoke test.
 *
 * Runs on the owner connection, which bypasses RLS: the wipe-and-recreate below
 * spans a tenant that does not exist yet. app.tenant_id is still set so this also
 * works if it is ever pointed at a restricted role.
 */
const prisma = createOwnerClient();
async function main() {
  const tenantId = 'f7f7ecf3-f566-4df7-94f5-9f5504f9699c';
  const clerkOrgId = 'org_demo_printpro';
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 864e5);
  const daysAhead = (d: number) => new Date(now.getTime() + d * 864e5);

  await prisma.$transaction(async (tx) => {
    // Make seed rerunnable: wipe the previous demo tenant and recreate.
    const existing = await tx.tenant.findUnique({ where: { clerkOrgId } });
    if (existing) {
      await tx.tenant.delete({ where: { id: existing.id } });
    }

    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    await tx.tenant.create({
      data: {
        id: tenantId,
        clerkOrgId,
        name: 'PrintPro Lanka (Pvt) Ltd',
        currency: 'LKR',
        countryCode: 'LK',
        vatNumber: '134567890-7000',
        autoSend: false,
        tokenBudget: BigInt(5_000_000),
        subscription: {
          create: {
            plan: 'GROWTH',
            status: 'ACTIVE',
            provider: 'PAYHERE',
            interval: 'MONTHLY',
            currentPeriodEnd: daysAhead(30),
          },
        },
        users: {
          create: [
            {
              clerkUserId: 'user_demo_owner',
              email: 'owner@printpro.lk',
              name: 'Nuwan Perera',
              role: 'OWNER',
            },
          ],
        },
      },
    });

    const acme = await tx.customer.create({
      data: {
        tenantId,
        name: 'Acme Events',
        phone: '+94771234567',
        email: 'hello@acme.lk',
        lastContact: daysAgo(2),
      },
    });
    const silva = await tx.customer.create({
      data: {
        tenantId,
        name: 'Silva Traders',
        phone: '+94772223344',
        email: 'accounts@silvatraders.lk',
        lastContact: daysAgo(20),
      },
    });

    const inquiry = await tx.inquiry.create({
      data: {
        tenantId,
        customerId: acme.id,
        channel: 'WHATSAPP',
        fromIdentifier: '+94771234567',
        fromName: 'Acme Events',
        body: 'Hi, can you send me a quote for 20 printed T-shirts, full color front?',
        idempotencyKey: randomUUID(),
        receivedAt: daysAgo(2),
      },
    });

    const quote = await tx.quote.create({
      data: {
        tenantId,
        customerId: acme.id,
        number: 'Q-1001',
        status: 'ACCEPTED',
        currency: 'LKR',
        subtotalMinor: 4000000,
        taxMinor: 720000,
        totalMinor: 4720000,
        validUntil: daysAhead(14),
        lines: {
          create: [
            {
              tenantId,
              description: 'Printed T-shirt, full color front (20 units)',
              quantity: 20,
              unitPriceMinor: 200000,
              taxRatePct: 18,
              totalMinor: 4720000,
            },
          ],
        },
      },
    });

    // Paid invoice (from the accepted quote).
    const paidInvoice = await tx.invoice.create({
      data: {
        tenantId,
        customerId: acme.id,
        quoteId: quote.id,
        number: 'INV-1001',
        status: 'PAID',
        currency: 'LKR',
        subtotalMinor: 4000000,
        taxMinor: 720000,
        totalMinor: 4720000,
        paidMinor: 4720000,
        dueDate: daysAgo(1),
        lines: {
          create: [
            {
              tenantId,
              description: 'Printed T-shirt, full color front (20 units)',
              quantity: 20,
              unitPriceMinor: 200000,
              taxRatePct: 18,
              totalMinor: 4720000,
            },
          ],
        },
        payments: {
          create: [{ tenantId, amountMinor: 4720000, method: 'manual', paidAt: daysAgo(3) }],
        },
      },
    });

    // Overdue invoice (drives the Payment Follow-up Agent demo).
    const overdueInvoice = await tx.invoice.create({
      data: {
        tenantId,
        customerId: silva.id,
        number: 'INV-1002',
        status: 'OVERDUE',
        currency: 'LKR',
        subtotalMinor: 9000000,
        taxMinor: 1620000,
        totalMinor: 10620000,
        paidMinor: 0,
        dueDate: daysAgo(7),
        lines: {
          create: [
            {
              tenantId,
              description: 'Corporate brochure printing (500 units)',
              quantity: 500,
              unitPriceMinor: 18000,
              taxRatePct: 18,
              totalMinor: 10620000,
            },
          ],
        },
        reminders: {
          create: [
            {
              tenantId,
              channel: 'EMAIL',
              subject: 'Friendly reminder: Invoice INV-1002',
              message:
                'Dear Silva Traders, this is a gentle reminder that invoice INV-1002 for LKR 106,200.00 was due on ' +
                daysAgo(7).toDateString() +
                '. Please let us know if you need anything to process payment. Thank you!',
              tone: 'FRIENDLY',
              approved: true,
              sentAt: daysAgo(1),
            },
          ],
        },
      },
    });

    // Agent run history (the AI audit trail judges will inspect).
    await tx.agentRun.createMany({
      data: [
        {
          tenantId,
          agentType: 'INQUIRY',
          status: 'COMPLETED',
          inquiryId: inquiry.id,
          inputJson: { body: 'quote for 20 printed T-shirts' },
          outputJson: { intent: 'QUOTE_REQUEST', customerName: 'Acme Events', confidence: 0.94 },
          decision: 'QUOTE_REQUEST',
          confidence: 0.94,
          geminiModel: 'gemini-2.0-flash',
          tokensUsed: 612,
          costEstimate: 0.00009,
          startedAt: daysAgo(2),
          completedAt: daysAgo(2),
        },
        {
          tenantId,
          agentType: 'QUOTE',
          status: 'COMPLETED',
          subjectType: 'quote',
          subjectId: quote.id,
          inputJson: { inquiryId: inquiry.id },
          outputJson: { lines: 1, totalMinor: 4720000, confidence: 0.88 },
          decision: 'quote_generated',
          confidence: 0.88,
          humanApproved: true,
          approvedBy: 'Nuwan Perera',
          geminiModel: 'gemini-2.0-flash',
          tokensUsed: 1044,
          costEstimate: 0.00021,
          startedAt: daysAgo(2),
          completedAt: daysAgo(2),
        },
        {
          tenantId,
          agentType: 'PAYMENT_FOLLOWUP',
          status: 'COMPLETED',
          subjectType: 'invoice',
          subjectId: overdueInvoice.id,
          inputJson: { invoiceNumber: 'INV-1002', daysOverdue: 7 },
          outputJson: { tone: 'FRIENDLY', channel: 'EMAIL', confidence: 0.91 },
          decision: 'reminder_drafted',
          confidence: 0.91,
          humanApproved: true,
          approvedBy: 'Nuwan Perera',
          geminiModel: 'gemini-2.0-flash',
          tokensUsed: 498,
          costEstimate: 0.00008,
          startedAt: daysAgo(1),
          completedAt: daysAgo(1),
        },
        {
          tenantId,
          agentType: 'CASHFLOW',
          status: 'COMPLETED',
          inputJson: { period: 'last_7_days' },
          outputJson: {
            salesMinor: 15340000,
            collectedMinor: 4720000,
            overdueMinor: 10620000,
            confidence: 0.86,
          },
          decision: 'summary_generated',
          confidence: 0.86,
          geminiModel: 'gemini-2.0-pro',
          tokensUsed: 1820,
          costEstimate: 0.0011,
          startedAt: daysAgo(1),
          completedAt: daysAgo(1),
        },
      ],
    });

    void paidInvoice;
  });

  console.log(`Seeded demo tenant ${tenantId} (${clerkOrgId}, PrintPro Lanka).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
