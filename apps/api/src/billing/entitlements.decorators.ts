import { SetMetadata } from '@nestjs/common';
import type { PlanFeatures } from '@ledgerpilot/shared';

/**
 * Opt a route out of the subscription check. Needed for the billing endpoints
 * themselves — a customer whose plan has lapsed must still be able to pay us —
 * and for webhooks, which have no tenant context of their own.
 */
export const ALLOW_INACTIVE_KEY = 'allowInactive';
export const AllowInactive = () => SetMetadata(ALLOW_INACTIVE_KEY, true);

/** Require a specific plan feature, regardless of HTTP method. */
export const REQUIRES_FEATURE_KEY = 'requiresFeature';
export const RequiresFeature = (feature: keyof PlanFeatures) =>
  SetMetadata(REQUIRES_FEATURE_KEY, feature);
