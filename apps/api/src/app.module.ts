import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    AuthModule,
    CustomersModule,
    InvoicesModule,
    QuotesModule,
    AgentRunsModule,
    IntakeModule,
    DashboardModule,
    BillingModule,
    ClerkModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
