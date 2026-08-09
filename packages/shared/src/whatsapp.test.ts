import { describe, expect, it } from 'vitest';
import { normalisePhoneForWhatsApp, whatsAppLink } from './whatsapp.js';

describe('normalisePhoneForWhatsApp', () => {
  it.each([
    ['+94 77 123 4567', '94771234567'],
    ['+94771234567', '94771234567'],
    ['0771234567', '94771234567'],
    ['077 123 4567', '94771234567'],
    ['771234567', '94771234567'],
    ['94771234567', '94771234567'],
    ['(077) 123-4567', '94771234567'],
  ])('turns %s into %s', (input, expected) => {
    expect(normalisePhoneForWhatsApp(input)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['   '], ['12345'], ['n/a']])(
    'returns null for %s, which cannot be dialled',
    (input) => {
      expect(normalisePhoneForWhatsApp(input)).toBeNull();
    },
  );

  it('respects a different country code for non-Sri Lankan tenants', () => {
    expect(normalisePhoneForWhatsApp('0412345678', '61')).toBe('61412345678');
  });

  it('keeps an explicit + prefix intact even when it is another country', () => {
    expect(normalisePhoneForWhatsApp('+447700900123')).toBe('447700900123');
  });
});

describe('whatsAppLink', () => {
  it('url-encodes the message so newlines and symbols survive', () => {
    const link = whatsAppLink('0771234567', 'Invoice INV-1001 — LKR 25,000 is overdue.\nThanks!');

    expect(link).toBe(
      'https://wa.me/94771234567?text=Invoice%20INV-1001%20%E2%80%94%20LKR%2025%2C000%20is%20overdue.%0AThanks!',
    );
  });

  it('returns null rather than a broken link when there is no phone number', () => {
    expect(whatsAppLink(null, 'anything')).toBeNull();
  });
});
