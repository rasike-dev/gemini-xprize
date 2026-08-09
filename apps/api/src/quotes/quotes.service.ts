import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  QuoteStatus,
  lineTotalMinor,
  sumMinor,
  whatsAppLink,
  type CreateQuote,
  type UpdateQuote,
} from '@ledgerpilot/shared';
import { quoteEmail, sendEmail } from '@ledgerpilot/notify';
import type { Prisma } from '@ledgerpilot/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';

/** Only a draft can be edited; a sent or accepted quote is a record of what was agreed. */
const EDITABLE_STATUSES = new Set<string>([QuoteStatus.DRAFT]);

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly entitlements: EntitlementsService,
  ) {}

  list(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.quote.findMany({
        orderBy: { createdAt: 'desc' },
        include: { customer: true, lines: true },
      }),
    );
  }

  get(tenantId: string, id: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.quote.findUnique({ where: { id }, include: { customer: true, lines: true } }),
    );
  }

  async create(tenantId: string, data: CreateQuote) {
    return this.prisma.forTenant(tenantId, (tx) => this.createInTx(tx, tenantId, data));
  }

  /** Shared create used by the controller and the worker's Quote agent. */
  async createInTx(tx: Prisma.TransactionClient, tenantId: string, data: CreateQuote) {
    const lines = data.lines.map((l) => ({
      tenantId,
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      taxRatePct: l.taxRatePct,
      totalMinor: lineTotalMinor(l.quantity, l.unitPriceMinor, l.taxRatePct),
    }));
    const subtotalMinor = sumMinor(lines.map((l) => l.quantity * l.unitPriceMinor));
    const totalMinor = sumMinor(lines.map((l) => l.totalMinor));
    const number = await this.nextNumber(tx, 'Q');

    return tx.quote.create({
      data: {
        tenantId,
        customerId: data.customerId,
        number,
        currency: data.currency,
        notes: data.notes,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        subtotalMinor,
        taxMinor: totalMinor - subtotalMinor,
        totalMinor,
        lines: { create: lines },
      },
      include: { lines: true, customer: true },
    });
  }

  async update(tenantId: string, id: string, data: UpdateQuote, actor: string) {
    const quote = await this.requireQuote(tenantId, id);
    if (!EDITABLE_STATUSES.has(quote.status)) {
      throw new ConflictException(
        `Quote ${quote.number} has already been ${quote.status.toLowerCase()} and can no longer be edited.`,
      );
    }

    const updated = await this.prisma.forTenant(tenantId, async (tx) => {
      // Line items are replaced wholesale, so the totals below always match them.
      if (data.lines) {
        await tx.quoteLine.deleteMany({ where: { quoteId: id } });
      }

      const lines = data.lines?.map((l) => ({
        tenantId,
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        taxRatePct: l.taxRatePct,
        totalMinor: lineTotalMinor(l.quantity, l.unitPriceMinor, l.taxRatePct),
      }));

      const totals = lines
        ? {
            subtotalMinor: sumMinor(lines.map((l) => l.quantity * l.unitPriceMinor)),
            totalMinor: sumMinor(lines.map((l) => l.totalMinor)),
          }
        : null;

      return tx.quote.update({
        where: { id },
        data: {
          ...(data.customerId !== undefined ? { customerId: data.customerId } : {}),
          ...(data.currency !== undefined ? { currency: data.currency } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.validUntil !== undefined
            ? { validUntil: data.validUntil ? new Date(data.validUntil) : null }
            : {}),
          ...(totals
            ? {
                subtotalMinor: totals.subtotalMinor,
                taxMinor: totals.totalMinor - totals.subtotalMinor,
                totalMinor: totals.totalMinor,
              }
            : {}),
          ...(lines ? { lines: { create: lines } } : {}),
        },
        include: { lines: true, customer: true },
      });
    });

    this.audit.log('quote_updated', { tenantId, actor, quoteId: id, fields: Object.keys(data) });
    return updated;
  }

  async remove(tenantId: string, id: string, actor: string) {
    const quote = await this.requireQuote(tenantId, id);
    if (!EDITABLE_STATUSES.has(quote.status)) {
      throw new ConflictException(
        `Quote ${quote.number} has already been ${quote.status.toLowerCase()} and cannot be deleted.`,
      );
    }

    await this.prisma.forTenant(tenantId, (tx) => tx.quote.delete({ where: { id } }));
    this.audit.log('quote_deleted', { tenantId, actor, quoteId: id });
    return { ok: true };
  }

  /**
   * Marks the quote sent and actually delivers it: email when we have an address,
   * otherwise a WhatsApp link for the owner to tap.
   */
  async send(tenantId: string, id: string, actor: string) {
    const quote = await this.requireQuote(tenantId, id);
    const tenant = await this.prisma.forTenant(tenantId, (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, countryCode: true },
      }),
    );

    const businessName = tenant?.name ?? 'LedgerPilot';
    const rendered = quoteEmail({
      businessName,
      customerName: quote.customer.name,
      quoteNumber: quote.number,
      totalMinor: quote.totalMinor,
      currency: quote.currency,
      validUntil: quote.validUntil,
      notes: quote.notes,
    });

    let detail: string;
    let waLink: string | null = null;

    if (quote.customer.email) {
      const result = await sendEmail({
        to: quote.customer.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      detail = result.simulated
        ? `Quote logged but not emailed — RESEND_API_KEY is not configured.`
        : `Quote emailed to ${quote.customer.email}.`;
    } else if (quote.customer.phone) {
      await this.entitlements.assertFeature(tenantId, 'whatsappLinks');
      waLink = whatsAppLink(
        quote.customer.phone,
        rendered.text,
        tenant?.countryCode === 'LK' ? '94' : undefined,
      );
      detail = `${quote.customer.name} has no email address. Open WhatsApp to send it.`;
    } else {
      throw new BadRequestException(
        `${quote.customer.name} has no email address or phone number. Add one before sending.`,
      );
    }

    const updated = await this.prisma.forTenant(tenantId, (tx) =>
      tx.quote.update({
        where: { id },
        data: { status: QuoteStatus.SENT },
        include: { customer: true, lines: true },
      }),
    );

    this.audit.log('quote_sent', { tenantId, actor, quoteId: id, viaEmail: !waLink });
    return { ...updated, detail, whatsAppLink: waLink };
  }

  async setStatus(tenantId: string, id: string, status: 'SENT' | 'ACCEPTED' | 'REJECTED') {
    await this.requireQuote(tenantId, id);
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.quote.update({ where: { id }, data: { status } }),
    );
  }

  private async requireQuote(tenantId: string, id: string) {
    const quote = await this.get(tenantId, id);
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  private async nextNumber(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
    const count = await tx.quote.count();
    return `${prefix}-${1001 + count}`;
  }
}
