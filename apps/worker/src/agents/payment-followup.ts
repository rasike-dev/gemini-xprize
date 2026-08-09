import { generateStructured, modelFor, systemPromptFor } from '@ledgerpilot/ai';
import { AgentType, formatMoney, reminderResultSchema, whatsAppLink } from '@ledgerpilot/shared';
import { withTenant } from '@ledgerpilot/db';
import { reminderEmail, sendEmail } from '@ledgerpilot/notify';
import type { AgentOutcome, AgentRunRow } from './types.js';

/** Public URL a customer can use to view the invoice, when one is available. */
function invoiceUrl(shareToken: string | null | undefined): string | undefined {
  const base = process.env.PUBLIC_WEB_URL;
  if (!base || !shareToken) return undefined;
  return `${base.replace(/\/$/, '')}/i/${shareToken}`;
}

/** Drafts (and optionally sends) a polite reminder for an overdue invoice. */
export async function runPaymentFollowupAgent(run: AgentRunRow): Promise<AgentOutcome> {
  const input = run.inputJson as { invoiceId: string };
  const model = modelFor(AgentType.PAYMENT_FOLLOWUP);

  const ctx = await withTenant(run.tenantId, async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { customer: true },
    });
    const tenant = await tx.tenant.findUnique({
      where: { id: run.tenantId },
      select: { autoSend: true, name: true, currency: true, countryCode: true },
    });
    return { invoice, tenant };
  });

  if (!ctx.invoice) {
    return {
      outputJson: { error: 'invoice_not_found' },
      decision: 'skipped',
      confidence: 1,
      model,
      tokensUsed: 0,
      costEstimate: 0,
      status: 'COMPLETED',
    };
  }

  const invoice = ctx.invoice;
  const due = invoice.dueDate ?? new Date();
  const daysOverdue = Math.max(0, Math.floor((Date.now() - due.getTime()) / 864e5));
  const outstanding = invoice.totalMinor - invoice.paidMinor;

  const result = await generateStructured({
    model,
    system: systemPromptFor(AgentType.PAYMENT_FOLLOWUP),
    user: `Business: ${ctx.tenant?.name}. Customer: ${invoice.customer.name}.
Invoice ${invoice.number}, outstanding ${formatMoney(outstanding, invoice.currency)}, ${daysOverdue} days overdue.
Draft a reminder.`,
    schema: reminderResultSchema,
    mock: () => ({
      channel: (invoice.customer.email ? 'EMAIL' : 'WHATSAPP') as 'EMAIL' | 'WHATSAPP',
      subject: `Reminder: Invoice ${invoice.number}`,
      message: `Dear ${invoice.customer.name}, a gentle reminder that invoice ${invoice.number} for ${formatMoney(outstanding, invoice.currency)} is ${daysOverdue} days overdue. Please let us know if you need anything to settle it. Thank you! - ${ctx.tenant?.name}`,
      tone: (daysOverdue > 30 ? 'FINAL_NOTICE' : daysOverdue > 14 ? 'FIRM' : 'FRIENDLY') as
        | 'FINAL_NOTICE'
        | 'FIRM'
        | 'FRIENDLY',
      confidence: 0.9,
    }),
  });

  // A wa.me link is generated whether or not WHATSAPP was the chosen channel, so
  // the owner can always fall back to it. Sri Lankan SMBs collect on WhatsApp,
  // and a deep link needs no Meta approval and costs nothing per message.
  const waLink = whatsAppLink(
    invoice.customer.phone,
    result.data.message,
    ctx.tenant?.countryCode === 'LK' ? '94' : undefined,
  );

  const autoSend = !!ctx.tenant?.autoSend;
  const canAutoSend = autoSend && !!invoice.customer.email;

  const reminderId = await withTenant(run.tenantId, async (tx) => {
    const reminder = await tx.reminder.create({
      data: {
        tenantId: run.tenantId,
        invoiceId: invoice.id,
        channel: result.data.channel,
        subject: result.data.subject,
        message: result.data.message,
        tone: result.data.tone,
        approved: autoSend,
        sentAt: canAutoSend ? new Date() : null,
      },
    });
    return reminder.id;
  });

  if (canAutoSend && invoice.customer.email) {
    const rendered = reminderEmail({
      businessName: ctx.tenant?.name ?? 'LedgerPilot',
      message: result.data.message,
      invoiceNumber: invoice.number,
      outstandingMinor: outstanding,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      invoiceUrl: invoiceUrl(invoice.shareToken),
    });

    await sendEmail({
      to: invoice.customer.email,
      subject: result.data.subject ?? `Reminder: Invoice ${invoice.number}`,
      text: rendered.text,
      html: rendered.html,
    });
  }

  return {
    outputJson: {
      ...result.data,
      reminderId,
      // Surfaced in the dashboard as a one-tap "Send on WhatsApp" button.
      whatsAppLink: waLink,
      outstandingMinor: outstanding,
      daysOverdue,
    },
    decision: canAutoSend ? 'reminder_sent' : 'reminder_drafted',
    confidence: result.data.confidence,
    model: result.model,
    tokensUsed: result.totalTokens,
    costEstimate: result.costUsd,
    status: canAutoSend ? 'COMPLETED' : 'AWAITING_APPROVAL',
    subjectType: 'invoice',
    subjectId: invoice.id,
  };
}
