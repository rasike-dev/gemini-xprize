import { Injectable, Logger } from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';

/**
 * Server-side Clerk mutations that keep the dashboard in step with our tenant
 * records. Failures are logged but not thrown — the database remains canonical
 * for invoices and quotes.
 */
@Injectable()
export class ClerkAdminService {
  private readonly logger = new Logger(ClerkAdminService.name);
  private readonly client = process.env.CLERK_SECRET_KEY
    ? createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
    : null;

  async syncOrganizationName(clerkOrgId: string, name: string): Promise<void> {
    if (!this.client || !clerkOrgId) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      await this.client.organizations.updateOrganization(clerkOrgId, { name: trimmed });
    } catch (err) {
      this.logger.warn(
        `Failed to sync organization name to Clerk for ${clerkOrgId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
