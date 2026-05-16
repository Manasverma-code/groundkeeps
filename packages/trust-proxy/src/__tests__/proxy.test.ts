import { describe, it, expect, beforeAll } from 'vitest';
import type { LLMProvider, ChatResponse, ChatRequest, ProviderName } from '@trust-layer/providers';
import { GroundingEngine, DocumentGovernanceEngine, OutputGovernanceEngine, EscalationEngine } from '@trust-layer/grounding-engine';
import { GuardEngine } from '@trust-layer/guard-engine';
import { AuditStore } from '@trust-layer/audit-store';
import { createApp } from '../app.js';

class MockProvider implements LLMProvider {
  readonly name: ProviderName = 'openai';
  async chat(_req: ChatRequest): Promise<ChatResponse> {
    return {
      content: 'Mock response from LLM',
      model: 'mock-model',
      provider: 'openai',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
  }
}

// Override the verifier LLM in GroundingEngine to avoid real API calls
import type { SourceDocument } from '@trust-layer/shared';

describe('Trust Proxy', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let guard: GuardEngine;
  let audit: AuditStore;
  let agentId: string;
  let token: string;

  beforeAll(async () => {
    guard = new GuardEngine('test-key');
    audit = await AuditStore.create(':memory:');

    // Register a test agent
    const creds = guard.registerAgent('test-agent', 'test');
    agentId = creds.agent_id;
    token = creds.token;

    // Set a test policy
    guard.setPolicy({
      agent: 'test-agent',
      allow: [{ action: 'read', resource: 'allowed/*' }],
      deny: [{ action: 'delete', resource: '*' }],
    });

    // Create the app using mocked provider and real engines
    const groundingEngine = new GroundingEngine(new MockProvider());
    const documentGovernanceEngine = new DocumentGovernanceEngine();
    const outputGovernanceEngine = new OutputGovernanceEngine();
    const escalationEngine = new EscalationEngine(new MockProvider());
    app = await createApp({
      targetProvider: new MockProvider(),
      groundingEngine,
      documentGovernanceEngine,
      outputGovernanceEngine,
      escalationEngine,
      guardEngine: guard,
      auditStore: audit,
      defaultAgentId: 'test-default',
    });
  });

  // ── Health ──────────────────────────────────────────

  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  // ── Chat ────────────────────────────────────────────

  it('POST /v1/chat returns LLM response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: { messages: [{ role: 'user', content: 'Hello' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.choices[0].message.content).toBe('Mock response from LLM');
    expect(body.model).toBe('mock-model');
    expect(body.usage.total_tokens).toBe(15);
  });

