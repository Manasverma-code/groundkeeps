import type {
  SourceDocument,
  DocumentMetadata,
  DocumentGovernanceRule,
  DocumentGovernanceRuleType,
  DocumentGovernanceConfig,
  DocumentGovernanceResult,
} from '@trust-layer/shared';

export class DocumentGovernanceEngine {
  filter(
    sources: SourceDocument[],
    config: DocumentGovernanceConfig,
  ): DocumentGovernanceResult {
    const excluded: DocumentGovernanceResult['excluded'] = [];

    const filtered = sources.filter((source) => {
      for (const rule of config.rules) {
        const result = this.evaluateRule(source, rule, sources);
        if (!result.passed) {
          excluded.push({
            source_id: source.id,
            rule: rule.type,
            reason: result.reason,
          });
          return false;
        }
      }
      return true;
    });

    return { filtered_sources: filtered, excluded };
  }

  private evaluateRule(
    source: SourceDocument,
    rule: DocumentGovernanceRule,
    allSources: SourceDocument[],
  ): { passed: boolean; reason: string } {
    switch (rule.type) {
      case 'status_equals':
        return this.evaluateStatusEquals(source, rule);
      case 'effective_date_on_or_before':
        return this.evaluateEffectiveDate(source);
      case 'not_expired':
        return this.evaluateNotExpired(source);
      case 'not_superseded':
        return this.evaluateNotSuperseded(source, allSources);
      case 'version_gte':
        return this.evaluateVersionGte(source, rule);
      default:
        return { passed: true, reason: '' };
    }
  }

  private evaluateStatusEquals(
    source: SourceDocument,
    rule: DocumentGovernanceRule,
  ): { passed: boolean; reason: string } {
    const expected = String(rule.value ?? 'active');
    const actual = source.metadata?.status;
    if (actual !== expected) {
      return {
        passed: false,
        reason: `Document status is '${actual ?? 'unset'}', required '${expected}'`,
      };
    }
    return { passed: true, reason: '' };
  }

  private evaluateEffectiveDate(
    source: SourceDocument,
  ): { passed: boolean; reason: string } {
    const ed = source.metadata?.effective_date;
    if (!ed) {
      return { passed: false, reason: 'Document has no effective_date' };
    }
    const date = new Date(ed);
    if (isNaN(date.getTime())) {
      return { passed: false, reason: `Document effective_date '${ed}' is not a valid date` };
    }
    if (date > new Date()) {
      return {
        passed: false,
        reason: `Document effective_date ${ed} is in the future (not yet in effect)`,
      };
    }
    return { passed: true, reason: '' };
  }

  private evaluateNotExpired(
    source: SourceDocument,
  ): { passed: boolean; reason: string } {
    if (source.metadata?.status === 'expired') {
      return { passed: false, reason: 'Document status is expired' };
    }
    const ed = source.metadata?.expiry_date;
    if (ed) {
      const date = new Date(ed);
      if (!isNaN(date.getTime()) && date < new Date()) {
        return { passed: false, reason: `Document expired on ${ed}` };
      }
    }
    return { passed: true, reason: '' };
  }

  private evaluateNotSuperseded(
    source: SourceDocument,
    allSources: SourceDocument[],
  ): { passed: boolean; reason: string } {
    if (source.metadata?.status === 'superseded') {
      return {
        passed: false,
        reason: `Document status is superseded${source.metadata.superseded_by ? ` by ${source.metadata.superseded_by}` : ''}`,
      };
    }
    if (source.metadata?.superseded_by) {
      return { passed: false, reason: `Document superseded by ${source.metadata.superseded_by}` };
    }
    const supersededByAnother = allSources.some(
      (other) =>
        other.id !== source.id &&
        other.metadata?.supersedes?.includes(source.id),
    );
    if (supersededByAnother) {
      return { passed: false, reason: `Document is superseded by another document in the source set` };
    }
    return { passed: true, reason: '' };
  }

  private evaluateVersionGte(
    source: SourceDocument,
    rule: DocumentGovernanceRule,
  ): { passed: boolean; reason: string } {
    const minVersion = Number(rule.value ?? 1);
    const version = source.metadata?.version ?? 0;
    if (version < minVersion) {
      return {
        passed: false,
        reason: `Document version ${version} is below minimum version ${minVersion}`,
      };
    }
    return { passed: true, reason: '' };
  }
}
