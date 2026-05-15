# Trust Layer

Middleware that verifies LLM outputs are grounded in real data and ensures agent actions stay within policy. Plugs between any LLM and enterprise systems.

## Architecture

```
User Query → LLM → [Trust Layer] → Enterprise System
                        │
               ┌────────┴────────┐
           Grounding Engine   Guard Engine
               │                   │
         - fact check          - identity
         - source rank         - policy eval
         - conflict resolve    - action verify
         - temporal check      - audit log
               │                   │
               └────────┬────────┘
                   Unified API
```

## Packages

| Package | Description |
|---|---|
| `@trust-layer/shared` | Shared TypeScript types and interfaces |
| `@trust-layer/providers` | LLM provider abstraction (OpenAI, Anthropic, Gemini, Groq, Ollama, etc.) |
| `@trust-layer/trust-proxy` | Fastify proxy that intercepts LLM calls |
| `@trust-layer/grounding-engine` | Hallucination detection and source ranking |
| `@trust-layer/guard-engine` | Policy enforcement and agent governance |
| `@trust-layer/audit-store` | Append-only WAL-based audit log |
| `@trust-layer/dashboard` | React frontend for monitoring |

## Quick Start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Set up your LLM provider (copy and edit)
cp .env.example .env
```

### Zero-cost local dev (Ollama)

```env
TARGET_LLM_PROVIDER=ollama
VERIFIER_LLM_PROVIDER=ollama
```

### Using cloud providers

```env
TARGET_LLM_PROVIDER=groq
TARGET_LLM_API_KEY=gsk_...
TARGET_LLM_MODEL=llama-3.3-70b-versatile

VERIFIER_LLM_PROVIDER=openai
VERIFIER_LLM_API_KEY=sk-...
VERIFIER_LLM_MODEL=gpt-4o-mini
```

## Development

```bash
npm run dev       # Start all packages in watch mode
npm run build     # Build all packages
npm run typecheck # TypeScript checks
npm run lint      # Lint all packages
npm test          # Run tests
```

## API

See [`docs/openapi.yaml`](docs/openapi.yaml) for the full API specification.

## License

Private — internal use.
