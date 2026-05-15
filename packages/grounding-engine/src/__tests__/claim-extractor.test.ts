import { describe, it, expect } from 'vitest';
import { ClaimExtractor } from '../claim-extractor.js';
import { MockLLMProvider, claimExtractionResponse } from './mock-provider.js';

describe('ClaimExtractor', () => {
  it('extracts claims from JSON response', async () => {
    const mock = new MockLLMProvider(() =>
      claimExtractionResponse(['Paris is the capital of France.', 'Water boils at 100°C.']),
    );
    const extractor = new ClaimExtractor(mock);
    const result = await extractor.extract('Some text about Paris and water.');
    expect(result.claims).toHaveLength(2);
    expect(result.claims[0]).toBe('Paris is the capital of France.');
  });

  it('returns empty array for extraction failure', async () => {
    const mock = new MockLLMProvider(() => '{invalid json');
    const extractor = new ClaimExtractor(mock);
    const result = await extractor.extract('Some text.');
    expect(result.claims).toHaveLength(0);
  });

  it('falls back to line-by-line extraction for non-JSON responses', async () => {
    const mock = new MockLLMProvider(() => '1. First claim here.\n2. Second claim here.');
    const extractor = new ClaimExtractor(mock);
    const result = await extractor.extract('Some text.');
    expect(result.claims.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty response text', async () => {
    const mock = new MockLLMProvider(() => '[]');
    const extractor = new ClaimExtractor(mock);
    const result = await extractor.extract('');
    expect(result.claims).toHaveLength(0);
  });
});
