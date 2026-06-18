import { describe, expect, it } from 'vitest';
import {
  complianceResultSchema,
  inquiryResultSchema,
  quoteResultSchema,
  supportResultSchema,
} from './agent-contracts.js';

describe('agent contracts', () => {
  it('accepts valid inquiry result payload', () => {
    const parsed = inquiryResultSchema.parse({
      intent: 'QUOTE_REQUEST',
      customerName: 'Acme',
      customerContact: '+94770000001',
      summary: 'Need quote for 20 t-shirts',
      confidence: 0.9,
    });
    expect(parsed.intent).toBe('QUOTE_REQUEST');
  });

  it('rejects malformed quote lines', () => {
    expect(() =>
      quoteResultSchema.parse({
        currency: 'LKR',
        lines: [],
        notes: null,
        assumptions: [],
        confidence: 0.8,
      }),
    ).toThrow();
  });

  it('parses compliance payload', () => {
    const parsed = complianceResultSchema.parse({
      ready: false,
      missingFields: ['supplier VAT/TIN'],
      warnings: ['Missing VAT number'],
      confidence: 0.7,
    });
    expect(parsed.ready).toBe(false);
  });

  it('parses support payload', () => {
    const parsed = supportResultSchema.parse({
      response: 'Invoice INV-1001 is paid.',
      suggestedAction: null,
      confidence: 0.88,
    });
    expect(parsed.response).toContain('INV-1001');
  });
});
