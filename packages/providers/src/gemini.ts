import type { LLMProvider, ProviderConfig, ChatRequest, ChatResponse } from './types.js';

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const baseUrl = this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const url = `${baseUrl}/models/${request.model}:generateContent?key=${this.config.apiKey ?? ''}`;

    const body: Record<string, unknown> = {
      contents: [
        {
          parts: request.messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({
              text: m.content,
            })),
        },
      ],
    };

    const systemMessages = request.messages.filter((m) => m.role === 'system');
    if (systemMessages.length > 0) {
      body.systemInstruction = {
        parts: systemMessages.map((m) => ({ text: m.content })),
      };
    }

    if (request.temperature !== undefined) {
      body.generationConfig = { temperature: request.temperature };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === 'AbortError') {
        throw new Error('[gemini] Request timed out after 120s');
      }
      throw err;
    }
    clearTimeout(timer);

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new Error(`[gemini] ${response.status} ${response.statusText}: ${error}`);
    }

    const data = (await response.json()) as {
      candidates?: { content: { parts: { text: string }[] } }[];
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
    };

    const content =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';

    return {
      content,
      model: request.model,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          }
        : undefined,
      provider: 'gemini',
    };
  }
}
