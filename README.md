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

## One-Command Startup (Docker)

```bash
# Copy env config (edit if using cloud providers)
cp .env.example .env

# Build and start everything
docker compose up --build
```

The proxy starts on `http://localhost:3000` and the dashboard on `http://localhost:5173`.

### Quick demo

```bash
# In another terminal, register an agent and set policies:
curl -X POST http://localhost:3000/v1/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "hr-bot", "scope": "hr:read"}'

curl -X POST http://localhost:3000/v1/policies \
  -H "Content-Type: application/json" \
  -d '{"agent": "hr-bot", "allow": [{"action": "read", "resource": "*"}]}'

# Verify an action:
curl -X POST http://localhost:3000/v1/evaluate \
  -H "Content-Type: application/json" \
  -d '{"action": "read", "resource": "employee-records/123", "agent_id": "hr-bot"}'

# Check the audit log:
curl http://localhost:3000/v1/audit

# Full verification (chat + ground + guard):
curl -X POST http://localhost:3000/v1/chat/verify \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Tell me about John Doe"}],
    "sources": [{"id": "src1", "title": "Records", "content": "John Doe is an engineer."}],
    "action": "read",
    "resource": "employee-records/john-doe"
  }'
```

## Development (without Docker)

```bash
# Install, build, copy config
npm install
npm run build
cp .env.example .env

# Run the proxy directly
npx tsx packages/trust-proxy/src/start.ts

# Or use watch mode
npm run dev
```

```bash
npm run build     # Build all packages
npm run typecheck # TypeScript checks
npm run lint      # Lint all packages
npm test          # Run tests (61+ passing)
```

## API

See [`docs/openapi.yaml`](docs/openapi.yaml) for the full API specification.

| Endpoint | Description |
|---|---|
| `POST /v1/chat` | Proxy to target LLM |
| `POST /v1/verify` | Grounding + guard on an existing response |
| `POST /v1/chat/verify` | Full pipeline: chat → ground → guard → audit |
| `POST /v1/agents` | Register a new agent |
| `POST /v1/policies` | Set a policy |
| `POST /v1/evaluate` | Evaluate an action against policies |
| `GET /v1/audit` | Query audit log |

## License

Private — internal use.
