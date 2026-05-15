import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import type { LLMProvider, ChatRequest, LLMMessage } from '@trust-layer/providers';
import type { AuditStore } from '@trust-layer/audit-store';

interface ProxyConfig {
  targetProvider: LLMProvider;
  auditStore?: AuditStore;
  agentId?: string;
}

export async function createApp(config: ProxyConfig) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'trust-proxy' }));

  app.post<{
    Body: {
      model?: string;
      messages: { role: string; content: string }[];
      max_tokens?: number;
      temperature?: number;
    };
  }>('/v1/chat', async (req, reply) => {
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
        agent_id: config.agentId ?? 'unknown',
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
          message: {
            role: 'assistant',
            content: response.content,
          },
          finish_reason: 'stop',
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

  return app;
}
