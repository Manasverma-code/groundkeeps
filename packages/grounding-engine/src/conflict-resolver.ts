import type { Claim, SourceRankingEntry, KnowledgeConflict } from '@trust-layer/shared';

export class ConflictResolver {
  resolve(claims: Claim[], rankedSources: SourceRankingEntry[]): KnowledgeConflict[] {
    const conflicts: KnowledgeConflict[] = [];

    const grouped = this.groupClaimsByText(claims);

    for (const [, group] of grouped) {
      const sourceIds = new Set(group.map((c) => c.source).filter(Boolean));

      if (sourceIds.size < 2) continue;

      const matchingSources = rankedSources.filter((rs) => sourceIds.has(rs.source.id));

      if (matchingSources.length < 2) continue;

      const resolvedBy = this.resolveConflict(matchingSources);

      if (resolvedBy) {
        conflicts.push({
          claim: group[0].text,
          sources: matchingSources.map((s) => s.source.id),
          resolution: resolvedBy,
        });
      }
    }

    return conflicts;
  }

  private groupClaimsByText(claims: Claim[]): Map<string, Claim[]> {
    const groups = new Map<string, Claim[]>();
    for (const claim of claims) {
      const existing = groups.get(claim.text) ?? [];
      existing.push(claim);
      groups.set(claim.text, existing);
    }
    return groups;
  }

  private resolveConflict(sources: SourceRankingEntry[]): string | null {
    const sorted = [...sources].sort((a, b) => b.composite_score - a.composite_score);
    const best = sorted[0];
    const secondBest = sorted[1];

    if (!best || !secondBest) return null;

    if (best.composite_score > secondBest.composite_score + 0.2) {
      return `Resolved by source ${best.source.id}: highest composite score (${best.composite_score})`;
    }

    if (best.freshness_score > secondBest.freshness_score + 0.2) {
      return `Resolved by source ${best.source.id}: most recent (freshness ${best.freshness_score})`;
    }

    if (best.authority_score > secondBest.authority_score + 0.2) {
      return `Resolved by source ${best.source.id}: highest authority (${best.authority_score})`;
    }

    return `Conflict between ${best.source.id} and ${secondBest.source.id}: scores too close to resolve automatically`;
  }
}
