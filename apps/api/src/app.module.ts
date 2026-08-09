import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueueModule } from './queue/queue.module.js';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { HealthController } from './health/health.controller.js';
import { TenantModule } from './tenant/tenant.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { QuotesModule } from './quotes/quotes.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { AgentRunsModule } from './agent-runs/agent-runs.module.js';
import { RemindersModule } from './reminders/reminders.module.js';
import { IntakeModule } from './intake/intake.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { BillingModule } from './billing/billing.module.js';
import { EntitlementsGuard } from './billing/entitlements.guard.js';
import { ClerkModule } from './clerk/clerk.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { AuditLogModule } from './common/audit-log.module.js';
import { SentryExceptionFilter } from './common/sentry-exception.filter.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuditLogModule,
    PrismaModule,
    QueueModule,
    TenantModule,
    BillingModule,
    CustomersModule,
    InvoicesModule,
    QuotesModule,
    RemindersModule,
    AgentRunsModule,
    IntakeModule,
    DashboardModule,
    ReportsModule,
    ClerkModule,
  ],
  providers: [
    // Global guards run in the order registered here, and the order matters:
    // authenticate, then check the role, then check the subscription. Registering
    // them in one place keeps that sequence explicit rather than dependent on
    // module import order.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ClerkAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: EntitlementsGuard },
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
  ],
  controllers: [HealthController],
})
export class AppModule {}
