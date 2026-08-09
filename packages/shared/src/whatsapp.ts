/**
 * WhatsApp deep links (`wa.me`).
 *
 * This is deliberately not the WhatsApp Business API: deep links need no Meta
 * approval, no BSP contract, and no per-message fee. The owner taps a link and
 * WhatsApp opens with the AI-drafted message pre-filled, ready to send from
 * their own number — which is also what their customers expect to receive.
 */

/** Default country used when a number has no international prefix. */
const DEFAULT_COUNTRY_CODE = '94'; // Sri Lanka

/**
 * Normalise a phone number to the digits-only international form wa.me wants
 * (no `+`, no spaces, no leading zero). Returns null when there is nothing
 * usable to dial.
 *
 * Handles the three shapes SMBs actually store:
 *   +94 77 123 4567  ->  94771234567
 *   0771234567       ->  94771234567
 *   771234567        ->  94771234567
 */
export function normalisePhoneForWhatsApp(
  phone: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!phone) return null;

  const hadPlus = phone.trim().startsWith('+');
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;

  // Already international, either explicitly (+) or by carrying the country code.
  if (hadPlus) return digits;
  if (digits.startsWith(countryCode) && digits.length > countryCode.length + 6) return digits;

  // Local formats: strip a single trunk zero, then prepend the country code.
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  return `${countryCode}${local}`;
}

/**
 * Build a wa.me link that opens a chat with the message pre-filled.
 * Returns null when the number cannot be dialled.
 */
export function whatsAppLink(
  phone: string | null | undefined,
  message: string,
  countryCode?: string,
): string | null {
  const number = normalisePhoneForWhatsApp(phone, countryCode);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
