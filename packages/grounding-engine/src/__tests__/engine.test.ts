import { describe, it, expect } from 'vitest';
import { GroundingEngine } from '../engine.js';
import { MockLLMProvider, claimExtractionResponse, verificationResponse } from './mock-provider.js';
import type { GroundingRequest, SourceDocument } from '@trust-layer/shared';

describe('GroundingEngine', () => {
  it('returns no claims for extraction failure', async () => {
    const mock = new MockLLMProvider(() => 'invalid');
    const engine = new GroundingEngine(mock);

    const result = await engine.verify({
      response: 'Some text',
      sources: [],
    });

    expect(result.hallucination_score).toBe(0);
    expect(result.claims).toHaveLength(0);
  });

  it('verifies claims and computes hallucination score', async () => {
    let callCount = 0;
    const mock = new MockLLMProvider(() => {
      callCount++;
      if (callCount === 1) {
        return claimExtractionResponse(['Claim 1', 'Claim 2']);
      }
      return verificationResponse([
        { text: 'Claim 1', supported: true, confidence: 0.95, source: 'src1', reason: 'Found in source' },
        { text: 'Claim 2', supported: false, confidence: 0.1, reason: 'Not found in sources' },
      ]);
    });

    const engine = new GroundingEngine(mock);
    const sources: SourceDocument[] = [
      { id: 'src1', title: 'Source 1', content: 'Supporting content for claim 1' },
    ];

    const result = await engine.verify({ response: 'Some text with claims', sources });

    expect(result.claims).toHaveLength(2);
    expect(result.hallucination_score).toBe(0.5); // 1 out of 2 unsupported
    expect(result.conflicts).toBeDefined();
    expect(result.ranked_sources).toHaveLength(1);
  });

  it('sets hallucination score to 0 when all claims supported', async () => {
    let callCount = 0;
    const mock = new MockLLMProvider(() => {
      callCount++;
      if (callCount === 1) {
        return claimExtractionResponse(['Supported claim']);
      }
      return verificationResponse([
        { text: 'Supported claim', supported: true, confidence: 0.99, source: 'src1' },
      ]);
    });

    const engine = new GroundingEngine(mock);
    const sources: SourceDocument[] = [
      { id: 'src1', title: 'S', content: 'Content supporting claim' },
    ];

    const result = await engine.verify({ response: 'Text', sources });
    expect(result.hallucination_score).toBe(0);
  });

  it('handles empty response', async () => {
    const mock = new MockLLMProvider(() => '[]');
    const engine = new GroundingEngine(mock);

    const result = await engine.verify({ response: '', sources: [] });
    expect(result.hallucination_score).toBe(0);
    expect(result.claims).toHaveLength(0);
  });
});
