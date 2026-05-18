import type { LLMProvider, ProviderConfig, ChatRequest, ChatResponse, ProviderName } from './types.js';

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  together: 'https://api.together.xyz/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
};

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: ProviderName;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const baseUrl = this.config.baseUrl ?? PROVIDER_BASE_URLS[this.config.name] ?? PROVIDER_BASE_URLS.openai;
    const url = `${baseUrl}/chat/completions`;
    const timeoutMs = 120_000;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    if (this.config.name === 'openrouter') {
      headers['HTTP-Referer'] = 'https://trust-layer.dev';
      headers['X-Title'] = 'Trust Layer';
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
    };
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === 'AbortError') {
        throw new Error(`[${this.config.name}] Request timed out after ${timeoutMs / 1000}s`);
      }
      throw err;
    }
    clearTimeout(timer);

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`[${this.config.name}] ${response.status} ${response.statusText}: ${error}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
      model: string;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? '',
      model: data.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
      provider: this.config.name as ProviderName,
    };
  }
}
