import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRanker } from '../source-ranker.js';
import type { SourceDocument } from '@trust-layer/shared';

describe('SourceRanker', () => {
  let ranker: SourceRanker;

  beforeEach(() => {
    ranker = new SourceRanker();
  });

  it('ranks by authority score', () => {
    const sources: SourceDocument[] = [
      { id: '1', title: 'Low', content: 'a', authority_score: 0.2 },
      { id: '2', title: 'High', content: 'b', authority_score: 0.9 },
    ];

    const ranked = ranker.rank(sources);
    expect(ranked[0].source.id).toBe('2');
    expect(ranked[0].authority_score).toBe(0.9);
  });

  it('ranks recent sources higher', () => {
    const oldDate = new Date(Date.now() - 200 * 86400000).toISOString();
    const recentDate = new Date(Date.now() - 5 * 86400000).toISOString();

    const sources: SourceDocument[] = [
      { id: 'old', title: 'Old', content: 'a', timestamp: oldDate },
      { id: 'new', title: 'New', content: 'b', timestamp: recentDate },
    ];

    const ranked = ranker.rank(sources);
    expect(ranked[0].source.id).toBe('new');
  });

  it('marks sources older than 90 days as stale', () => {
    const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
    const freshDate = new Date(Date.now() - 10 * 86400000).toISOString();

    const sources: SourceDocument[] = [
      { id: 'old', title: 'Old', content: 'a', timestamp: oldDate },
      { id: 'new', title: 'New', content: 'b', timestamp: freshDate },
    ];

    const ranked = ranker.rank(sources);
    expect(ranked.find((r) => r.source.id === 'old')?.is_stale).toBe(true);
    expect(ranked.find((r) => r.source.id === 'new')?.is_stale).toBe(false);
  });

  it('handles sources without timestamps', () => {
    const sources: SourceDocument[] = [
      { id: '1', title: 'No TS', content: 'a' },
      { id: '2', title: 'With TS', content: 'b', timestamp: new Date().toISOString() },
    ];

    const ranked = ranker.rank(sources);
    expect(ranked).toHaveLength(2);
    // Source with timestamp should rank higher (freshness bonus)
    expect(ranked[0].source.id).toBe('2');
  });

  it('computes composite score correctly', () => {
    const sources: SourceDocument[] = [
      {
        id: '1', title: 'Test', content: 'x',
        authority_score: 1.0,
        relevance_score: 1.0,
        timestamp: new Date().toISOString(),
      },
    ];

    const ranked = ranker.rank(sources);
    expect(ranked[0].composite_score).toBeGreaterThan(0.9);
    expect(ranked[0].freshness_score).toBe(1.0);
    expect(ranked[0].authority_score).toBe(1.0);
    expect(ranked[0].relevance_score).toBe(1.0);
  });
});
