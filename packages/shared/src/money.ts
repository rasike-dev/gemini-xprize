/** Money helpers. All amounts are integer minor units (e.g. cents). */

export function formatMoney(minor: number, currency = 'LKR'): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export function lineTotalMinor(quantity: number, unitPriceMinor: number, taxRatePct = 0): number {
  const base = quantity * unitPriceMinor;
  const withTax = base * (1 + taxRatePct / 100);
  return Math.round(withTax);
}

export function sumMinor(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
