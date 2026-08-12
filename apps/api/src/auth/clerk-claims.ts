import { UserRole } from '@ledgerpilot/shared';

/** Clerk session JWT v2 nests the active org under `o` instead of top-level `org_id`. */
type ClerkOrgClaim = { id?: string; rol?: string };

/** Read the active Clerk organization id from v1 or v2 session token claims. */
export function clerkOrgIdFromToken(payload: Record<string, unknown>): string {
  const nested = payload.o as ClerkOrgClaim | undefined;
  return String(payload.org_id ?? payload.orgId ?? nested?.id ?? '');
}

/** Map Clerk org role claims to our internal OWNER/STAFF hint. */
export function clerkRoleHintFromToken(payload: Record<string, unknown>): UserRole {
  const nested = payload.o as ClerkOrgClaim | undefined;
  const role = String(payload.org_role ?? nested?.rol ?? '');
  if (role.includes('admin') || payload['role'] === 'OWNER') return UserRole.OWNER;
  return UserRole.STAFF;
}
