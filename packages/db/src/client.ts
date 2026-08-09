import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const logLevels: Prisma.LogLevel[] =
  process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'];

/**
 * The API and worker connect as `ledgerpilot_app`, the role RLS is actually
 * enforced against. `DATABASE_URL` is the owner connection and exists for
 * migrations and seeding, so the restricted URL wins whenever it is set.
 *
 * This matters more than it looks: Cloud Run injects only DATABASE_APP_URL, and
 * Prisma reads DATABASE_URL by default, so without this the services would have
 * no connection string at all in production.
 */
function runtimeDatabaseUrl(): string | undefined {
  return process.env.DATABASE_APP_URL;
}

function createClient(url: string | undefined): PrismaClient {
  // Fall through to the schema's env("DATABASE_URL") when no override is given,
  // rather than handing Prisma an undefined url.
  return url
    ? new PrismaClient({ log: logLevels, datasources: { db: { url } } })
    : new PrismaClient({ log: logLevels });
}

export const prisma = globalForPrisma.prisma ?? createClient(runtimeDatabaseUrl());

/**
 * A client on the owner connection, which bypasses RLS. Only for migrations and
 * seeding; never use it to serve a request.
 */
export function createOwnerClient(): PrismaClient {
  return createClient(process.env.DATABASE_URL);
}

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
