import { createHmac } from 'node:crypto';

/**
 * Per-tenant intake secret, derived from one master secret.
 *
 * A single shared secret would be a real multi-tenancy hole: because the intake
 * webhook takes the target organization from a request header, anyone holding
 * that one secret could post inquiries into any tenant. Deriving per tenant means
 * a leaked secret only exposes the tenant it belongs to, and rotating the master
 * rotates every tenant at once. Nothing extra is stored.
 */
export function deriveIntakeSecret(tenantId: string): string {
  const master = process.env.INTAKE_HMAC_SECRET;
  if (!master) throw new Error('INTAKE_HMAC_SECRET is not configured');
  return createHmac('sha256', master).update(`intake:${tenantId}`).digest('hex');
}
