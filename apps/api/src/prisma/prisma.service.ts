import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { prisma, withTenant, Prisma } from '@ledgerpilot/db';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client = prisma;

  async onModuleInit() {
    await prisma.$connect();
  }

  async onModuleDestroy() {
    await prisma.$disconnect();
  }

  /** Run a unit of work with tenant RLS context applied. */
  forTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return withTenant(tenantId, fn);
  }
}
