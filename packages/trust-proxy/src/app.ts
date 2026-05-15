import Fastify from 'fastify';
import type { LLMProvider, ChatRequest, LLMMessage } from '@trust-layer/providers';

interface ProxyConfig {
  targetProvider: LLMProvider;
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
      model: model ?? config.targetProvider.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini',
      messages: messages as LLMMessage[],
      maxTokens: max_tokens,
      temperature: temperature,
    };

    const response = await config.targetProvider.chat(chatRequest);

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
