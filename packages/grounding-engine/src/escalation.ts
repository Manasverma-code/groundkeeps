import type {
  GroundingResult,
  OutputGovernanceResult,
  EscalationConfig,
  EscalationResult,
  EscalationAction,
  SourceDocument,
} from '@trust-layer/shared';
import type { LLMProvider } from '@trust-layer/providers';

export class EscalationEngine {
  constructor(private correctorLLM?: LLMProvider) {}

  evaluate(
    grounding: GroundingResult | null,
    outputGovernance: OutputGovernanceResult | null,
    config: EscalationConfig,
  ): EscalationResult {
    const hallucinationScore = grounding?.hallucination_score ?? 0;
    const unsupportedCount = grounding?.claims.filter((c) => !c.supported).length ?? 0;

    for (const rule of config.rules) {
      const value = this.getMetricValue(rule.metric, hallucinationScore, unsupportedCount, outputGovernance);
      if (this.compare(value, rule.operator, rule.threshold)) {
        return {
          action: rule.action,
          triggered_by: rule.message ?? `Rule: ${rule.metric} ${rule.operator} ${rule.threshold} (actual: ${value})`,
          message: rule.message ?? `Escalated by rule: ${rule.metric}`,
        };
      }
    }

    return { action: 'pass', message: 'All checks passed' };
  }

  async correctResponse(
    response: string,
    grounding: GroundingResult,
    sources: SourceDocument[],
  ): Promise<string> {
    if (!this.correctorLLM) return response;

    const unsupportedClaims = grounding.claims.filter((c) => !c.supported);
    if (unsupportedClaims.length === 0) return response;

    const supportedContext = sources
      .map((s, i) => `[Source ${i + 1}: ${s.id}]\n${s.content}`)
      .join('\n\n');

    const claimsText = unsupportedClaims.map((c) => `- "${c.text}"`).join('\n');

    const result = await this.correctorLLM.chat({
      model: this.correctorLLM.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an answer correction system. The following claims in the original answer were found to be unsupported by the provided sources. Rewrite the original answer to only include information supported by the sources. Remove or correct any unsupported claims. Return ONLY the corrected answer, nothing else.`,
        },
        {
          role: 'user',
          content: `SOURCES:\n${supportedContext}\n\nORIGINAL ANSWER:\n${response}\n\nUNSUPPORTED CLAIMS TO FIX:\n${claimsText}\n\nCORRECTED ANSWER:`,
        },
      ],
      temperature: 0,
    });

    return result.content || response;
  }

  private getMetricValue(
    metric: string,
    hallucinationScore: number,
    unsupportedCount: number,
    outputGovernance: OutputGovernanceResult | null,
  ): number {
    switch (metric) {
      case 'hallucination_score':
        return hallucinationScore;
      case 'unsupported_claim_count':
        return unsupportedCount;
      case 'citation_missing':
        return outputGovernance?.citation_check?.citation_count === 0 ? 1 : 0;
      case 'content_violation':
        return (outputGovernance?.violations.length ?? 0);
      default:
        return 0;
    }
  }

  private compare(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }
}
