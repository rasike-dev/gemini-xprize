import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'bizopsmate-api', ts: new Date().toISOString() };
  }

  @Public()
  @Get('health/deep')
  async deep() {
    const started = Date.now();
    await this.prisma.client.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      service: 'bizopsmate-api',
      db: 'ok',
      latencyMs: Date.now() - started,
      ts: new Date().toISOString(),
    };
  }
}
