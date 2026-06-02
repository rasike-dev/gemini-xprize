import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [invoices, paymentsThisMonth, paymentsToday, agentRuns, customerCount] =
        await Promise.all([
          tx.invoice.findMany({ select: { status: true, totalMinor: true, paidMinor: true } }),
          tx.payment.aggregate({
            _sum: { amountMinor: true },
            where: { paidAt: { gte: startOfMonth } },
          }),
          tx.payment.aggregate({
            _sum: { amountMinor: true },
            where: { paidAt: { gte: startOfDay } },
          }),
          tx.agentRun.count({ where: { createdAt: { gte: startOfMonth } } }),
          tx.customer.count(),
        ]);

      const overdueMinor = invoices
        .filter((i) => i.status === 'OVERDUE' || i.status === 'PARTIALLY_PAID')
        .reduce((acc, i) => acc + (i.totalMinor - i.paidMinor), 0);
      const pendingCount = invoices.filter(
        (i) => i.status === 'SENT' || i.status === 'OVERDUE' || i.status === 'PARTIALLY_PAID',
      ).length;
      const revenueThisMonthMinor = paymentsThisMonth._sum.amountMinor ?? 0;
      const salesTodayMinor = paymentsToday._sum.amountMinor ?? 0;

      return {
        salesTodayMinor,
        revenueThisMonthMinor,
        overdueMinor,
        pendingInvoices: pendingCount,
        aiActionsThisMonth: agentRuns,
        customerCount,
      };
    });
  }
}