  it('POST /v1/chat logs to audit store', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/chat',
      payload: { messages: [{ role: 'user', content: 'Hi' }] },
    });
    const auditRes = await app.inject({ method: 'GET', url: '/v1/audit' });
    const entries = auditRes.json() as unknown[];
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  // ── Agent Management ────────────────────────────────

  it('POST /v1/agents registers a new agent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      payload: { name: 'new-agent', scope: 'new-scope' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { agent_id: string; token: string };
    expect(body.agent_id).toBeTruthy();
    expect(body.token).toBeTruthy();
  });

  it('GET /v1/agents lists all agents', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/agents' });
    expect(res.statusCode).toBe(200);
    const agents = res.json() as unknown[];
    expect(agents.length).toBeGreaterThanOrEqual(2);
  });

  // ── Policies ────────────────────────────────────────

  it('POST /v1/policies sets a policy', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/policies',
      payload: { agent: 'new-agent', allow: [{ action: 'read', resource: 'docs/*' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('Policy set');
  });

  it('GET /v1/policies lists policies', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/policies' });
    expect(res.statusCode).toBe(200);
    const policies = res.json() as unknown[];
    expect(policies.length).toBeGreaterThanOrEqual(1);
  });

  // ── Evaluate ────────────────────────────────────────

  it('POST /v1/evaluate allows matching action', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/evaluate',
      payload: { action: 'read', resource: 'allowed/doc', agent_id: 'test-agent' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().allowed).toBe(true);
  });

  it('POST /v1/evaluate denies non-matching action', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/evaluate',
      payload: { action: 'delete', resource: 'allowed/doc', agent_id: 'test-agent' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().allowed).toBe(false);
  });

  // ── Verify ──────────────────────────────────────────

  it('POST /v1/verify performs grounding and guard', async () => {
    const sources: SourceDocument[] = [
      { id: 'src1', title: 'Test', content: 'Mock content', authority_score: 0.9 },
    ];
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verify',
      payload: {
        response: 'This is a test response.',
        sources,
        action: 'read',
        resource: 'allowed/doc',
        agent_id: 'test-agent',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { verified: boolean; grounding: unknown; guard: { allowed: boolean }; audit_id: string };
    expect(body.verified).toBe(true);
    expect(body.grounding).not.toBeNull();
    expect(body.guard.allowed).toBe(true);
    expect(body.audit_id).toBeTruthy();
  });

  it('POST /v1/verify blocks denied actions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verify',
      payload: {
        response: 'Test',
        sources: [],
        action: 'delete',
        resource: 'allowed/doc',
        agent_id: 'test-agent',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('blocked');
  });

  it('POST /v1/verify with token authenticates agent', async () => {
    const sources: SourceDocument[] = [
      { id: 'src1', title: 'Test', content: 'Mock', authority_score: 1.0 },
    ];
    const res = await app.inject({
      method: 'POST',
      url: '/v1/verify',
      payload: {
        response: 'Test response.',
        sources,
        action: 'read',
        resource: 'allowed/doc',
        agent_token: token,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().verified).toBe(true);
  });

  // ── Audit ───────────────────────────────────────────

  it('GET /v1/audit returns entries', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/audit' });
    expect(res.statusCode).toBe(200);
    const entries = res.json() as unknown[];
    expect(Array.isArray(entries)).toBe(true);
  });

  it('GET /v1/audit/count returns count', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/audit/count' });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().count).toBe('number');
  });

  it('GET /v1/audit/chain/verifies chain integrity', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/audit/chain/verify' });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
  });

  it('GET /v1/audit/:id returns specific entry', async () => {
    const auditRes = await app.inject({ method: 'GET', url: '/v1/audit' });
    const entries = auditRes.json() as { audit_id: string }[];
    if (entries.length > 0) {
      const res = await app.inject({ method: 'GET', url: `/v1/audit/${entries[0].audit_id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().audit_id).toBe(entries[0].audit_id);
    }
  });

  // ── Error Handling ──────────────────────────────────

  it('returns 404 for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  // ── Document Governance ────────────────────────────

  describe('with document governance', () => {
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

    it('pre-filters expired documents via /v1/verify before grounding', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          response: 'Your deductible is $500.',
          sources: [expiredDoc, activeDoc],
          action: 'read',
          resource: 'allowed/doc',
          agent_id: 'test-agent',
          governance: {
            rules: [
              { type: 'status_equals', value: 'active' },
              { type: 'effective_date_on_or_before' },
              { type: 'not_expired' },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        verified: boolean;
        governance: { filtered_sources: SourceDocument[]; excluded: { source_id: string; rule: string; reason: string }[] };
        grounding: { claims: unknown[] };
      };

      // Governance should have filtered out the expired doc
      expect(body.governance).not.toBeNull();
      expect(body.governance.filtered_sources).toHaveLength(1);
      expect(body.governance.filtered_sources[0].id).toBe('doc-b');
      expect(body.governance.excluded.length).toBeGreaterThanOrEqual(1);
      expect(body.governance.excluded[0].source_id).toBe('doc-a');
    });

    it('pre-filters expired documents via /v1/chat/verify before LLM call', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/chat/verify',
        payload: {
          messages: [{ role: 'user', content: 'What is my deductible?' }],
          sources: [expiredDoc, activeDoc],
          action: 'read',
          resource: 'allowed/doc',
          agent_id: 'test-agent',
          governance: {
            rules: [
              { type: 'status_equals', value: 'active' },
              { type: 'not_expired' },
            ],
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        verified: boolean;
        governance: { filtered_sources: SourceDocument[]; excluded: unknown[] };
      };

      // Grounding should only run on the active document
      expect(body.governance).not.toBeNull();
      expect(body.governance.filtered_sources).toHaveLength(1);
      expect(body.governance.filtered_sources[0].id).toBe('doc-b');
    });

    it('returns governance result even when guard blocks the action', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          response: 'Test',
          sources: [expiredDoc, activeDoc],
          action: 'delete',
          resource: 'allowed/doc',
          agent_id: 'test-agent',
          governance: {
            rules: [{ type: 'status_equals', value: 'active' }],
          },
        },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json() as {
        error: string;
        governance: { filtered_sources: unknown[]; excluded: unknown[] };
      };

      // Governance should still have run and filtered sources
      expect(body.governance).not.toBeNull();
      expect(body.governance.filtered_sources).toHaveLength(1);
    });

    it('does not apply governance when no rules are provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          response: 'Test response.',
          sources: [expiredDoc, activeDoc],
          action: 'read',
          resource: 'allowed/doc',
          agent_id: 'test-agent',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { governance: unknown };
      // No governance in body when no rules provided (governance is null)
      expect(body.governance).toBeNull();
    });
  });

  // ── Output Governance ───────────────────────────

  describe('with output governance', () => {
    it('detects fabricated citations via /v1/verify', async () => {
      const sources: SourceDocument[] = [
        { id: 'doc-b', title: 'Current', content: 'Deductible is $2,000.' },
      ];
      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          response: 'Your deductible is $2,000 [ID: doc-b] as per [ID: fake-doc].',
          sources,
          action: 'read',
          resource: 'allowed/doc',
          agent_id: 'test-agent',
          output_governance: {
            check_citations: true,
            forbid_fabricated_citations: true,
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { output_governance: { passed: boolean; citation_check: { fabricated_ids: string[] } } };
      expect(body.output_governance).not.toBeNull();
      expect(body.output_governance.passed).toBe(false);
      expect(body.output_governance.citation_check.fabricated_ids).toContain('fake-doc');
    });

    it('detects PII via /v1/verify', async () => {
      const sources: SourceDocument[] = [
        { id: 'doc1', title: 'Policy', content: 'Policy content.' },
      ];
      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          response: 'Contact support at john@example.com.',
          sources,
          action: 'read',
          resource: 'allowed/doc',
          agent_id: 'test-agent',
          output_governance: { block_pii: true },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { output_governance: { passed: boolean; violations: { type: string }[] } };
      expect(body.output_governance.passed).toBe(false);
      expect(body.output_governance.violations.some((v: { type: string }) => v.type === 'email')).toBe(true);
    });
  });

  // ── Escalation ──────────────────────────────────

  describe('with escalation rules', () => {
    it('blocks response when hallucination score exceeds threshold via /v1/verify', async () => {
      const sources: SourceDocument[] = [
        { id: 'doc1', title: 'Policy', content: 'The deductible is $2,000.' },
      ];
      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          response: 'The deductible is $500 and copay is $30.',
          sources,
          action: 'read',
          resource: 'allowed/doc',
          agent_id: 'test-agent',
          escalation: {
            rules: [
              { metric: 'hallucination_score', operator: 'gte', threshold: 0.3, action: 'block', message: 'Hallucination threshold exceeded' },
            ],
          },
        },
      });

      const body = res.json() as { verified: boolean; escalation: { action: string } };
      expect(body.verified).toBe(false);
      expect(body.escalation.action).toBe('block');
    });

    it('flags response when citations are missing via /v1/verify', async () => {
      const sources: SourceDocument[] = [
        { id: 'doc1', title: 'Policy', content: 'Policy content.' },
      ];
      const res = await app.inject({
        method: 'POST',
        url: '/v1/verify',
        payload: {
          response: 'Your benefit is $2,000.',
          sources,
          action: 'read',
          resource: 'allowed/doc',
          agent_id: 'test-agent',
          output_governance: { check_citations: true },
          escalation: {
            rules: [
              { metric: 'citation_missing', operator: 'gte', threshold: 1, action: 'flag', message: 'Missing citations' },
            ],
          },
        },
      });

      const body = res.json() as { escalation: { action: string } };
      expect(body.escalation.action).toBe('flag');
    });
  });
});
