import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCustomer, UpdateCustomer } from '@ledgerpilot/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditLogService,
  ) {}

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

  async create(tenantId: string, data: CreateCustomer, actor: string) {
    // Plan limit is checked here rather than in the guard because it depends on
    // how many customers already exist.
    await this.entitlements.assertCanAddCustomer(tenantId);

    const customer = await this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.create({ data: { tenantId, ...data } }),
    );

    this.audit.log('customer_created', { tenantId, actor, customerId: customer.id });
    return customer;
  }

  async update(tenantId: string, id: string, data: UpdateCustomer, actor: string) {
    await this.requireCustomer(tenantId, id);

    const customer = await this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.update({ where: { id }, data }),
    );

    this.audit.log('customer_updated', {
      tenantId,
      actor,
      customerId: id,
      fields: Object.keys(data),
    });
    return customer;
  }

  async remove(tenantId: string, id: string, actor: string) {
    const customer = await this.requireCustomer(tenantId, id);

    // Deleting a customer with financial history would orphan invoices and
    // quotes, so refuse rather than cascade away the records.
    const { invoices, quotes } = await this.prisma.forTenant(tenantId, async (tx) => ({
      invoices: await tx.invoice.count({ where: { customerId: id } }),
      quotes: await tx.quote.count({ where: { customerId: id } }),
    }));

    if (invoices > 0 || quotes > 0) {
      throw new ConflictException(
        `${customer.name} has ${invoices} invoice(s) and ${quotes} quote(s) and cannot be deleted. Their history is part of your records.`,
      );
    }

    await this.prisma.forTenant(tenantId, (tx) => tx.customer.delete({ where: { id } }));
    this.audit.log('customer_deleted', { tenantId, actor, customerId: id });
    return { ok: true };
  }

  private async requireCustomer(tenantId: string, id: string) {
    const customer = await this.prisma.forTenant(tenantId, (tx) =>
      tx.customer.findUnique({ where: { id } }),
    );
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
}
