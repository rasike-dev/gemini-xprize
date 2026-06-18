import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface ReportSummary {
  monthLabel: string;
  salesMinor: number;
  collectedMinor: number;
  overdueMinor: number;
  invoiceCount: number;
  pendingInvoiceCount: number;
  bestCustomers: Array<{ name: string; totalMinor: number }>;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async monthlySummary(tenantId: string): Promise<ReportSummary> {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [invoices, payments, grouped] = await Promise.all([
        tx.invoice.findMany({
          where: { createdAt: { gte: startOfMonth } },
          select: {
            id: true,
            customerId: true,
            status: true,
            totalMinor: true,
            paidMinor: true,
          },
        }),
        tx.payment.aggregate({
          _sum: { amountMinor: true },
          where: { paidAt: { gte: startOfMonth } },
        }),
        tx.invoice.groupBy({
          by: ['customerId'],
          where: { createdAt: { gte: startOfMonth } },
          _sum: { totalMinor: true },
          orderBy: { _sum: { totalMinor: 'desc' } },
          take: 5,
        }),
      ]);

      const customerIds = grouped.map((g) => g.customerId);
      const customerNames = customerIds.length
        ? await tx.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, name: true },
          })
        : [];
      const customerMap = new Map(customerNames.map((c) => [c.id, c.name]));

      const salesMinor = invoices.reduce((acc, i) => acc + i.totalMinor, 0);
      const overdueMinor = invoices
        .filter((i) => i.status === 'OVERDUE' || i.status === 'PARTIALLY_PAID')
        .reduce((acc, i) => acc + (i.totalMinor - i.paidMinor), 0);
      const pendingInvoiceCount = invoices.filter(
        (i) => i.status === 'SENT' || i.status === 'OVERDUE' || i.status === 'PARTIALLY_PAID',
      ).length;

      return {
        monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        salesMinor,
        collectedMinor: payments._sum.amountMinor ?? 0,
        overdueMinor,
        invoiceCount: invoices.length,
        pendingInvoiceCount,
        bestCustomers: grouped.map((g) => ({
          name: customerMap.get(g.customerId) ?? g.customerId,
          totalMinor: g._sum.totalMinor ?? 0,
        })),
      };
    });
  }
}
