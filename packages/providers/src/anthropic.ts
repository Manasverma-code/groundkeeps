import type { LLMProvider, ProviderConfig, ChatRequest, ChatResponse } from './types.js';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic' as const;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com/v1';

    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: request.model,
      messages: nonSystemMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
    if (systemMessages.length > 0) {
      body.system = systemMessages.map((m) => ({ type: 'text', text: m.content }));
    }
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`[anthropic] ${response.status} ${response.statusText}: ${error}`);
    }

    const data = (await response.json()) as {
      content: { text: string }[];
      model: string;
      usage?: { input_tokens: number; output_tokens: number };
    };

    return {
      content: data.content.map((c) => c.text).join(''),
      model: data.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
      provider: 'anthropic',
    };
  }
}
