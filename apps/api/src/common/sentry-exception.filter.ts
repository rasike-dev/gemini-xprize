import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

/**
 * Reports unexpected failures to Sentry and returns a consistent JSON error body.
 *
 * Sentry was previously initialised but never given anything to report, so
 * server errors only appeared in logs. Handled 4xx responses (including the 402
 * the entitlement guard raises) are expected control flow and are not reported.
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.path} failed: ${(exception as Error)?.message ?? 'unknown'}`,
        (exception as Error)?.stack,
      );
      Sentry.withScope((scope) => {
        scope.setTag('path', req.path);
        scope.setTag('method', req.method);
        if (req.auth?.tenantId) scope.setTag('tenantId', req.auth.tenantId);
        Sentry.captureException(exception);
      });
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    // Never leak internals of an unexpected failure to the caller.
    res.status(status).json({
      statusCode: status,
      message: 'Internal server error',
    });
  }
}
