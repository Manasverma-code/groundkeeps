import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import type { LLMProvider, ChatRequest, LLMMessage } from '@trust-layer/providers';
import type { AuditStore } from '@trust-layer/audit-store';
import type { GroundingEngine } from '@trust-layer/grounding-engine';
import type { GuardEngine } from '@trust-layer/guard-engine';
import type { SourceDocument, PolicyEvaluation, Policy, PolicyRule } from '@trust-layer/shared';

interface ProxyConfig {
  targetProvider: LLMProvider;
  groundingEngine?: GroundingEngine;
  guardEngine?: GuardEngine;
  auditStore?: AuditStore;
  defaultAgentId?: string;
}

export async function createApp(config: ProxyConfig) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'trust-proxy' }));

  // ── Chat only (proxy to LLM) ───────────────────────

  app.post<{
    Body: {
      model?: string;
      messages: { role: string; content: string }[];
      max_tokens?: number;
      temperature?: number;
    };
  }>('/v1/chat', async (req) => {
    const { model, messages, max_tokens, temperature } = req.body;

    const chatRequest: ChatRequest = {
      model: model ?? (config.targetProvider.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini'),
      messages: messages as LLMMessage[],
      maxTokens: max_tokens,
      temperature: temperature,
    };

    const response = await config.targetProvider.chat(chatRequest);

    if (config.auditStore) {
      const payloadHash = createHash('sha256')
        .update(JSON.stringify({ messages, response: response.content }))
        .digest('hex');

      config.auditStore.append({
        agent_id: config.defaultAgentId ?? 'unknown',
        action: 'chat',
        resource: `model:${response.model}`,
        policy_eval: { allowed: true, reason: 'No guard engine configured' },
        payload_hash: payloadHash,
      });
    }

    return {
      id: `chat-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: response.content },
          finish_reason: 'stop' as const,
        },
      ],
      usage: response.usage
        ? {
            prompt_tokens: response.usage.promptTokens,
            completion_tokens: response.usage.completionTokens,
            total_tokens: response.usage.totalTokens,
          }
        : undefined,
      provider: response.provider,
    };
  });

  // ── Verify only (grounding + guard on existing response) ──

  app.post<{
    Body: {
      response: string;
      sources: SourceDocument[];
      action: string;
      resource: string;
      agent_token?: string;
      agent_id?: string;
    };
  }>('/v1/verify', async (req, reply) => {
    const { response, sources, action, resource, agent_token, agent_id } = req.body;

    let guardEval: PolicyEvaluation = {
      allowed: true,
      reason: 'No guard engine configured',
    };
    let resolvedAgentId = agent_id ?? config.defaultAgentId ?? 'unknown';

    if (config.guardEngine) {
      if (agent_token) {
        const result = config.guardEngine.verifyAction(agent_token, action, resource);
        guardEval = result.evaluation;
        if (result.agentId) resolvedAgentId = result.agentId;
        if (!result.allowed) {
          if (config.auditStore) {
            const payloadHash = createHash('sha256')
              .update(JSON.stringify({ response, action, resource }))
              .digest('hex');
            config.auditStore.append({
              agent_id: resolvedAgentId,
              action: `${action}:blocked`,
              resource,
              policy_eval: guardEval,
              payload_hash: payloadHash,
            });
          }
          return reply.code(403).send({
            verified: false,
            grounding: null,
            guard: guardEval,
            error: 'Action blocked by guard policy',
          });
        }
      } else if (agent_id) {
        guardEval = config.guardEngine.evaluate(action, resource, agent_id);
        if (!guardEval.allowed) {
          return reply.code(403).send({
            verified: false,
            grounding: null,
            guard: guardEval,
            error: 'Action blocked by guard policy',
          });
        }
      }
    }

    let groundingResult = null;
    if (config.groundingEngine && sources.length > 0) {
      groundingResult = await config.groundingEngine.verify({ response, sources });
    }

    if (config.auditStore) {
      const payloadHash = createHash('sha256')
        .update(JSON.stringify({ response, action, resource, groundingResult, guardEval }))
        .digest('hex');
      const auditEntry = config.auditStore.append({
        agent_id: resolvedAgentId,
        action,
        resource,
        policy_eval: guardEval,
        payload_hash: payloadHash,
      });
      return {
        verified: guardEval.allowed,
        grounding: groundingResult,
        guard: guardEval,
        audit_id: auditEntry.audit_id,
      };
    }

    return {
      verified: guardEval.allowed,
      grounding: groundingResult,
      guard: guardEval,
      audit_id: null,
    };
  });

  // ── Chat + Verify (chat then ground + guard) ───────

  app.post<{
    Body: {
      model?: string;
      messages: { role: string; content: string }[];
      sources: SourceDocument[];
      action: string;
      resource: string;
      agent_token?: string;
      agent_id?: string;
      max_tokens?: number;
      temperature?: number;
    };
  }>('/v1/chat/verify', async (req, reply) => {
    const { model, messages, sources, action, resource, agent_token, agent_id, max_tokens, temperature } = req.body;

    const chatRequest: ChatRequest = {
      model: model ?? (config.targetProvider.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini'),
      messages: messages as LLMMessage[],
      maxTokens: max_tokens,
      temperature: temperature,
    };

    const llmResponse = await config.targetProvider.chat(chatRequest);

    let guardEval: PolicyEvaluation = {
      allowed: true,
      reason: 'No guard engine configured',
    };
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
    if (config.groundingEngine && sources.length > 0) {
      groundingResult = await config.groundingEngine.verify({
        response: llmResponse.content,
        sources,
      });
    }

    let auditId: string | null = null;
    if (config.auditStore) {
      const payloadHash = createHash('sha256')
        .update(JSON.stringify({ messages, response: llmResponse.content, action, resource }))
        .digest('hex');
      const entry = config.auditStore.append({
        agent_id: resolvedAgentId,
        action: guardEval.allowed ? action : `${action}:blocked`,
        resource,
        policy_eval: guardEval,
        payload_hash: payloadHash,
      });
      auditId = entry.audit_id;
    }

    if (!guardEval.allowed) {
      return reply.code(403).send({
        verified: false,
        response: llmResponse.content,
        grounding: groundingResult,
        guard: guardEval,
        audit_id: auditId,
      });
    }

    return {
      verified: true,
      response: llmResponse.content,
      grounding: groundingResult,
      guard: guardEval,
      audit_id: auditId,
      model: llmResponse.model,
      provider: llmResponse.provider,
      usage: llmResponse.usage
        ? {
            prompt_tokens: llmResponse.usage.promptTokens,
            completion_tokens: llmResponse.usage.completionTokens,
            total_tokens: llmResponse.usage.totalTokens,
          }
        : undefined,
    };
  });

  // ── Agent Management ───────────────────────────────

  app.post<{ Body: { name: string; scope: string } }>('/v1/agents', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Guard engine not configured' });
    const creds = config.guardEngine.registerAgent(req.body.name, req.body.scope);
    return reply.code(201).send(creds);
  });

  app.get('/v1/agents', async () => {
    if (!config.guardEngine) return [];
    return config.guardEngine.listAgents();
  });

  app.get<{ Params: { id: string } }>('/v1/agents/:id', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Guard engine not configured' });
    const agent = config.guardEngine.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    return agent;
  });

  app.delete<{ Params: { id: string } }>('/v1/agents/:id', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Guard engine not configured' });
    const revoked = config.guardEngine.revokeAgent(req.params.id);
    if (!revoked) return reply.code(404).send({ error: 'Agent not found' });
    return reply.code(204).send();
  });

  // ── Policy Management ──────────────────────────────

  app.post<{ Body: Record<string, unknown> }>('/v1/policies', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Guard engine not configured' });
    config.guardEngine.setPolicy(req.body as unknown as Policy);
    return reply.code(201).send({ status: 'Policy set' });
  });

  app.get('/v1/policies', async () => {
    if (!config.guardEngine) return [];
    return config.guardEngine.listPolicies();
  });

  // ── Action Evaluation ──────────────────────────────

  app.post<{ Body: { action: string; resource: string; agent_id: string } }>('/v1/evaluate', async (req) => {
    if (!config.guardEngine) return { allowed: true, reason: 'Guard engine not configured' };
    return config.guardEngine.evaluate(req.body.action, req.body.resource, req.body.agent_id);
  });

  app.post<{ Body: { token: string; action: string; resource: string } }>('/v1/verify-action', async (req) => {
    if (!config.guardEngine) return { allowed: true, evaluation: { allowed: true, reason: 'No guard engine' } };
    return config.guardEngine.verifyAction(req.body.token, req.body.action, req.body.resource);
  });

  // ── Audit Log ──────────────────────────────────────

  app.post('/v1/audit', async (req, reply) => {
    if (!config.auditStore) return reply.code(501).send({ error: 'Audit store not configured' });
    const body = req.body as { agent_id: string; action: string; resource: string; policy_eval: PolicyEvaluation; payload_hash: string };
    return reply.code(201).send(config.auditStore.append(body));
  });

  app.get('/v1/audit', async (req) => {
    if (!config.auditStore) return [];
    const query = req.query as { agent_id?: string; action?: string; resource?: string; since?: string; until?: string; limit?: string; offset?: string };
    return config.auditStore.query({
      agent_id: query.agent_id,
      action: query.action,
      resource: query.resource,
      since: query.since,
      until: query.until,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });
  });

  app.get('/v1/audit/count', async (req) => {
    if (!config.auditStore) return { count: 0 };
    const query = req.query as { agent_id?: string; action?: string; resource?: string };
    return { count: config.auditStore.count(query) };
  });

  app.get('/v1/audit/chain/verify', async () => {
    if (!config.auditStore) return { valid: true, firstEntry: null, lastEntry: null, brokenAt: null };
    return config.auditStore.verifyChain();
  });

  app.get<{ Params: { id: string } }>('/v1/audit/:id', async (req, reply) => {
    if (!config.auditStore) return reply.code(501).send({ error: 'Audit store not configured' });
    const entry = config.auditStore.getByAuditId(req.params.id);
    if (!entry) return reply.code(404).send({ error: 'Audit entry not found' });
    return entry;
  });

  return app;
}
