import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module.js';
import { assertAuthConfigIsSafe } from './auth/clerk-auth.guard.js';
import { assertAiConfigIsSafe, assertBillingConfigIsSafe } from './common/startup-checks.js';

/**
 * Allowed browser origins. Reflecting any origin was fine for a demo but is not
 * acceptable once sessions carry real customer data, so production requires an
 * explicit list.
 */
function corsOrigins(): string[] | boolean {
  const configured = process.env.CORS_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured?.length) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS must list the allowed web origins in production.');
  }
  return true;
}

async function bootstrap() {
  // Refuse to start in a configuration that would be unsafe or silently wrong.
  assertAuthConfigIsSafe();
  assertAiConfigIsSafe();
  assertBillingConfigIsSafe();

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: false });

  // Cloud Run terminates TLS and forwards, so without this every request appears
  // to come from the load balancer and the rate limiter would throttle all
  // tenants against a single shared bucket.
  app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  // Capture raw body only on webhook routes that verify a signature over it.
  // Paths include the global 'api' prefix since this middleware runs pre-routing.
  app.use(
    ['/api/webhooks/stripe', '/api/webhooks/clerk', '/api/intake'],
    express.json({
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );
  // PayHere posts application/x-www-form-urlencoded, not JSON.
  app.use('/api/webhooks/payhere', express.urlencoded({ extended: false }));
  app.use(express.json({ limit: '1mb' }));

  app.enableCors({ origin: corsOrigins(), credentials: true });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on('finish', () => {
      Logger.log(
        JSON.stringify({
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Date.now() - started,
        }),
        'Request',
      );
    });
    next();
  });

  // Validation is handled per-route via ZodPipe (zod schemas in @ledgerpilot/shared).
  app.setGlobalPrefix('api', { exclude: ['health'] });

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, '0.0.0.0');
  Logger.log(`BizOpsMate API listening on :${port}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error(`Failed to start: ${(err as Error).message}`, undefined, 'Bootstrap');
  process.exit(1);
});
