import { Injectable, NotFoundException } from '@nestjs/common';
import { lineTotalMinor, sumMinor, type CreateQuote } from '@ledgerpilot/shared';
import type { Prisma } from '@ledgerpilot/db';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

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

  async setStatus(tenantId: string, id: string, status: 'SENT' | 'ACCEPTED' | 'REJECTED') {
    const quote = await this.get(tenantId, id);
    if (!quote) throw new NotFoundException('Quote not found');
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.quote.update({ where: { id }, data: { status } }),
    );
  }

  private async nextNumber(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
    const count = await tx.quote.count();
    return `${prefix}-${1001 + count}`;
  }
}
