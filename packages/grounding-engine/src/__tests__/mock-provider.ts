import type { LLMProvider, ChatRequest, ChatResponse, ProviderName } from '@trust-layer/providers';

type ResponseHandler = (request: ChatRequest) => string;

export class MockLLMProvider implements LLMProvider {
  readonly name: ProviderName = 'openai';
  private handler: ResponseHandler;

  constructor(handler: ResponseHandler) {
    this.handler = handler;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return {
      content: this.handler(request),
      model: 'mock-model',
      provider: 'openai',
    };
  }
}

export function claimExtractionResponse(claims: string[]): string {
  return JSON.stringify(claims);
}

export function verificationResponse(claims: { text: string; supported: boolean; confidence: number; source?: string; reason?: string }[]): string {
  return JSON.stringify(claims);
}
