import { describe, expect, it } from 'vitest';
import { UserRole } from '@ledgerpilot/shared';
import { clerkOrgIdFromToken, clerkRoleHintFromToken } from '../src/auth/clerk-claims.js';

describe('clerk-claims', () => {
  it('reads org_id from legacy session tokens', () => {
    expect(clerkOrgIdFromToken({ org_id: 'org_legacy' })).toBe('org_legacy');
  });

  it('reads org id from JWT v2 nested o claim', () => {
    expect(clerkOrgIdFromToken({ o: { id: 'org_v2', rol: 'admin' } })).toBe('org_v2');
  });

  it('prefers legacy org_id when both formats are present', () => {
    expect(clerkOrgIdFromToken({ org_id: 'org_legacy', o: { id: 'org_v2' } })).toBe('org_legacy');
  });

  it('maps admin org roles to OWNER', () => {
    expect(clerkRoleHintFromToken({ org_role: 'org:admin' })).toBe(UserRole.OWNER);
    expect(clerkRoleHintFromToken({ o: { rol: 'admin' } })).toBe(UserRole.OWNER);
  });
});
