import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { LLMProvider, ChatRequest, LLMMessage } from '@trust-layer/providers';
import type { AuditStore } from '@trust-layer/audit-store';
import type { GroundingEngine, DocumentGovernanceEngine, OutputGovernanceEngine, EscalationEngine } from '@trust-layer/grounding-engine';
import type { GuardEngine } from '@trust-layer/guard-engine';
import type { SourceDocument, PolicyEvaluation, Policy, DocumentGovernanceConfig, DocumentGovernanceResult, OutputGovernanceConfig, OutputGovernanceResult, EscalationConfig, EscalationResult, GroundingResult } from '@trust-layer/shared';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import {
  ChatBodySchema, VerifyBodySchema, ChatVerifyBodySchema,
  CreateAgentBodySchema, PolicyBodySchema,
  EvaluateBodySchema, VerifyActionBodySchema,
} from './validation.js';
import { computeSummary } from './audit-summarizer.js';

interface ProxyConfig {
  targetProvider: LLMProvider;
  groundingEngine?: GroundingEngine;
  documentGovernanceEngine?: DocumentGovernanceEngine;
  outputGovernanceEngine?: OutputGovernanceEngine;
  escalationEngine?: EscalationEngine;
  guardEngine?: GuardEngine;
  auditStore?: AuditStore;
  defaultAgentId?: string;
  dashboardDir?: string;
  apiKey?: string;
}

const MAX_RECENT_VERIFICATIONS = 50;

interface RecentVerification {
  timestamp: string;
  type: 'verify' | 'chat/verify';
  verified: boolean;
  hallucination_score: number | null;
  governance_exclusions: number;
  output_governance_passed: boolean | null;
  escalation_action: string | null;
  violations: number;
  audit_id: string | null;
}

const PUBLIC_ROUTES = new Set(['/health', '/']);

function authHook(config: ProxyConfig) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!config.apiKey) return;
    if (PUBLIC_ROUTES.has(req.url)) return;
    if (req.url.startsWith('/assets/')) return;
    if (req.url.startsWith('/v1/')) {
      const auth = req.headers['authorization'];
      if (!auth || !auth.startsWith('Bearer ')) {
        req.log.error({ url: req.url, ip: req.ip }, 'Auth failed: missing or malformed Authorization header');
        return reply.code(401).send({ error: 'Missing or invalid Authorization header. Use: Authorization: Bearer <PROXY_API_KEY>' });
      }
      const key = auth.slice(7);
      if (key.length !== config.apiKey.length || !timingSafeEqual(Buffer.from(key), Buffer.from(config.apiKey))) {
        req.log.error({ url: req.url, ip: req.ip }, 'Auth failed: invalid API key');
        return reply.code(401).send({ error: 'Invalid API key' });
      }
    }
  };
}

