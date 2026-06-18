import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { CustomersModule } from './customers/customers.module.js';
import { QuotesModule } from './quotes/quotes.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { AgentRunsModule } from './agent-runs/agent-runs.module.js';
import { IntakeModule } from './intake/intake.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { BillingModule } from './billing/billing.module.js';
import { ClerkModule } from './clerk/clerk.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditLogService } from './common/audit-log.service.js';
import { AuditLogModule } from './common/audit-log.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    AuditLogModule,
    PrismaModule,
    QueueModule,
    AuthModule,
    CustomersModule,
    InvoicesModule,
    QuotesModule,
    AgentRunsModule,
    IntakeModule,
    DashboardModule,
    ReportsModule,
    BillingModule,
    ClerkModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, AuditLogService],
  controllers: [HealthController],
})
export class AppModule {}
