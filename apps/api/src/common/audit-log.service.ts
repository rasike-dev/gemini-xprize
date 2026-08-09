import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Application audit trail.
 *
 * Writes structured JSON to stdout (picked up by Cloud Logging) and, when the
 * event belongs to a tenant, also persists it so it can be queried later. Log
 * retention is short and not searchable per customer, which is no good for
 * answering "who cancelled this subscription and when".
 *
 * The database write is deliberately fire-and-forget: an audit failure must not
 * fail the customer's request, but it is logged loudly rather than swallowed.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  log(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ ts: new Date().toISOString(), event, ...payload }));

    const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : null;
    if (tenantId) {
      void this.persist(tenantId, event, payload);
    }
  }

  private async persist(tenantId: string, action: string, payload: Record<string, unknown>) {
    const { tenantId: _omit, actor, ...meta } = payload;

    try {
      await this.prisma.forTenant(tenantId, (tx) =>
        tx.auditLog.create({
          data: {
            tenantId,
            action,
            actor: typeof actor === 'string' ? actor : 'system',
            metaJson: meta as object,
          },
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to persist audit event ${action}: ${(err as Error).message}`);
    }
  }

  /** Recent entries for the tenant, newest first. */
  async list(tenantId: string, limit = 100) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
    );
  }
}
