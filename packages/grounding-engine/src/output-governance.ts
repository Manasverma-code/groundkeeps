import type {
  SourceDocument,
  OutputGovernanceConfig,
  OutputGovernanceResult,
  CitationCheck,
  ContentSafetyViolation,
} from '@trust-layer/shared';

const PII_PATTERNS: { type: string; pattern: RegExp }[] = [
  { type: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'phone', pattern: /(\+?1[\s.-]?)?\(?[0-9]{3}\)?[\s.-]?[0-9]{3}[\s.-]?[0-9]{4}/g },
  { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'credit_card', pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
];

const CITATION_PATTERN = /\[ID:\s*([a-zA-Z0-9_-]+)\]/g;

export class OutputGovernanceEngine {
  checkResponse(
    response: string,
    sources: SourceDocument[],
    config: OutputGovernanceConfig,
  ): OutputGovernanceResult {
    const validSourceIds = new Set(sources.map((s) => s.id));
    const violations: ContentSafetyViolation[] = [];

    let citationCheck: CitationCheck | undefined;

    if (config.check_citations || config.forbid_fabricated_citations || config.min_citations !== undefined) {
      const citedIds: string[] = [];
      let match: RegExpExecArray | null;
      const re = new RegExp(CITATION_PATTERN.source, 'g');
      while ((match = re.exec(response)) !== null) {
        citedIds.push(match[1]);
      }

      const fabricatedIds = citedIds.filter((id) => !validSourceIds.has(id));
      const validIds = citedIds.filter((id) => validSourceIds.has(id));

      citationCheck = {
        cited_ids: [...new Set(citedIds)],
        fabricated_ids: [...new Set(fabricatedIds)],
        valid_ids: [...new Set(validIds)],
        citation_count: citedIds.length,
      };
    }

    if (config.block_pii) {
      for (const { type, pattern } of PII_PATTERNS) {
        const re = new RegExp(pattern.source, 'gi');
        let match: RegExpExecArray | null;
        while ((match = re.exec(response)) !== null) {
          violations.push({ type, pattern: pattern.source, match: match[0] });
        }
      }
    }

    if (config.custom_patterns) {
      for (const patternStr of config.custom_patterns) {
        try {
          const re = new RegExp(patternStr, 'gi');
          let match: RegExpExecArray | null;
          while ((match = re.exec(response)) !== null) {
            violations.push({ type: 'custom_pattern', pattern: patternStr, match: match[0] });
          }
        } catch {
          // skip invalid patterns
        }
      }
    }

    const reasons: string[] = [];

    if (config.forbid_fabricated_citations && citationCheck && citationCheck.fabricated_ids.length > 0) {
      reasons.push(`Response contains fabricated citations: [${citationCheck.fabricated_ids.join(', ')}]`);
    }

    if (config.min_citations !== undefined && citationCheck && citationCheck.citation_count < config.min_citations) {
      reasons.push(`Response has ${citationCheck.citation_count} citations, minimum required is ${config.min_citations}`);
    }

    if (config.block_pii && violations.some((v) => PII_PATTERNS.some((p) => p.type === v.type))) {
      reasons.push('Response contains PII');
    }

    if (config.custom_patterns && violations.some((v) => v.type === 'custom_pattern')) {
      reasons.push('Response matches blocked custom patterns');
    }

    return {
      passed: reasons.length === 0,
      citation_check: citationCheck,
      violations,
      reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    };
  }
}
