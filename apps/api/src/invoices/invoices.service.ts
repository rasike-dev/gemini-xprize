import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@ledgerpilot/db';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

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

  async recordPayment(tenantId: string, invoiceId: string, amountMinor: number, method = 'manual') {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw new NotFoundException('Invoice not found');
      await tx.payment.create({ data: { tenantId, invoiceId, amountMinor, method } });
      const paidMinor = invoice.paidMinor + amountMinor;
      const status = paidMinor >= invoice.totalMinor ? 'PAID' : 'PARTIALLY_PAID';
      return tx.invoice.update({ where: { id: invoiceId }, data: { paidMinor, status } });
    });
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
