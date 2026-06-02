import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Run a unit of work scoped to a tenant. Opens an interactive transaction and
 * sets `app.tenant_id` (transaction-local) so Postgres RLS filters every query.
 *
 * IMPORTANT: this only enforces isolation when connected as a non-BYPASSRLS role
 * (ledgerpilot_app). The migration/superuser connection bypasses RLS by design.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // set_config(..., true) => transaction-local, auto-reset at commit/rollback.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

export * from '@prisma/client';
export type { Prisma };
