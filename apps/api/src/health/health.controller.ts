import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators.js';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'ledgerpilot-api', ts: new Date().toISOString() };
  }
}
