import { describe, it, expect, beforeAll } from 'vitest';
import type { LLMProvider, ChatResponse, ChatRequest, ProviderName } from '@trust-layer/providers';
import { GroundingEngine } from '@trust-layer/grounding-engine';
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
    app = await createApp({
      targetProvider: new MockProvider(),
      groundingEngine,
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
});
