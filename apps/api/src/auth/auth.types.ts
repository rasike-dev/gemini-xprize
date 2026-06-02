import type { UserRole } from '@ledgerpilot/shared';

export interface AuthContext {
  tenantId: string;
  clerkOrgId: string;
  clerkUserId: string;
  role: UserRole;
}

declare module 'express' {
  interface Request {
    auth?: AuthContext;
    rawBody?: Buffer;
  }
}
