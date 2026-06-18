import { describe, expect, it } from 'vitest';
import { evalFixtures } from './fixtures.js';

describe('LLM eval fixtures', () => {
  for (const fixture of evalFixtures) {
    it(`validates ${fixture.name}`, () => {
      const parsed = fixture.schema.parse(fixture.output);
      const confidence =
        typeof parsed === 'object' &&
        parsed != null &&
        'confidence' in (parsed as Record<string, unknown>)
          ? Number((parsed as Record<string, unknown>).confidence)
          : 0;
      expect(confidence).toBeGreaterThanOrEqual(fixture.minConfidence);
    });
  }
});
