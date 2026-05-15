import type { LLMProvider } from '@trust-layer/providers';

export interface ExtractionResult {
  claims: string[];
  raw: string;
}

export class ClaimExtractor {
  constructor(private verifier: LLMProvider) {}

  async extract(response: string): Promise<ExtractionResult> {
    const model = this.resolveModel();
    const result = await this.verifier.chat({
      model,
      messages: [
        {
          role: 'system',
          content: `Extract factual claims from the following text. Return ONLY a valid JSON array of strings. Each string must be one verifiable claim — a statement of fact that can be checked against sources. Do NOT include opinions, predictions, or suggestions. Example: ["The capital of France is Paris.", "Water boils at 100°C at sea level."]`,
        },
        { role: 'user', content: response },
      ],
      temperature: 0,
    });

    const claims = this.tryParseJson(result.content);
    return { claims, raw: result.content };
  }

  private tryParseJson(content: string): string[] {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as unknown;
        if (Array.isArray(parsed) && parsed.every((c) => typeof c === 'string')) {
          return parsed;
        }
      } catch {
        /* fall through to regex */
      }
    }

    return this.extractFallback(content);
  }

  private extractFallback(content: string): string[] {
    const lines = content.split('\n').filter((l) => l.trim());
    const claims: string[] = [];

    for (const line of lines) {
      const cleaned = line.replace(/^[\d\-.)]+\s*/, '').trim();
      if (cleaned.length > 10 && !cleaned.startsWith('{') && !cleaned.startsWith('[')) {
        claims.push(cleaned);
      }
    }

    if (claims.length === 1 && !/^[A-Z]/.test(claims[0])) {
      return [];
    }

    return claims;
  }

  private resolveModel(): string {
    return this.verifier.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini';
  }
}
