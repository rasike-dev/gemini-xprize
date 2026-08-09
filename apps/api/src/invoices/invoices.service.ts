import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  lineTotalMinor,
  sumMinor,
  type CreateInvoice,
} from '@ledgerpilot/shared';
import type { Prisma } from '@ledgerpilot/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  list(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        include: { customer: true, lines: true, payments: true },
      }),
    );
  }

  get(tenantId: string, id: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.invoice.findUnique({
        where: { id },
        include: { customer: true, lines: true, payments: true, reminders: true },
      }),
    );
  }

  /** Public (unauthenticated) lookup by share token for the customer's view. */
  getByShareToken(shareToken: string) {
    // No tenant context: share token is an unguessable per-invoice secret.
    return this.prisma.client.invoice.findUnique({
      where: { shareToken },
      include: { customer: true, lines: true },
    });
  }

  async createFromQuote(tenantId: string, quoteId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const quote = await tx.quote.findUnique({ where: { id: quoteId }, include: { lines: true } });
      if (!quote) throw new NotFoundException('Quote not found');
      const existingInvoice = await tx.invoice.findUnique({ where: { quoteId } });
      if (existingInvoice) {
        throw new BadRequestException('Quote already invoiced');
      }
      const number = await this.nextNumber(tx, 'INV');
      const dueDate = new Date(Date.now() + 14 * 864e5);

      return tx.invoice.create({
        data: {
          tenantId,
          customerId: quote.customerId,
          quoteId: quote.id,
          number,
          status: 'SENT',
          currency: quote.currency,
          subtotalMinor: quote.subtotalMinor,
          taxMinor: quote.taxMinor,
          totalMinor: quote.totalMinor,
          dueDate,
          notes: quote.notes,
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
        include: { lines: true, customer: true },
      });
    });
  }

  /** Raise an invoice directly, without a preceding quote. */
  async create(tenantId: string, data: CreateInvoice, actor: string) {
    const invoice = await this.prisma.forTenant(tenantId, async (tx) => {
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

      return tx.invoice.create({
        data: {
          tenantId,
          customerId: data.customerId,
          number: await this.nextNumber(tx, 'INV'),
          status: InvoiceStatus.DRAFT,
          currency: data.currency,
          subtotalMinor,
          taxMinor: totalMinor - subtotalMinor,
          totalMinor,
          dueDate: data.dueDate ? new Date(data.dueDate) : new Date(Date.now() + 14 * 864e5),
          notes: data.notes,
          lines: { create: lines },
        },
        include: { lines: true, customer: true },
      });
    });

    this.audit.log('invoice_created', { tenantId, actor, invoiceId: invoice.id });
    return invoice;
  }

  async recordPayment(
    tenantId: string,
    invoiceId: string,
    amountMinor: number,
    method = 'manual',
    actor = 'system',
    reference?: string,
  ) {
    const invoice = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!existing) throw new NotFoundException('Invoice not found');

      if (existing.status === InvoiceStatus.VOID) {
        throw new ConflictException('This invoice has been voided.');
      }

      const outstanding = existing.totalMinor - existing.paidMinor;
      // Overpayment is almost always a typo, and silently accepting it corrupts
      // the customer's books.
      if (amountMinor > outstanding) {
        throw new BadRequestException(
          `That is more than the ${(outstanding / 100).toFixed(2)} still outstanding on this invoice.`,
        );
      }

      await tx.payment.create({
        data: { tenantId, invoiceId, amountMinor, method, reference },
      });

      const paidMinor = existing.paidMinor + amountMinor;
      const status = paidMinor >= existing.totalMinor ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
      return tx.invoice.update({
        where: { id: invoiceId },
        data: { paidMinor, status },
        include: { customer: true, payments: true },
      });
    });

    this.audit.log('payment_recorded', {
      tenantId,
      actor,
      invoiceId,
      amountMinor,
      method,
      status: invoice.status,
    });
    return invoice;
  }

  /** Voids an unpaid invoice. Paid invoices stay as they are: they are a record. */
  async voidInvoice(tenantId: string, invoiceId: string, actor: string) {
    const invoice = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!existing) throw new NotFoundException('Invoice not found');
      if (existing.paidMinor > 0) {
        throw new ConflictException(
          'This invoice has payments against it and cannot be voided. Issue a credit note instead.',
        );
      }
      return tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.VOID },
      });
    });

    this.audit.log('invoice_voided', { tenantId, actor, invoiceId });
    return invoice;
  }

  async setPdfUrl(tenantId: string, invoiceId: string, pdfUrl: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.invoice.update({ where: { id: invoiceId }, data: { pdfUrl } }),
    );
  }

  private async nextNumber(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
    const count = await tx.invoice.count();
    return `${prefix}-${1001 + count}`;
  }
}
