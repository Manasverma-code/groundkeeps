import type { LLMProvider } from '@trust-layer/providers';
import type { Claim, SourceDocument } from '@trust-layer/shared';

export class ClaimVerifier {
  constructor(private verifier: LLMProvider) {}

  async verify(claims: string[], sources: SourceDocument[]): Promise<Claim[]> {
    if (claims.length === 0) return [];
    if (sources.length === 0) {
      return claims.map((text) => ({
        text,
        supported: false,
        confidence: 0,
        reason: 'No sources provided for verification',
      }));
    }

    const model = this.verifier.name === 'ollama' ? 'llama3.2' : 'gpt-4o-mini';
    const sourceContext = this.formatSources(sources);
    const claimsText = claims.map((c, i) => `${i + 1}. ${c}`).join('\n');

    const result = await this.verifier.chat({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a factual verification system. For each claim, determine if it is SUPPORTED or UNSUPPORTED by the provided sources.

Return ONLY a valid JSON array with objects:
{
  "text": "the claim text",
  "supported": true/false,
  "confidence": 0.0-1.0,
  "source": "source_id or null if unsupported",
  "reason": "brief explanation"
}

Be conservative: mark as unsupported if the source doesn't clearly support the claim.`,
        },
        {
          role: 'user',
          content: `SOURCES:\n${sourceContext}\n\nCLAIMS:\n${claimsText}`,
        },
      ],
      temperature: 0,
    });

    return this.tryParseClaims(result.content, claims);
  }

  private formatSources(sources: SourceDocument[]): string {
    return sources
      .map((s) => `[ID: ${s.id}]\nTitle: ${s.title}\nContent: ${s.content}\n`)
      .join('\n---\n');
  }

  private tryParseClaims(content: string, fallbackClaims: string[]): Claim[] {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as unknown[];
        if (Array.isArray(parsed)) {
          const result: Claim[] = [];
          for (const item of parsed) {
            if (typeof item === 'object' && item !== null) {
              const c = item as Record<string, unknown>;
              const text = String(c.text ?? '');
              if (text.length > 0) {
                result.push({
                  text,
                  supported: Boolean(c.supported ?? false),
                  confidence: Number(c.confidence ?? 0),
                  source: c.source ? String(c.source) : undefined,
                  reason: c.reason ? String(c.reason) : undefined,
                });
              }
            }
          }
          return result;
        }
      } catch {
        /* fall through */
      }
    }

    return fallbackClaims.map((text) => ({
      text,
      supported: false,
      confidence: 0,
      reason: 'Failed to parse verification result',
    }));
  }
}
