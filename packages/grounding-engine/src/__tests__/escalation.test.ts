import { describe, it, expect } from 'vitest';
import { EscalationEngine } from '../escalation.js';
import type { GroundingResult, OutputGovernanceResult, EscalationConfig, Claim, SourceDocument } from '@trust-layer/shared';
import type { LLMProvider, ChatResponse, ChatRequest, ProviderName } from '@trust-layer/providers';

describe('EscalationEngine', () => {
  const engine = new EscalationEngine();

  const passingGrounding: GroundingResult = {
    hallucination_score: 0,
    claims: [
      { text: 'Deductible is $2,000', supported: true, confidence: 0.95, source: 'doc-b' },
    ],
    ranked_sources: [],
    conflicts: [],
  };

  const hallucinatedGrounding: GroundingResult = {
    hallucination_score: 0.67,
    claims: [
      { text: 'Deductible is $500', supported: false, confidence: 0.1, reason: 'Not in sources' },
      { text: 'Copay is $30', supported: true, confidence: 0.9, source: 'doc-b' },
      { text: 'Out-of-pocket max is $500', supported: false, confidence: 0.05, reason: 'Contradicts source' },
    ],
    ranked_sources: [],
    conflicts: [],
  };

  describe('pass through', () => {
    it('passes when no rules are configured', () => {
      const config: EscalationConfig = { rules: [] };
      const result = engine.evaluate(passingGrounding, null, config);
      expect(result.action).toBe('pass');
    });

    it('passes when no thresholds are exceeded', () => {
      const config: EscalationConfig = {
        rules: [
          { metric: 'hallucination_score', operator: 'gt', threshold: 0.5, action: 'block', message: 'Too many hallucinations' },
        ],
      };
      const result = engine.evaluate(passingGrounding, null, config);
      expect(result.action).toBe('pass');
    });
  });

  describe('blocking', () => {
    it('blocks when hallucination score exceeds threshold', () => {
      const config: EscalationConfig = {
        rules: [
          { metric: 'hallucination_score', operator: 'gte', threshold: 0.5, action: 'block', message: 'Hallucination threshold exceeded' },
        ],
      };
      const result = engine.evaluate(hallucinatedGrounding, null, config);
      expect(result.action).toBe('block');
      expect(result.triggered_by).toContain('Hallucination');
    });

    it('blocks when unsupported claim count exceeds threshold', () => {
      const config: EscalationConfig = {
        rules: [
          { metric: 'unsupported_claim_count', operator: 'gte', threshold: 2, action: 'block', message: 'Too many unsupported claims' },
        ],
      };
      const result = engine.evaluate(hallucinatedGrounding, null, config);
      expect(result.action).toBe('block');
    });
  });

  describe('flagging', () => {
    it('flags when hallucination score is above threshold with flag action', () => {
      const config: EscalationConfig = {
        rules: [
          { metric: 'hallucination_score', operator: 'gt', threshold: 0.1, action: 'flag', message: 'Needs human review' },
        ],
      };
      const result = engine.evaluate(hallucinatedGrounding, null, config);
      expect(result.action).toBe('flag');
    });
  });

  describe('citation-based escalation', () => {
    it('escalates when citations are missing', () => {
      const config: EscalationConfig = {
        rules: [
          { metric: 'citation_missing', operator: 'gte', threshold: 1, action: 'flag', message: 'No citations in response' },
        ],
      };
      const outputGovernance: OutputGovernanceResult = {
        passed: false,
        violations: [],
        citation_check: {
          cited_ids: [],
          fabricated_ids: [],
          valid_ids: [],
          citation_count: 0,
        },
        reason: 'No citations',
      };
      const result = engine.evaluate(passingGrounding, outputGovernance, config);
      expect(result.action).toBe('flag');
    });
  });

  describe('content violation escalation', () => {
    it('escalates when content violations exist', () => {
      const config: EscalationConfig = {
        rules: [
          { metric: 'content_violation', operator: 'gte', threshold: 1, action: 'block', message: 'Content policy violation' },
        ],
      };
      const outputGovernance: OutputGovernanceResult = {
        passed: false,
        violations: [{ type: 'email', pattern: '.*', match: 'test@test.com' }],
        reason: 'PII detected',
      };
      const result = engine.evaluate(passingGrounding, outputGovernance, config);
      expect(result.action).toBe('block');
    });
  });

  describe('answer correction', () => {
    it('returns original response when no unsupported claims', async () => {
      const result = await engine.correctResponse(
        'Your deductible is $2,000.',
        passingGrounding,
        [],
      );
      expect(result).toBe('Your deductible is $2,000.');
    });

    it('uses corrector LLM when unsupported claims exist', async () => {
      class MockCorrector implements LLMProvider {
        readonly name: ProviderName = 'openai';
        async chat(_req: ChatRequest): Promise<ChatResponse> {
          return {
            content: 'Your deductible is $2,000 based on the current policy.',
            model: 'mock',
            provider: 'openai',
          };
        }
      }

      const engineWithLLM = new EscalationEngine(new MockCorrector());
      const result = await engineWithLLM.correctResponse(
        'Your deductible is $500.',
        hallucinatedGrounding,
        [{ id: 'doc-b', title: 'B', content: 'The deductible is $2,000.' }],
      );
      expect(result).toBe('Your deductible is $2,000 based on the current policy.');
    });
  });
});
