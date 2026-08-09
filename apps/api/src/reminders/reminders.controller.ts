import { Controller, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@ledgerpilot/shared';
import { Auth, Roles, TenantId } from '../auth/decorators.js';
import type { AuthContext } from '../auth/auth.types.js';
import { RemindersService } from './reminders.service.js';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.reminders.list(tenantId);
  }

  /**
   * Sends by email, or returns a WhatsApp link for the owner to complete.
   *
   * Owner-only: chasing a customer for money is the owner's decision, and once the
   * message has gone it cannot be recalled.
   */
  @Roles(UserRole.OWNER)
  @Post(':id/send')
  send(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.reminders.dispatch(auth.tenantId, id, auth.clerkUserId);
  }

  @Get(':id/whatsapp-link')
  whatsAppLink(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.reminders.whatsAppLinkFor(auth.tenantId, id);
  }

  /** Confirms the owner completed a WhatsApp send, so it stops being chased. */
  @Roles(UserRole.OWNER)
  @Post(':id/mark-sent')
  async markSent(@Auth() auth: AuthContext, @Param('id') id: string) {
    await this.reminders.markSent(auth.tenantId, id);
    return { ok: true };
  }
}
