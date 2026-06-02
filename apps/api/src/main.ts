import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import express from 'express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Preserve the raw body for webhook signature verification (Stripe/Clerk).
    rawBody: false,
  });

  // Capture raw body only on webhook routes for HMAC/signature checks.
  // Paths include the global 'api' prefix since this middleware runs pre-routing.
  app.use(
    ['/api/webhooks/stripe', '/api/webhooks/clerk', '/api/intake'],
    express.json({
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.enableCors({ origin: true, credentials: true });
  // Validation is handled per-route via ZodPipe (zod schemas in @ledgerpilot/shared).
  app.setGlobalPrefix('api', { exclude: ['health'] });

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, '0.0.0.0');
  Logger.log(`LedgerPilot API listening on :${port}`, 'Bootstrap');
}

bootstrap();
