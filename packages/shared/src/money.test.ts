import { describe, expect, it } from 'vitest';
import { formatMoney, lineTotalMinor, sumMinor } from './money.js';

describe('money helpers', () => {
  it('calculates line totals with tax', () => {
    expect(lineTotalMinor(2, 10000, 18)).toBe(23600);
    expect(lineTotalMinor(3, 5000, 0)).toBe(15000);
  });

  it('sums integer minor amounts', () => {
    expect(sumMinor([100, 200, 300])).toBe(600);
  });

  it('formats minor units as currency', () => {
    expect(formatMoney(12345, 'LKR')).toContain('123.45');
  });
});
