import { describe, expect, it } from 'vitest';
import { resolveLpTargetPath } from './_proxy';

describe('resolveLpTargetPath', () => {
  it('allows dashboard resources', () => {
    expect(resolveLpTargetPath(['customers'])).toBe('/customers');
    expect(resolveLpTargetPath(['quotes', 'q1', 'send'])).toBe('/quotes/q1/send');
    expect(resolveLpTargetPath(['reports', 'export'], '?format=csv')).toBe('/reports/export?format=csv');
  });

  it('blocks webhooks, intake, and unknown resources', () => {
    expect(resolveLpTargetPath(['intake'])).toBeNull();
    expect(resolveLpTargetPath(['webhooks', 'payhere'])).toBeNull();
    expect(resolveLpTargetPath(['dashboard'])).toBeNull();
    expect(resolveLpTargetPath([])).toBeNull();
  });

  it('blocks path traversal segments', () => {
    expect(resolveLpTargetPath(['customers', '..', 'tenant'])).toBeNull();
    expect(resolveLpTargetPath(['customers', 'foo/bar'])).toBeNull();
  });
});
