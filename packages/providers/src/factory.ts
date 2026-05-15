import type { LLMProvider, ProviderConfig, ProviderName } from './types.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';

const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  'openai', 'groq', 'deepseek', 'together', 'openrouter', 'ollama',
]);

export function createProvider(config: ProviderConfig): LLMProvider {
  if (config.name === 'anthropic') {
    return new AnthropicProvider(config);
  }
  if (config.name === 'gemini') {
    return new GeminiProvider(config);
  }
  if (OPENAI_COMPATIBLE_PROVIDERS.has(config.name)) {
    return new OpenAICompatibleProvider(config);
  }
  throw new Error(`Unknown provider: ${config.name}`);
}

export function providerFromEnv(prefix: string = 'LLM'): ProviderConfig {
  const name = (process.env[`${prefix}_PROVIDER`] ?? 'openai') as ProviderName;
  return {
    name: name,
    apiKey: process.env[`${prefix}_API_KEY`],
    baseUrl: process.env[`${prefix}_BASE_URL`],
    defaultModel: process.env[`${prefix}_MODEL`] ?? getDefaultModel(name),
  };
}

function getDefaultModel(name: string): string {
  const defaults: Record<string, string> = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-haiku-20240307',
    gemini: 'gemini-2.0-flash',
    groq: 'llama-3.3-70b-versatile',
    deepseek: 'deepseek-chat',
    together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    openrouter: 'openai/gpt-4o-mini',
    ollama: 'llama3.2',
  };
  return defaults[name] ?? 'gpt-4o-mini';
}
