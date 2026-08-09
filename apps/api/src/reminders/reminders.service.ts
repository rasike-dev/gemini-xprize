import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { whatsAppLink } from '@ledgerpilot/shared';
import { reminderEmail, sendEmail } from '@ledgerpilot/notify';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';

export interface DispatchResult {
  /** True when the message actually left the building. */
  sent: boolean;
  channel: 'EMAIL' | 'WHATSAPP' | 'NONE';
  /** Present when the owner must complete the send themselves in WhatsApp. */
  whatsAppLink?: string;
  detail: string;
}

/**
 * Sends the reminders the AI drafted.
 *
 * Email is sent server-side. WhatsApp is handed back as a `wa.me` deep link for
 * the owner to tap, which is deliberate: messages arrive from their own number,
 * which is what their customers recognise, and it avoids the Meta Business API
 * approval process and per-message fees entirely.
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Newest first, so the reminders still waiting on the owner are at the top. */
  list(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.reminder.findMany({
        orderBy: [{ sentAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: 100,
        include: { invoice: { include: { customer: true } } },
      }),
    );
  }

  async dispatch(tenantId: string, reminderId: string, actor: string): Promise<DispatchResult> {
    const context = await this.prisma.forTenant(tenantId, async (tx) => {
      const reminder = await tx.reminder.findUnique({
        where: { id: reminderId },
        include: { invoice: { include: { customer: true } } },
      });
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, countryCode: true },
      });
      return { reminder, tenant };
    });

    const { reminder, tenant } = context;
    if (!reminder) throw new NotFoundException('Reminder not found');

    if (reminder.sentAt) {
      return {
        sent: true,
        channel: reminder.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL',
        detail: 'This reminder had already been sent.',
      };
    }

    const invoice = reminder.invoice;
    const customer = invoice.customer;
    const outstanding = invoice.totalMinor - invoice.paidMinor;
    const businessName = tenant?.name ?? 'LedgerPilot';

    // Prefer email when we can send it ourselves; the owner does not have to do
    // anything for it to arrive.
    if (customer.email) {
      const rendered = reminderEmail({
        businessName,
        message: reminder.message,
        invoiceNumber: invoice.number,
        outstandingMinor: outstanding,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        invoiceUrl: this.invoiceUrl(invoice.shareToken),
      });

      const result = await sendEmail({
        to: customer.email,
        subject: reminder.subject ?? `Reminder: Invoice ${invoice.number}`,
        text: rendered.text,
        html: rendered.html,
      });

      await this.markSent(tenantId, reminderId);
      this.audit.log('reminder_sent', {
        tenantId,
        actor,
        reminderId,
        invoiceId: invoice.id,
        channel: 'EMAIL',
        simulated: result.simulated,
      });

      return {
        sent: true,
        channel: 'EMAIL',
        detail: result.simulated
          ? `Email to ${customer.email} was logged but not sent — RESEND_API_KEY is not configured.`
          : `Reminder emailed to ${customer.email}.`,
      };
    }

    // No email address: fall back to a WhatsApp link the owner taps.
    const link = await this.whatsAppFor(tenantId, customer.phone, reminder.message, tenant?.countryCode);
    if (link) {
      // Approved but not yet delivered: sentAt stays null until we know it went.
      await this.prisma.forTenant(tenantId, (tx) =>
        tx.reminder.update({ where: { id: reminderId }, data: { approved: true } }),
      );

      this.audit.log('reminder_whatsapp_prepared', {
        tenantId,
        actor,
        reminderId,
        invoiceId: invoice.id,
      });

      return {
        sent: false,
        channel: 'WHATSAPP',
        whatsAppLink: link,
        detail: `${customer.name} has no email address. Open WhatsApp to send it.`,
      };
    }

    this.logger.warn(`Reminder ${reminderId} has no deliverable channel`);
    return {
      sent: false,
      channel: 'NONE',
      detail: `${customer.name} has no email address or phone number. Add one to send this reminder.`,
    };
  }

  /** The wa.me link for a reminder, for the dashboard's WhatsApp button. */
  async whatsAppLinkFor(tenantId: string, reminderId: string): Promise<{ url: string | null }> {
    const context = await this.prisma.forTenant(tenantId, async (tx) => {
      const reminder = await tx.reminder.findUnique({
        where: { id: reminderId },
        include: { invoice: { include: { customer: true } } },
      });
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { countryCode: true },
      });
      return { reminder, tenant };
    });

    if (!context.reminder) throw new NotFoundException('Reminder not found');

    const url = await this.whatsAppFor(
      tenantId,
      context.reminder.invoice.customer.phone,
      context.reminder.message,
      context.tenant?.countryCode,
    );
    return { url };
  }

  async markSent(tenantId: string, reminderId: string): Promise<void> {
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.reminder.update({
        where: { id: reminderId },
        data: { approved: true, sentAt: new Date() },
      }),
    );
  }

  private async whatsAppFor(
    tenantId: string,
    phone: string | null,
    message: string,
    countryCode?: string,
  ): Promise<string | null> {
    if (!phone) return null;
    // WhatsApp sending is a Growth feature, so check before handing out a link.
    await this.entitlements.assertFeature(tenantId, 'whatsappLinks');
    return whatsAppLink(phone, message, countryCode === 'LK' ? '94' : undefined);
  }

  private invoiceUrl(shareToken: string | null | undefined): string | undefined {
    const base = process.env.PUBLIC_WEB_URL;
    if (!base || !shareToken) return undefined;
    return `${base.replace(/\/$/, '')}/i/${shareToken}`;
  }
}