function validateOrReply(schema: z.ZodSchema, body: unknown, reply: FastifyReply): boolean {
  const result = schema.safeParse(body);
  if (!result.success) {
    reply.code(400).send({
      error: 'Validation failed',
      details: result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
    return false;
  }
  return true;
}

export async function createApp(config: ProxyConfig) {
  const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 });

  const recentBuffer: RecentVerification[] = [];
  function pushRecent(entry: RecentVerification) {
    recentBuffer.unshift(entry);
    if (recentBuffer.length > MAX_RECENT_VERIFICATIONS) {
      recentBuffer.length = MAX_RECENT_VERIFICATIONS;
    }
  }

  app.addHook('preSerialization', async (_request, _reply, payload) => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'grounding' in payload) {
      const p = payload as Record<string, unknown>;
      pushRecent({
        timestamp: new Date().toISOString(),
        type: _request.url === '/v1/verify' ? 'verify' : 'chat/verify',
        verified: !!p.verified,
        hallucination_score: (p.grounding as Record<string, unknown> | null)?.hallucination_score as number ?? null,
        governance_exclusions: ((p.governance as Record<string, unknown> | null)?.excluded as unknown[] | null)?.length ?? 0,
        output_governance_passed: (p.output_governance as Record<string, unknown> | null)?.passed as boolean ?? null,
        escalation_action: (p.escalation as Record<string, unknown> | null)?.action as string ?? null,
        violations: ((p.output_governance as Record<string, unknown> | null)?.violations as unknown[] | null)?.length ?? 0,
        audit_id: (p.audit_id as string) ?? null,
      });
    }
    return payload;
  });

  await app.register(fastifyCors, { origin: true });

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const auth = req.headers['authorization'];
      return auth ? auth.slice(7) : req.ip;
    },
  });

  // Global auth hook
  app.addHook('onRequest', authHook(config));

  // Serve dashboard static files
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

  // ── Health (public) ──────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    service: 'ground-keeps',
    version: '0.1.0',
    auth: config.apiKey ? 'required' : 'disabled',
    engines: {
      grounding: config.groundingEngine ? 'enabled' : 'disabled',
      output_governance: config.outputGovernanceEngine ? 'enabled' : 'disabled',
      escalation: config.escalationEngine ? 'enabled' : 'disabled',
      guard: config.guardEngine ? 'enabled' : 'disabled',
      audit: config.auditStore ? 'enabled' : 'disabled',
    },
    target_llm: config.targetProvider.name,
  }));

  // ── Chat only ────────────────────────────────────
  app.post('/v1/chat', async (req, reply) => {
    if (!validateOrReply(ChatBodySchema, req.body, reply)) return;
    const { model, messages, max_tokens, temperature } = req.body as z.infer<typeof ChatBodySchema>;

    try {
      const chatRequest: ChatRequest = {
        model: model ?? (config.targetProvider.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini'),
        messages: messages as LLMMessage[], maxTokens: max_tokens, temperature: temperature,
      };
      const response = await config.targetProvider.chat(chatRequest);
      if (config.auditStore) {
        config.auditStore.append({
          agent_id: config.defaultAgentId ?? 'unknown', action: 'chat', resource: `model:${response.model}`,
          policy_eval: { allowed: true, reason: 'Chat completion' },
          payload_hash: createHash('sha256').update(JSON.stringify({ messages })).digest('hex'),
        });
      }
      return {
        id: `chat-${Date.now()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000),
        model: response.model,
        choices: [{ index: 0, message: { role: 'assistant', content: response.content }, finish_reason: 'stop' as const }],
        usage: response.usage ? { prompt_tokens: response.usage.promptTokens, completion_tokens: response.usage.completionTokens, total_tokens: response.usage.totalTokens } : undefined,
        provider: response.provider,
      };
    } catch (err) {
      return reply.code(502).send({ error: `LLM request failed: ${(err as Error).message}` });
    }
  });

  // ── Verify ───────────────────────────────────────
  app.post('/v1/verify', async (req, reply) => {
    if (!validateOrReply(VerifyBodySchema, req.body, reply)) return;
    const { response, sources, action, resource, agent_token, agent_id, governance, output_governance, escalation } = req.body as z.infer<typeof VerifyBodySchema>;

    // 1. Document governance (pre-filter sources)
    let governanceResult: DocumentGovernanceResult | null = null;
    let filteredSources = sources;
    if (config.documentGovernanceEngine && governance?.rules?.length && sources?.length) {
      governanceResult = config.documentGovernanceEngine.filter(sources, governance);
      filteredSources = governanceResult.filtered_sources;
    }

    // 2. Output governance (citation check + content safety)
    let outputGovernanceResult: OutputGovernanceResult | null = null;
    if (config.outputGovernanceEngine && output_governance && sources?.length) {
      outputGovernanceResult = config.outputGovernanceEngine.checkResponse(response, filteredSources, output_governance);
    }

    // 3. Grounding engine (hallucination detection)
    let groundingResult: GroundingResult | null = null;
    if (config.groundingEngine && filteredSources?.length) {
      try { groundingResult = await config.groundingEngine.verify({ response, sources: filteredSources }); } catch {
        groundingResult = null;
      }
    }

    // 4. Escalation (decide pass/correct/block based on all results)
    let escalationResult: EscalationResult | null = null;
    let finalResponse = response;
    if (config.escalationEngine && escalation?.rules?.length) {
      escalationResult = config.escalationEngine.evaluate(groundingResult, outputGovernanceResult, escalation);
      if (escalationResult.action === 'correct' && groundingResult) {
        try {
          finalResponse = await config.escalationEngine.correctResponse(response, groundingResult, filteredSources);
        } catch {
          escalationResult = { action: 'flag', message: 'Correction failed, flagged for review', triggered_by: 'correct_error' };
        }
      }
      if (escalationResult.action === 'block') {
        return { verified: false, response: finalResponse, grounding: groundingResult, guard: { allowed: true, reason: 'Blocked by escalation' }, governance: governanceResult, output_governance: outputGovernanceResult, escalation: escalationResult, audit_id: null };
      }
    }

    // 5. Guard engine (agent action check)
    let guardEval: PolicyEvaluation = { allowed: true, reason: 'No guard engine configured' };
    let resolvedAgentId = agent_id ?? config.defaultAgentId ?? 'unknown';

    if (config.guardEngine) {
      if (agent_token) {
        const result = config.guardEngine.verifyAction(agent_token, action, resource);
        guardEval = result.evaluation;
        if (result.agentId) resolvedAgentId = result.agentId;
        if (!result.allowed) { config.auditStore?.append({
          agent_id: resolvedAgentId, action: `${action}:blocked`, resource,
          policy_eval: guardEval, payload_hash: createHash('sha256').update(JSON.stringify({ response, governanceResult, outputGovernanceResult, escalationResult })).digest('hex'),
        }); return reply.code(403).send({ verified: false, grounding: groundingResult, guard: guardEval, governance: governanceResult, output_governance: outputGovernanceResult, escalation: escalationResult, error: 'Action blocked by guard policy' }); }
      } else if (agent_id) {
        guardEval = config.guardEngine.evaluate(action, resource, agent_id);
        if (!guardEval.allowed) return reply.code(403).send({ verified: false, grounding: groundingResult, guard: guardEval, governance: governanceResult, output_governance: outputGovernanceResult, escalation: escalationResult, error: 'Action blocked by guard policy' });
      }
    }

    if (config.auditStore) {
      const entry = config.auditStore.append({
        agent_id: resolvedAgentId, action, resource, policy_eval: guardEval,
        payload_hash: createHash('sha256').update(JSON.stringify({ response: finalResponse, groundingResult, guardEval, governanceResult, outputGovernanceResult, escalationResult })).digest('hex'),
      });
      return { verified: guardEval.allowed, response: finalResponse, grounding: groundingResult, guard: guardEval, governance: governanceResult, output_governance: outputGovernanceResult, escalation: escalationResult, audit_id: entry.audit_id };
    }
    return { verified: guardEval.allowed, response: finalResponse, grounding: groundingResult, guard: guardEval, governance: governanceResult, output_governance: outputGovernanceResult, escalation: escalationResult, audit_id: null };
  });

  // ── Chat + Verify ─────────────────────────────────
  app.post('/v1/chat/verify', async (req, reply) => {
    if (!validateOrReply(ChatVerifyBodySchema, req.body, reply)) return;
    const { model, messages, sources, action, resource, agent_token, agent_id, max_tokens, temperature, governance, output_governance, escalation } = req.body as z.infer<typeof ChatVerifyBodySchema>;

    // 1. Document governance (pre-filter sources)
    let governanceResult: DocumentGovernanceResult | null = null;
    let filteredSources = sources;
    if (config.documentGovernanceEngine && governance?.rules?.length && sources?.length) {
      governanceResult = config.documentGovernanceEngine.filter(sources, governance);
      filteredSources = governanceResult.filtered_sources;
    }

    // 2. LLM call
    let llmResponse;
    try { llmResponse = await config.targetProvider.chat({
      model: model ?? (config.targetProvider.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini'),
      messages: messages as LLMMessage[], maxTokens: max_tokens, temperature: temperature,
    }); } catch (err) { return reply.code(502).send({ error: `LLM request failed: ${(err as Error).message}` }); }

    // 3. Output governance (citation check + content safety)
    let outputGovernanceResult: OutputGovernanceResult | null = null;
    if (config.outputGovernanceEngine && output_governance && filteredSources?.length) {
      outputGovernanceResult = config.outputGovernanceEngine.checkResponse(llmResponse.content, filteredSources, output_governance);
    }

    // 4. Grounding engine (hallucination detection)
    let groundingResult: GroundingResult | null = null;
    if (config.groundingEngine && filteredSources?.length) {
      try { groundingResult = await config.groundingEngine.verify({ response: llmResponse.content, sources: filteredSources }); } catch {
        groundingResult = null;
      }
    }

    // 5. Escalation (decide pass/correct/block based on all results)
    let escalationResult: EscalationResult | null = null;
    let finalResponse = llmResponse.content;
    if (config.escalationEngine && escalation?.rules?.length) {
      escalationResult = config.escalationEngine.evaluate(groundingResult, outputGovernanceResult, escalation);
      if (escalationResult.action === 'correct' && groundingResult) {
        try {
          finalResponse = await config.escalationEngine.correctResponse(llmResponse.content, groundingResult, filteredSources);
        } catch {
          escalationResult = { action: 'flag', message: 'Correction failed, flagged for review', triggered_by: 'correct_error' };
        }
      }
      if (escalationResult.action === 'block') {
        return { verified: false, response: finalResponse, grounding: groundingResult, guard: { allowed: true, reason: 'Blocked by escalation' }, governance: governanceResult, output_governance: outputGovernanceResult, escalation: escalationResult, audit_id: null };
      }
    }

    // 6. Guard engine (agent action check)
    let guardEval: PolicyEvaluation = { allowed: true, reason: 'No guard engine configured' };
    let resolvedAgentId = agent_id ?? config.defaultAgentId ?? 'unknown';

    if (config.guardEngine) {
      if (agent_token) { const r = config.guardEngine.verifyAction(agent_token, action, resource); guardEval = r.evaluation; if (r.agentId) resolvedAgentId = r.agentId; }
      else if (agent_id) { guardEval = config.guardEngine.evaluate(action, resource, agent_id); }
    }

    let auditId: string | null = null;
    if (config.auditStore) {
      const entry = config.auditStore.append({
        agent_id: resolvedAgentId, action: guardEval.allowed ? action : `${action}:blocked`, resource,
        policy_eval: guardEval, payload_hash: createHash('sha256').update(JSON.stringify({ messages, response: finalResponse, governanceResult, outputGovernanceResult, escalationResult })).digest('hex'),
      }); auditId = entry.audit_id;
    }

    if (!guardEval.allowed) return reply.code(403).send({ verified: false, response: finalResponse, grounding: groundingResult, guard: guardEval, audit_id: auditId, governance: governanceResult, output_governance: outputGovernanceResult, escalation: escalationResult });

    return {
      verified: true, response: finalResponse, grounding: groundingResult, guard: guardEval, governance: governanceResult, output_governance: outputGovernanceResult, escalation: escalationResult, audit_id: auditId,
      model: llmResponse.model, provider: llmResponse.provider,
      usage: llmResponse.usage ? { prompt_tokens: llmResponse.usage.promptTokens, completion_tokens: llmResponse.usage.completionTokens, total_tokens: llmResponse.usage.totalTokens } : undefined,
    };
  });

  // ── Agent Management ──────────────────────────────
  app.post('/v1/agents', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Guard engine not configured' });
    if (!validateOrReply(CreateAgentBodySchema, req.body, reply)) return;
    const { name, scope } = req.body as z.infer<typeof CreateAgentBodySchema>;
    return reply.code(201).send(config.guardEngine.registerAgent(name, scope));
  });
  app.get('/v1/agents', async () => config.guardEngine?.listAgents() ?? []);
  app.get<{ Params: { id: string } }>('/v1/agents/:id', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Not configured' });
    const agent = config.guardEngine.getAgent(req.params.id); if (!agent) return reply.code(404).send({ error: 'Agent not found' }); return agent;
  });
  app.delete<{ Params: { id: string } }>('/v1/agents/:id', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Not configured' });
    if (!config.guardEngine.revokeAgent(req.params.id)) return reply.code(404).send({ error: 'Agent not found' });
    return reply.code(204).send();
  });

  // ── Policies ──────────────────────────────────────
  app.post('/v1/policies', async (req, reply) => {
    if (!config.guardEngine) return reply.code(501).send({ error: 'Guard engine not configured' });
    if (!validateOrReply(PolicyBodySchema, req.body, reply)) return;
    config.guardEngine.setPolicy(req.body as unknown as Policy); return reply.code(201).send({ status: 'Policy set' });
  });
  app.get('/v1/policies', async () => config.guardEngine?.listPolicies() ?? []);
  app.post('/v1/evaluate', async (req, reply) => {
    if (!config.guardEngine) return { allowed: true, reason: 'Guard engine not configured' };
    if (!validateOrReply(EvaluateBodySchema, req.body, reply)) return;
    const { action, resource, agent_id } = req.body as z.infer<typeof EvaluateBodySchema>;
    return config.guardEngine.evaluate(action, resource, agent_id);
  });
  app.post('/v1/verify-action', async (req, reply) => {
    if (!config.guardEngine) return { allowed: true, evaluation: { allowed: true, reason: 'No guard engine' } };
    if (!validateOrReply(VerifyActionBodySchema, req.body, reply)) return;
    const { token, action, resource } = req.body as z.infer<typeof VerifyActionBodySchema>;
    return config.guardEngine.verifyAction(token, action, resource);
  });

  // ── Audit Log ─────────────────────────────────────
  app.get('/v1/audit', async (req) => {
    if (!config.auditStore) return [];
    const q = req.query as Record<string, string>; return config.auditStore.query({
      agent_id: q.agent_id, action: q.action, resource: q.resource, since: q.since, until: q.until,
      limit: q.limit ? parseInt(q.limit, 10) : undefined, offset: q.offset ? parseInt(q.offset, 10) : undefined,
    });
  });
  app.get('/v1/audit/count', async (req) => {
    if (!config.auditStore) return { count: 0 };
    const q = req.query as Record<string, string>; return { count: config.auditStore.count({ agent_id: q.agent_id }) };
  });
  app.get('/v1/audit/chain/verify', async () => {
    if (!config.auditStore) return { valid: true, error: 'No audit store' };
    return config.auditStore.verifyChain();
  });
  app.get<{ Params: { id: string } }>('/v1/audit/:id', async (req, reply) => {
    if (!config.auditStore) return reply.code(501).send({ error: 'Not configured' });
    const entry = config.auditStore.getByAuditId(req.params.id); if (!entry) return reply.code(404).send({ error: 'Audit entry not found' }); return entry;
  });

  // ── Recent Verifications (monitor) ────────────────
  app.get('/v1/recent', async () => recentBuffer);

  // ── Audit Executive Summary ─────────────────────
  app.get('/v1/audit/summary', async () => {
    return computeSummary(recentBuffer);
  });

  return app;
}
