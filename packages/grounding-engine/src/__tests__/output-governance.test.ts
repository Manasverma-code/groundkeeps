import { describe, it, expect } from 'vitest';
import { OutputGovernanceEngine } from '../output-governance.js';
import type { SourceDocument, OutputGovernanceConfig } from '@trust-layer/shared';

describe('OutputGovernanceEngine', () => {
  const engine = new OutputGovernanceEngine();

  const sources: SourceDocument[] = [
    { id: 'doc-a', title: 'A', content: 'Policy A content' },
    { id: 'doc-b', title: 'B', content: 'Policy B content' },
  ];

  describe('citation verification', () => {
    it('detects valid citations in the response', () => {
      const config: OutputGovernanceConfig = { check_citations: true };
      const result = engine.checkResponse(
        'Your deductible is $2,000 [ID: doc-b]. This supersedes prior plans [ID: doc-b].',
        sources,
        config,
      );

      expect(result.citation_check).toBeDefined();
      expect(result.citation_check!.valid_ids).toEqual(['doc-b']);
      expect(result.citation_check!.cited_ids).toEqual(['doc-b']);
      expect(result.citation_check!.fabricated_ids).toEqual([]);
      expect(result.citation_check!.citation_count).toBe(2);
    });

    it('detects fabricated citations (IDs not in source set)', () => {
      const config: OutputGovernanceConfig = {
        check_citations: true,
        forbid_fabricated_citations: true,
      };
      const result = engine.checkResponse(
        'Your deductible is $500 [ID: doc-x]. See also [ID: doc-y].',
        sources,
        config,
      );

      expect(result.passed).toBe(false);
      expect(result.citation_check!.fabricated_ids).toEqual(['doc-x', 'doc-y']);
      expect(result.reason).toContain('doc-x');
    });

    it('enforces minimum citation count', () => {
      const config: OutputGovernanceConfig = {
        check_citations: true,
        min_citations: 2,
      };
      const result = engine.checkResponse(
        'Your deductible is $2,000 [ID: doc-b].',
        sources,
        config,
      );

      expect(result.passed).toBe(false);
      expect(result.reason).toContain('minimum required is 2');
    });

    it('passes when citations meet requirements', () => {
      const config: OutputGovernanceConfig = {
        check_citations: true,
        forbid_fabricated_citations: true,
        min_citations: 1,
      };
      const result = engine.checkResponse(
        'Your deductible is $2,000 [ID: doc-b]. This is the current policy.',
        sources,
        config,
      );

      expect(result.passed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('content safety - PII blocking', () => {
    it('detects email addresses', () => {
      const config: OutputGovernanceConfig = { block_pii: true };
      const result = engine.checkResponse(
        'Contact me at john.doe@example.com for more info.',
        sources,
        config,
      );

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === 'email')).toBe(true);
    });

    it('detects phone numbers', () => {
      const config: OutputGovernanceConfig = { block_pii: true };
      const result = engine.checkResponse(
        'Call 555-123-4567 for support.',
        sources,
        config,
      );

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === 'phone')).toBe(true);
    });

    it('detects SSNs', () => {
      const config: OutputGovernanceConfig = { block_pii: true };
      const result = engine.checkResponse(
        'Your SSN is 123-45-6789.',
        sources,
        config,
      );

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === 'ssn')).toBe(true);
    });

    it('passes clean responses with no PII', () => {
      const config: OutputGovernanceConfig = { block_pii: true };
      const result = engine.checkResponse(
        'Your deductible is $2,000 according to the current policy [ID: doc-b].',
        sources,
        config,
      );

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('custom patterns', () => {
    it('detects custom regex patterns', () => {
      const config: OutputGovernanceConfig = {
        custom_patterns: ['\\$\\d+,?\\d*'],
      };
      const result = engine.checkResponse(
        'The premium is $1,500 per month.',
        sources,
        config,
      );

      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.type === 'custom_pattern')).toBe(true);
    });
  });

  describe('combined checks', () => {
    it('reports all violations when multiple checks fail', () => {
      const config: OutputGovernanceConfig = {
        check_citations: true,
        forbid_fabricated_citations: true,
        block_pii: true,
        min_citations: 1,
      };
      const result = engine.checkResponse(
        'Email me at user@test.com or call 555-123-4567. Ref [ID: fake-doc].',
        sources,
        config,
      );

      expect(result.passed).toBe(false);
      expect(result.citation_check!.fabricated_ids).toContain('fake-doc');
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
      expect(result.reason).toContain('PII');
      expect(result.reason).toContain('fabricated');
    });
  });
});
