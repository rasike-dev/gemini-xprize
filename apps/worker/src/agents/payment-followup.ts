import { generateStructured, modelFor, systemPromptFor } from '@ledgerpilot/ai';
import { AgentType, formatMoney, reminderResultSchema } from '@ledgerpilot/shared';
import { withTenant } from '@ledgerpilot/db';
import type { AgentOutcome, AgentRunRow } from './types.js';
import { sendEmail } from '../notify.js';

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
      select: { autoSend: true, name: true, currency: true },
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

  const due = ctx.invoice.dueDate ?? new Date();
  const daysOverdue = Math.max(0, Math.floor((Date.now() - due.getTime()) / 864e5));
  const outstanding = ctx.invoice.totalMinor - ctx.invoice.paidMinor;

  const result = await generateStructured({
    model,
    system: systemPromptFor(AgentType.PAYMENT_FOLLOWUP),
    user: `Business: ${ctx.tenant?.name}. Customer: ${ctx.invoice.customer.name}.
Invoice ${ctx.invoice.number}, outstanding ${formatMoney(outstanding, ctx.invoice.currency)}, ${daysOverdue} days overdue.
Draft a reminder.`,
    schema: reminderResultSchema,
    mock: () => ({
      channel: (ctx.invoice!.customer.email ? 'EMAIL' : 'WHATSAPP') as 'EMAIL' | 'WHATSAPP',
      subject: `Reminder: Invoice ${ctx.invoice!.number}`,
      message: `Dear ${ctx.invoice!.customer.name}, a gentle reminder that invoice ${ctx.invoice!.number} for ${formatMoney(outstanding, ctx.invoice!.currency)} is ${daysOverdue} days overdue. Please let us know if you need anything to settle it. Thank you! - ${ctx.tenant?.name}`,
      tone: (daysOverdue > 30 ? 'FINAL_NOTICE' : daysOverdue > 14 ? 'FIRM' : 'FRIENDLY') as
        | 'FINAL_NOTICE'
        | 'FIRM'
        | 'FRIENDLY',
      confidence: 0.9,
    }),
  });

  const autoSend = !!ctx.tenant?.autoSend;
  const reminderId = await withTenant(run.tenantId, async (tx) => {
    const reminder = await tx.reminder.create({
      data: {
        tenantId: run.tenantId,
        invoiceId: ctx.invoice!.id,
        channel: result.data.channel,
        subject: result.data.subject,
        message: result.data.message,
        tone: result.data.tone,
        approved: autoSend,
        sentAt: autoSend ? new Date() : null,
      },
    });
    return reminder.id;
  });

  if (autoSend && ctx.invoice.customer.email) {
    await sendEmail({
      to: ctx.invoice.customer.email,
      subject: result.data.subject ?? `Reminder: Invoice ${ctx.invoice.number}`,
      text: result.data.message,
    });
  }

  return {
    outputJson: { ...result.data, reminderId },
    decision: autoSend ? 'reminder_sent' : 'reminder_drafted',
    confidence: result.data.confidence,
    model: result.model,
    tokensUsed: result.totalTokens,
    costEstimate: result.costUsd,
    status: autoSend ? 'COMPLETED' : 'AWAITING_APPROVAL',
    subjectType: 'invoice',
    subjectId: ctx.invoice.id,
  };
}
