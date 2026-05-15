import type { SourceDocument, SourceRankingEntry } from '@trust-layer/shared';

interface RankerConfig {
  freshnessThresholdDays: number;
  authorityWeight: number;
  freshnessWeight: number;
  relevanceWeight: number;
}

export class SourceRanker {
  private config: RankerConfig;

  constructor(config?: Partial<RankerConfig>) {
    this.config = {
      freshnessThresholdDays: 90,
      authorityWeight: 0.4,
      freshnessWeight: 0.3,
      relevanceWeight: 0.3,
      ...config,
    };
  }

  rank(sources: SourceDocument[]): SourceRankingEntry[] {
    return sources
      .map((source) => this.scoreSource(source))
      .sort((a, b) => b.composite_score - a.composite_score);
  }

  private scoreSource(source: SourceDocument): SourceRankingEntry {
    const freshnessScore = this.computeFreshness(source.timestamp);
    const authorityScore = source.authority_score ?? 0.5;
    const relevanceScore = source.relevance_score ?? 0.5;
    const isStale = this.isStale(source.timestamp);

    const composite =
      this.config.authorityWeight * authorityScore +
      this.config.freshnessWeight * freshnessScore +
      this.config.relevanceWeight * relevanceScore;

    return {
      source,
      composite_score: Math.round(composite * 100) / 100,
      freshness_score: Math.round(freshnessScore * 100) / 100,
      authority_score: Math.round(authorityScore * 100) / 100,
      relevance_score: Math.round(relevanceScore * 100) / 100,
      is_stale: isStale,
    };
  }

  private computeFreshness(timestamp?: string): number {
    if (!timestamp) return 0.3;

    const ageDays = this.ageInDays(timestamp);
    if (ageDays === null) return 0.3;

    if (ageDays <= 7) return 1.0;
    if (ageDays <= 30) return 0.9;
    if (ageDays <= 90) return 0.7;
    if (ageDays <= 180) return 0.5;
    if (ageDays <= 365) return 0.3;
    return 0.1;
  }

  isStale(timestamp?: string): boolean {
    if (!timestamp) return false;
    const ageDays = this.ageInDays(timestamp);
    if (ageDays === null) return false;
    return ageDays > this.config.freshnessThresholdDays;
  }

  private ageInDays(timestamp: string): number | null {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return null;
    const now = Date.now();
    const diffMs = now - date.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
  }
}
