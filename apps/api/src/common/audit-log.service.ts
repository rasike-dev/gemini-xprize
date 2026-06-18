import { Injectable, Logger } from '@nestjs/common';

/**
 * Lightweight application audit logger. For hackathon scope we log structured
 * JSON to stdout so entries are captured by Cloud Logging and can be exported.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('Audit');

  log(event: string, payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...payload,
      }),
    );
  }
}
