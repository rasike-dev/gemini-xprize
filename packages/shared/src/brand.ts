/** Product branding — single source of truth for user-facing copy. */
export const BRAND_NAME = 'BizOpsMate AI';
export const BRAND_SHORT = 'BizOpsMate';
export const BRAND_TAGLINE = 'Finance & ops, on autopilot';

export const BRAND_DOMAIN = 'bizopsmateai.com';
export const BRAND_SITE_URL = `https://${BRAND_DOMAIN}`;
export const BRAND_API_URL = `https://api.${BRAND_DOMAIN}`;

export const BRAND_BILLING_EMAIL = `billing@${BRAND_DOMAIN}`;
export const BRAND_ALERTS_EMAIL = `alerts@${BRAND_DOMAIN}`;
export const BRAND_EMAIL_FROM = `${BRAND_NAME} <${BRAND_BILLING_EMAIL}>`;

/** HMAC-signed intake webhook headers (WhatsApp / email forwarding). */
export const INTAKE_ORG_HEADER = 'x-bizopsmate-org';
export const INTAKE_SIGNATURE_HEADER = 'x-bizopsmate-signature';
