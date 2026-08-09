/**
 * Business identity shown in the footer and legal pages.
 *
 * PayHere rejects merchant applications whose site does not display the trading
 * name, phone, email, and postal address, so these are required for launch, not
 * cosmetic. Defaults are obvious placeholders so an unconfigured deploy is
 * visibly wrong rather than quietly wrong.
 */

export const business = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME ?? '[Set NEXT_PUBLIC_BUSINESS_NAME]',
  email: process.env.NEXT_PUBLIC_BUSINESS_EMAIL ?? '[Set NEXT_PUBLIC_BUSINESS_EMAIL]',
  phone: process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? '[Set NEXT_PUBLIC_BUSINESS_PHONE]',
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS ?? '[Set NEXT_PUBLIC_BUSINESS_ADDRESS]',
  registrationNo: process.env.NEXT_PUBLIC_BUSINESS_REG_NO ?? '',
  /** Public origin, used for canonical links in legal copy. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
} as const;

/** Rendered as the "last updated" date on legal pages. */
export const LEGAL_LAST_UPDATED = process.env.NEXT_PUBLIC_LEGAL_UPDATED ?? '25 July 2026';
