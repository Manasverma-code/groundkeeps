import type { GroundingRequest, GroundingResult, Claim } from '@trust-layer/shared';
import type { LLMProvider } from '@trust-layer/providers';
import { ClaimExtractor } from './claim-extractor.js';
import { ClaimVerifier } from './verifier.js';
import { SourceRanker } from './source-ranker.js';
import { ConflictResolver } from './conflict-resolver.js';
import { TemporalChecker } from './temporal.js';

export class GroundingEngine {
  private extractor: ClaimExtractor;
  private verifier: ClaimVerifier;
  private ranker: SourceRanker;
  private conflictResolver: ConflictResolver;
  private temporalChecker: TemporalChecker;

  constructor(verifierLLM: LLMProvider) {
    this.extractor = new ClaimExtractor(verifierLLM);
    this.verifier = new ClaimVerifier(verifierLLM);
    this.ranker = new SourceRanker();
    this.conflictResolver = new ConflictResolver();
    this.temporalChecker = new TemporalChecker();
  }

  async verify(request: GroundingRequest): Promise<GroundingResult> {
    const extraction = await this.extractor.extract(request.response);

    if (extraction.claims.length === 0) {
      return {
        hallucination_score: 0,
        claims: [],
        ranked_sources: this.ranker.rank(request.sources),
        conflicts: [],
      };
    }

    const verifiedClaims = await this.verifier.verify(extraction.claims, request.sources);
    const rankedSources = this.ranker.rank(request.sources);
    const conflicts = this.conflictResolver.resolve(verifiedClaims, rankedSources);

    return {
      hallucination_score: this.computeScore(verifiedClaims),
      claims: verifiedClaims,
      ranked_sources: rankedSources,
      conflicts,
    };
  }

  private computeScore(claims: Claim[]): number {
    if (claims.length === 0) return 0;
    const unsupported = claims.filter((c) => !c.supported).length;
    return Math.round((unsupported / claims.length) * 100) / 100;
  }
}
