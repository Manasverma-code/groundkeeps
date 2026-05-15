export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'deepseek' | 'together' | 'openrouter' | 'ollama';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: ProviderName;
}

export interface ProviderConfig {
  name: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
}

export interface LLMProvider {
  readonly name: ProviderName;
  chat(request: ChatRequest): Promise<ChatResponse>;
}
