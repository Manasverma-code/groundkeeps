import type { GroundingRequest, GroundingResult, Claim, SourceDocument } from '@trust-layer/shared';
import type { LLMProvider } from '@trust-layer/providers';

export class GroundingEngine {
  constructor(private verifier: LLMProvider) {}

  async verify(request: GroundingRequest): Promise<GroundingResult> {
    const claimExtraction = await this.extractClaims(request.response);

    if (claimExtraction.claims.length === 0) {
      return {
        hallucination_score: 0,
        claims: [],
        ranked_sources: [],
        conflicts: [],
      };
    }

    const verified = await this.verifyClaims(claimExtraction.claims, request.sources);
    const rankedSources = this.rankSources(request.sources);

    return {
      hallucination_score: this.computeScore(verified),
      claims: verified,
      ranked_sources: rankedSources,
      conflicts: [],
    };
  }

  private async extractClaims(response: string): Promise<{ claims: string[] }> {
    const result = await this.verifier.chat({
      model: this.verifier.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Extract factual claims from the following text. Return a JSON array of strings, each being one verifiable claim. Only include claims that can be verified against sources. Example format: ["claim 1", "claim 2"]`,
        },
        { role: 'user', content: response },
      ],
      temperature: 0,
    });

    try {
      const claims = JSON.parse(result.content) as string[];
      return { claims: Array.isArray(claims) ? claims : [] };
    } catch {
      return { claims: [] };
    }
  }

  private async verifyClaims(claims: string[], sources: SourceDocument[]): Promise<Claim[]> {
    const sourceContext = sources.map((s) => `[${s.id}] ${s.content}`).join('\n\n');

    const result = await this.verifier.chat({
      model: this.verifier.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a factual verification system. For each claim, determine if it is SUPPORTED or UNSUPPORTED by the provided sources. Return JSON array with objects: { "text": string, "supported": boolean, "confidence": number (0-1), "source": string | null, "reason": string }`,
        },
        {
          role: 'user',
          content: `SOURCES:\n${sourceContext}\n\nCLAIMS:\n${claims.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
        },
      ],
      temperature: 0,
    });

    try {
      return JSON.parse(result.content) as Claim[];
    } catch {
      return claims.map((text) => ({
        text,
        supported: false,
        confidence: 0,
        reason: 'Failed to parse verification result',
      }));
    }
  }

  private rankSources(sources: SourceDocument[]): SourceDocument[] {
    return [...sources].sort((a, b) => {
      const scoreA = (a.authority_score ?? 0.5) + (a.timestamp ? 0.1 : 0);
      const scoreB = (b.authority_score ?? 0.5) + (b.timestamp ? 0.1 : 0);
      return scoreB - scoreA;
    });
  }

  private computeScore(claims: Claim[]): number {
    if (claims.length === 0) return 0;
    const unsupported = claims.filter((c) => !c.supported).length;
    return unsupported / claims.length;
  }
}
