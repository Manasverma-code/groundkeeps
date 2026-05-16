import { describe, it, expect } from 'vitest';
import { DocumentGovernanceEngine } from '../document-governance.js';
import type { SourceDocument, DocumentGovernanceConfig } from '@trust-layer/shared';

describe('DocumentGovernanceEngine', () => {
  const engine = new DocumentGovernanceEngine();

  const activeDoc: SourceDocument = {
    id: 'doc-b',
    title: 'Current Policy',
    content: 'The deductible is $2,000. This supersedes all prior plan documents.',
    metadata: { status: 'active', effective_date: '2025-01-01', version: 2 },
  };

  const expiredDoc: SourceDocument = {
    id: 'doc-a',
    title: 'Old Policy',
    content: 'Out-of-network mental health visits have a $500 deductible.',
    metadata: { status: 'expired', effective_date: '2023-01-01', expiry_date: '2024-12-31', version: 1 },
  };

  const draftDoc: SourceDocument = {
    id: 'doc-c',
    title: 'Draft Policy',
    content: 'The deductible is $1,500.',
    metadata: { status: 'draft', effective_date: '2026-06-01', version: 3 },
  };

  const supersededDoc: SourceDocument = {
    id: 'doc-d',
    title: 'Old Policy v2',
    content: 'The deductible is $1,000.',
    metadata: { status: 'superseded', superseded_by: 'doc-e', version: 2 },
  };

  const docWithFutureEffective: SourceDocument = {
    id: 'doc-future',
    title: 'Future Policy',
    content: 'The deductible is $3,000.',
    metadata: { status: 'active', effective_date: '2099-01-01', version: 5 },
  };

  // ── status_equals ──────────────────────────────────

  it('filters out documents whose status does not equal the required value', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'status_equals', value: 'active' }],
    };

    const result = engine.filter([activeDoc, expiredDoc, draftDoc], config);

    expect(result.filtered_sources).toHaveLength(1);
    expect(result.filtered_sources[0].id).toBe('doc-b');
    expect(result.excluded).toHaveLength(2);
    expect(result.excluded[0].source_id).toBe('doc-a');
    expect(result.excluded[0].rule).toBe('status_equals');
  });

  it('allows all documents when status matches', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'status_equals', value: 'active' }],
    };

    const result = engine.filter([activeDoc], config);
    expect(result.filtered_sources).toHaveLength(1);
    expect(result.excluded).toHaveLength(0);
  });

  // ── effective_date_on_or_before ────────────────────

  it('filters out documents whose effective date is in the future', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'effective_date_on_or_before' }],
    };

    const result = engine.filter([activeDoc, docWithFutureEffective], config);

    expect(result.filtered_sources).toHaveLength(1);
    expect(result.filtered_sources[0].id).toBe('doc-b');
    expect(result.excluded[0].source_id).toBe('doc-future');
    expect(result.excluded[0].rule).toBe('effective_date_on_or_before');
  });

  it('filters out documents with no effective_date', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'effective_date_on_or_before' }],
    };

    const noDateDoc: SourceDocument = {
      id: 'no-date', title: 'No Date', content: 'test',
      metadata: { status: 'active' },
    };

    const result = engine.filter([activeDoc, noDateDoc], config);
    expect(result.filtered_sources).toHaveLength(1);
    expect(result.excluded[0].source_id).toBe('no-date');
  });

  // ── not_expired ────────────────────────────────────

  it('filters out expired documents', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'not_expired' }],
    };

    const result = engine.filter([activeDoc, expiredDoc], config);

    expect(result.filtered_sources).toHaveLength(1);
    expect(result.filtered_sources[0].id).toBe('doc-b');
    expect(result.excluded[0].source_id).toBe('doc-a');
    expect(result.excluded[0].rule).toBe('not_expired');
  });

  it('passes documents with no expiry date', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'not_expired' }],
    };

    const result = engine.filter([activeDoc], config);
    expect(result.filtered_sources).toHaveLength(1);
    expect(result.excluded).toHaveLength(0);
  });

  // ── not_superseded ─────────────────────────────────

  it('filters out superseded documents', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'not_superseded' }],
    };

    const result = engine.filter([activeDoc, supersededDoc], config);

    expect(result.filtered_sources).toHaveLength(1);
    expect(result.filtered_sources[0].id).toBe('doc-b');
    expect(result.excluded[0].source_id).toBe('doc-d');
    expect(result.excluded[0].rule).toBe('not_superseded');
  });

  it('filters out documents superseded by another in the same set', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'not_superseded' }],
    };

    const older: SourceDocument = {
      id: 'v1', title: 'V1', content: 'deductible $500',
      metadata: { status: 'active', version: 1 },
    };
    const newer: SourceDocument = {
      id: 'v2', title: 'V2', content: 'deductible $2000',
      metadata: { status: 'active', version: 2, supersedes: ['v1'] },
    };

    const result = engine.filter([older, newer], config);

    expect(result.filtered_sources).toHaveLength(1);
    expect(result.filtered_sources[0].id).toBe('v2');
    expect(result.excluded[0].source_id).toBe('v1');
    expect(result.excluded[0].reason).toContain('superseded by another');
  });

  // ── version_gte ────────────────────────────────────

  it('filters out documents below minimum version', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'version_gte', value: 2 }],
    };

    const result = engine.filter([activeDoc, expiredDoc], config);

    expect(result.filtered_sources).toHaveLength(1);
    expect(result.filtered_sources[0].id).toBe('doc-b');
    expect(result.excluded[0].source_id).toBe('doc-a');
    expect(result.excluded[0].rule).toBe('version_gte');
  });

  // ── Combined rules ─────────────────────────────────

  it('applies multiple rules and excludes documents failing any rule', () => {
    const config: DocumentGovernanceConfig = {
      rules: [
        { type: 'status_equals', value: 'active' },
        { type: 'effective_date_on_or_before' },
        { type: 'not_expired' },
      ],
    };

    const result = engine.filter([activeDoc, expiredDoc, draftDoc, docWithFutureEffective], config);

    expect(result.filtered_sources).toHaveLength(1);
    expect(result.filtered_sources[0].id).toBe('doc-b');
    expect(result.excluded).toHaveLength(3);
  });

  // ── Insurance deductible scenario ──────────────────

  it('correctly resolves the insurance deductible example (expired vs current)', () => {
    const docA: SourceDocument = {
      id: 'doc-a',
      title: '2023 Plan Document',
      content: 'Out-of-network mental health visits have a $500 deductible.',
      metadata: {
        status: 'expired',
        effective_date: '2023-01-01',
        expiry_date: '2023-12-31',
        version: 1,
      },
    };

    const docB: SourceDocument = {
      id: 'doc-b',
      title: '2024 Plan Document',
      content: 'The deductible is $2,000. This supersedes all prior plan documents.',
      metadata: {
        status: 'active',
        effective_date: '2024-01-01',
        version: 2,
        supersedes: ['doc-a'],
      },
    };

    const config: DocumentGovernanceConfig = {
      rules: [
        { type: 'status_equals', value: 'active' },
        { type: 'effective_date_on_or_before' },
        { type: 'not_expired' },
        { type: 'not_superseded' },
      ],
    };

    const result = engine.filter([docA, docB], config);

    // Only doc B should remain
    expect(result.filtered_sources).toHaveLength(1);
    expect(result.filtered_sources[0].id).toBe('doc-b');
    expect(result.filtered_sources[0].content).toContain('$2,000');

    // Doc A should be excluded with a reason for each failing rule
    const docAExclusions = result.excluded.filter((e) => e.source_id === 'doc-a');
    expect(docAExclusions.length).toBeGreaterThanOrEqual(1);

    // After governance, the LLM only sees doc B
    const llmSeesContent = result.filtered_sources.map((s) => s.content).join(' ');
    expect(llmSeesContent).not.toContain('$500');
    expect(llmSeesContent).toContain('$2,000');
  });

  it('returns empty filtered_sources when all documents are excluded', () => {
    const config: DocumentGovernanceConfig = {
      rules: [{ type: 'status_equals', value: 'active' }],
    };

    const result = engine.filter([expiredDoc, supersededDoc], config);
    expect(result.filtered_sources).toHaveLength(0);
    expect(result.excluded).toHaveLength(2);
  });

  it('returns all sources when no rules are configured', () => {
    const config: DocumentGovernanceConfig = { rules: [] };
    const result = engine.filter([activeDoc, expiredDoc], config);
    expect(result.filtered_sources).toHaveLength(2);
    expect(result.excluded).toHaveLength(0);
  });
});
