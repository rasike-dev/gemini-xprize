import { Injectable } from '@nestjs/common';
import type { CreateCustomer } from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  get(tenantId: string, id: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.findUnique({
        where: { id },
        include: { invoices: true, quotes: true },
      }),
    );
  }

  create(tenantId: string, data: CreateCustomer) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.create({ data: { tenantId, ...data } }),
    );
  }
}
