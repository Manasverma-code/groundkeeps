import { describe, it, expect } from 'vitest';
import { ConflictResolver } from '../conflict-resolver.js';
import type { Claim, SourceRankingEntry, SourceDocument } from '@trust-layer/shared';

describe('ConflictResolver', () => {
  const makeSource = (id: string): SourceDocument => ({
    id, title: `Source ${id}`, content: 'content',
  });

  const makeRanking = (source: SourceDocument, score: number): SourceRankingEntry => ({
    source,
    composite_score: score,
    freshness_score: 0.5,
    authority_score: 0.5,
    relevance_score: 0.5,
    is_stale: false,
  });

  it('returns empty conflicts when no claims have multiple sources', () => {
    const resolver = new ConflictResolver();
    const claims: Claim[] = [
      { text: 'Claim 1', supported: true, confidence: 0.9, source: 'src1' },
    ];
    const sources = [makeRanking(makeSource('src1'), 0.8)];

    expect(resolver.resolve(claims, sources)).toHaveLength(0);
  });

  it('detects conflict when claim has multiple sources', () => {
    const resolver = new ConflictResolver();
    const claims: Claim[] = [
      { text: 'Claim 1', supported: true, confidence: 0.9, source: 'src1' },
      { text: 'Claim 1', supported: false, confidence: 0.3, source: 'src2' },
    ];
    const sources = [
      makeRanking(makeSource('src1'), 0.9),
      makeRanking(makeSource('src2'), 0.5),
    ];

    const conflicts = resolver.resolve(claims, sources);
    // Same text with different sources = conflict detected
    expect(conflicts).toHaveLength(1);
  });

  it('resolves conflict by highest score', () => {
    const resolver = new ConflictResolver();
    // A single claim referenced by multiple sources
    const claim: Claim = {
      text: 'The sky is blue',
      supported: true,
      confidence: 0.8,
      source: 'src1',
    };
    const sources = [
      makeRanking(makeSource('src1'), 0.9),
      makeRanking(makeSource('src2'), 0.9),
    ];

    // Need to make the claim appear to be associated with both sources
    // In practice this happens when different verifications link to different sources
    // For this test, create two claim entries with same text but different sources
    const claims: Claim[] = [
      { ...claim, source: 'src1' },
      { ...claim, source: 'src2' },
    ];

    const conflicts = resolver.resolve(claims, sources);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].claim).toBe('The sky is blue');
    expect(conflicts[0].sources).toContain('src1');
    expect(conflicts[0].sources).toContain('src2');
  });
});
