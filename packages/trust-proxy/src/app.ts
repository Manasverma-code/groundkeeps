import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import type { LLMProvider, ChatRequest, LLMMessage } from '@trust-layer/providers';
import type { AuditStore } from '@trust-layer/audit-store';
import type { GroundingEngine } from '@trust-layer/grounding-engine';
import type { GuardEngine } from '@trust-layer/guard-engine';
import type { SourceDocument, PolicyEvaluation } from '@trust-layer/shared';

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

  return app;
}
