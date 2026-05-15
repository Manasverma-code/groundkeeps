import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import type { LLMProvider, ChatRequest, LLMMessage } from '@trust-layer/providers';
import type { AuditStore } from '@trust-layer/audit-store';
import type { GroundingEngine } from '@trust-layer/grounding-engine';
import type { GuardEngine } from '@trust-layer/guard-engine';
import type { SourceDocument, PolicyEvaluation, Policy } from '@trust-layer/shared';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface ProxyConfig {
  targetProvider: LLMProvider;
  groundingEngine?: GroundingEngine;
  guardEngine?: GuardEngine;
  auditStore?: AuditStore;
  defaultAgentId?: string;
  dashboardDir?: string;
}

export async function createApp(config: ProxyConfig) {
  const app = Fastify({ logger: true });

  await app.register(fastifyCors, { origin: true });

  // ── Serve dashboard static files (if available) ───
  if (config.dashboardDir && existsSync(config.dashboardDir)) {
    await app.register(fastifyStatic, {
      root: config.dashboardDir,
      prefix: '/',
      wildcard: false,
    });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/v1/') || req.url === '/health') return reply.callNotFound();
      try { return reply.sendFile('index.html'); } catch { return reply.callNotFound(); }
    });
  }

  // ── Health ────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    service: 'ground-keeps',
    version: '0.1.0',
    engines: {
      grounding: config.groundingEngine ? 'enabled' : 'disabled',
      guard: config.guardEngine ? 'enabled' : 'disabled',
      audit: config.auditStore ? 'enabled' : 'disabled',
    },
    target_llm: config.targetProvider.name,
  }));

  // ── Chat only ─────────────────────────────────────
  app.post<{
    Body: {
      model?: string;
      messages: { role: string; content: string }[];
      max_tokens?: number;
      temperature?: number;
    };
  }>('/v1/chat', async (req, reply) => {
    const { model, messages, max_tokens, temperature } = req.body;
    if (!messages?.length) return reply.code(400).send({ error: 'messages required' });

    try {
      const chatRequest: ChatRequest = {
        model: model ?? (config.targetProvider.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini'),
        messages: messages as LLMMessage[],
        maxTokens: max_tokens,
        temperature: temperature,
      };

      const response = await config.targetProvider.chat(chatRequest);

      if (config.auditStore) {
        config.auditStore.append({
          agent_id: config.defaultAgentId ?? 'unknown',
          action: 'chat',
          resource: `model:${response.model}`,
          policy_eval: { allowed: true, reason: 'Chat completion' },
          payload_hash: createHash('sha256').update(JSON.stringify({ messages })).digest('hex'),
        });
      }

      return {
        id: `chat-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: response.model,
        choices: [{ index: 0, message: { role: 'assistant', content: response.content }, finish_reason: 'stop' as const }],
        usage: response.usage ? { prompt_tokens: response.usage.promptTokens, completion_tokens: response.usage.completionTokens, total_tokens: response.usage.totalTokens } : undefined,
        provider: response.provider,
      };
    } catch (err) {
      return reply.code(502).send({ error: `LLM request failed: ${(err as Error).message}` });
    }
  });

  // ── Verify ────────────────────────────────────────
  app.post<{
    Body: {
      response: string; sources: SourceDocument[]; action: string; resource: string;
      agent_token?: string; agent_id?: string;
    };
  }>('/v1/verify', async (req, reply) => {
    const { response, sources, action, resource, agent_token, agent_id } = req.body;
    if (!response) return reply.code(400).send({ error: 'response required' });

    let guardEval: PolicyEvaluation = { allowed: true, reason: 'No guard engine configured' };
    let resolvedAgentId = agent_id ?? config.defaultAgentId ?? 'unknown';

    if (config.guardEngine) {
      if (agent_token) {
        const result = config.guardEngine.verifyAction(agent_token, action, resource);
        guardEval = result.evaluation;
        if (result.agentId) resolvedAgentId = result.agentId;
        if (!result.allowed) {
          if (config.auditStore) {
            config.auditStore.append({
              agent_id: resolvedAgentId, action: `${action}:blocked`, resource,
              policy_eval: guardEval, payload_hash: createHash('sha256').update(JSON.stringify({ response })).digest('hex'),
            });
          }
          return reply.code(403).send({ verified: false, grounding: null, guard: guardEval, error: 'Action blocked by guard policy' });
        }
      } else if (agent_id) {
        guardEval = config.guardEngine.evaluate(action, resource, agent_id);
        if (!guardEval.allowed) return reply.code(403).send({ verified: false, grounding: null, guard: guardEval, error: 'Action blocked by guard policy' });
      }
    }

    let groundingResult = null;
    if (config.groundingEngine && sources?.length) {
      try {
        groundingResult = await config.groundingEngine.verify({ response, sources });
      } catch (err) {
        groundingResult = { hallucination_score: 0, claims: [], ranked_sources: [], conflicts: [], error: (err as Error).message };
      }
    }

    if (config.auditStore) {
      const entry = config.auditStore.append({
        agent_id: resolvedAgentId, action, resource, policy_eval: guardEval,
        payload_hash: createHash('sha256').update(JSON.stringify({ response, groundingResult, guardEval })).digest('hex'),
      });
      return { verified: guardEval.allowed, grounding: groundingResult, guard: guardEval, audit_id: entry.audit_id };
    }

    return { verified: guardEval.allowed, grounding: groundingResult, guard: guardEval, audit_id: null };
  });

  // ── Chat + Verify ─────────────────────────────────
  app.post<{
    Body: {
      model?: string; messages: { role: string; content: string }[];
      sources: SourceDocument[]; action: string; resource: string;
      agent_token?: string; agent_id?: string; max_tokens?: number; temperature?: number;
    };
  }>('/v1/chat/verify', async (req, reply) => {
    const { model, messages, sources, action, resource, agent_token, agent_id, max_tokens, temperature } = req.body;
    if (!messages?.length) return reply.code(400).send({ error: 'messages required' });

    let llmResponse;
    try {
      llmResponse = await config.targetProvider.chat({
        model: model ?? (config.targetProvider.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini'),
        messages: messages as LLMMessage[], maxTokens: max_tokens, temperature: temperature,
      });
    } catch (err) {
      return reply.code(502).send({ error: `LLM request failed: ${(err as Error).message}` });
    }

    let guardEval: PolicyEvaluation = { allowed: true, reason: 'No guard engine configured' };
    let resolvedAgentId = agent_id ?? config.defaultAgentId ?? 'unknown';

    if (config.guardEngine) {
      if (agent_token) {
        const result = config.guardEngine.verifyAction(agent_token, action, resource);
        guardEval = result.evaluation;
        if (result.agentId) resolvedAgentId = result.agentId;
      } else if (agent_id) {
        guardEval = config.guardEngine.evaluate(action, resource, agent_id);
      }
    }

    let groundingResult = null;
    if (config.groundingEngine && sources?.length) {
      try {
        groundingResult = await config.groundingEngine.verify({ response: llmResponse.content, sources });
      } catch (err) {
        groundingResult = { hallucination_score: 0, claims: [], ranked_sources: [], conflicts: [], error: (err as Error).message };
      }
    }

    let auditId: string | null = null;
    if (config.auditStore) {
      const entry = config.auditStore.append({
        agent_id: resolvedAgentId, action: guardEval.allowed ? action : `${action}:blocked`, resource,
        policy_eval: guardEval, payload_hash: createHash('sha256').update(JSON.stringify({ messages, response: llmResponse.content })).digest('hex'),
      });
      auditId = entry.audit_id;
    }

    if (!guardEval.allowed) return reply.code(403).send({ verified: false, response: llmResponse.content, grounding: groundingResult, guard: guardEval, audit_id: auditId });

    return {
      verified: true, response: llmResponse.content, grounding: groundingResult, guard: guardEval, audit_id: auditId,
      model: llmResponse.model, provider: llmResponse.provider,
      usage: llmResponse.usage ? { prompt_tokens: llmResponse.usage.promptTokens, completion_tokens: llmResponse.usage.completionTokens, total_tokens: llmResponse.usage.totalTokens } : undefined,
    };
  });

  // ── Agent Management ──────────────────────────────
  app.post<{ Body: { name: string; scope: string } }>('/v1/agents', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Guard engine not configured' });
    if (!req.body?.name || !req.body?.scope) return reply.code(400).send({ error: 'name and scope required' });
    return reply.code(201).send(config.guardEngine.registerAgent(req.body.name, req.body.scope));
  });

  app.get('/v1/agents', async () => config.guardEngine?.listAgents() ?? []);

  app.get<{ Params: { id: string } }>('/v1/agents/:id', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Not configured' });
    const agent = config.guardEngine.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    return agent;
  });

  app.delete<{ Params: { id: string } }>('/v1/agents/:id', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Not configured' });
    if (!config.guardEngine.revokeAgent(req.params.id)) return reply.code(404).send({ error: 'Agent not found' });
    return reply.code(204).send();
  });

  // ── Policies ──────────────────────────────────────
  app.post<{ Body: Record<string, unknown> }>('/v1/policies', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Guard engine not configured' });
    config.guardEngine.setPolicy(req.body as unknown as Policy);
    return reply.code(201).send({ status: 'Policy set' });
  });

  app.get('/v1/policies', async () => config.guardEngine?.listPolicies() ?? []);

  // ── Evaluate ──────────────────────────────────────
  app.post<{ Body: { action: string; resource: string; agent_id: string } }>('/v1/evaluate', async (req) => {
    if (!config.guardEngine) return { allowed: true, reason: 'Guard engine not configured' };
    return config.guardEngine.evaluate(req.body.action, req.body.resource, req.body.agent_id);
  });

  app.post<{ Body: { token: string; action: string; resource: string } }>('/v1/verify-action', async (req) => {
    if (!config.guardEngine) return { allowed: true, evaluation: { allowed: true, reason: 'No guard engine' } };
    return config.guardEngine.verifyAction(req.body.token, req.body.action, req.body.resource);
  });

  // ── Audit Log ─────────────────────────────────────
  app.get('/v1/audit', async (req) => {
    if (!config.auditStore) return [];
    const q = req.query as Record<string, string>;
    return config.auditStore.query({
      agent_id: q.agent_id, action: q.action, resource: q.resource,
      since: q.since, until: q.until,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
      offset: q.offset ? parseInt(q.offset, 10) : undefined,
    });
  });

  app.get('/v1/audit/count', async (req) => {
    if (!config.auditStore) return { count: 0 };
    const q = req.query as Record<string, string>;
    return { count: config.auditStore.count({ agent_id: q.agent_id }) };
  });

  app.get('/v1/audit/chain/verify', async () => {
    if (!config.auditStore) return { valid: true, error: 'No audit store' };
    return config.auditStore.verifyChain();
  });

  app.get<{ Params: { id: string } }>('/v1/audit/:id', async (req, reply) => {
    if (!config.auditStore) return reply.code(501).send({ error: 'Not configured' });
    const entry = config.auditStore.getByAuditId(req.params.id);
    if (!entry) return reply.code(404).send({ error: 'Audit entry not found' });
    return entry;
  });

  return app;
}
