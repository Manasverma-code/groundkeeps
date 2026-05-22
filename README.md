# Ground-Keeps

**Trust layer for enterprise AI.** Verifies LLM outputs are grounded in real data and ensures agent actions stay within policy.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-78-passing-green.svg)](https://github.com/Manasverma-code/Ground-Keeps/actions)
[![Node](https://img.shields.io/badge/node-%3E%3D20-blue.svg)](package.json)
[![Vercel](https://img.shields.io/badge/landing%20page-live-8B6F4E.svg)](https://ground-keeps.vercel.app)
[![PRs](https://img.shields.io/badge/PRs-welcome-8B6F4E.svg)](CONTRIBUTING.md)

```bash
docker compose up --build
curl http://localhost:3000/health
# → {"status":"ok","service":"trust-proxy"}
```

## Performance

| Metric | p95 | Target | Status |
|---|---|---|---|
| Guard policy evaluation | **<0.01ms** | <200ms | ✅ |
| Token verification + eval | **0.02ms** | <200ms | ✅ |
| Audit append | **0.47ms** | — | ✅ |
| Chain verify (500 entries) | **3.48ms** | — | ✅ |

[Run benchmarks yourself](scripts/benchmark.mjs)

## Architecture

```
Your App → Trust Proxy → LLM Provider (OpenAI, Anthropic, Ollama, etc.)
               │
          ┌────┴────┐
       Grounding  Guard
       Engine     Engine
          └────┬────┘
           Audit Store
```

## Quick Start

```bash
git clone https://github.com/Manasverma-code/Ground-Keeps.git
cd Ground-Keeps
docker compose up --build
```

Or use the launch script:

```bash
# Windows
.\scripts\launch.ps1

# Mac / Linux
bash scripts/launch.sh
```

## Packages

| Package | Description |
|---|---|
| `@trust-layer/trust-proxy` | Fastify proxy — all engines unified |
| `@trust-layer/grounding-engine` | Hallucination detection + source ranking |
| `@trust-layer/guard-engine` | Agent identity + policy enforcement |
| `@trust-layer/audit-store` | Append-only WAL audit log (SHA-256 chain) |
| `@trust-layer/providers` | LLM provider abstraction (8 providers) |
| `@trust-layer/dashboard` | React dashboard (dark/light theme) |
| `@trust-layer/shared` | Shared TypeScript types |

## Supported LLM Providers

| Provider | Config | Free tier |
|---|---|---|
| Ollama (local) | `ollama` | ✅ Yes |
| Groq | `groq` | ✅ 30 req/min |
| Google Gemini | `gemini` | ✅ 60 req/min |
| OpenAI | `openai` | ❌ |
| Anthropic | `anthropic` | ❌ |
| DeepSeek | `deepseek` | ❌ (cheap) |
| Together | `together` | ❌ |
| OpenRouter | `openrouter` | ✅ Some free models |

## API

| Endpoint | Description |
|---|---|
| `POST /v1/chat` | Proxy to target LLM |
| `POST /v1/verify` | Ground + guard an existing response |
| `POST /v1/chat/verify` | Full pipeline: chat → ground → guard → audit |
| `POST /v1/agents` | Register a new agent |
| `POST /v1/policies` | Set allow/deny policy |
| `POST /v1/evaluate` | Evaluate action against policies |
| `GET /v1/audit` | Query audit log (paginated, filterable) |
| `GET /v1/audit/chain/verify` | Verify SHA-256 chain integrity |

## Development

```bash
npm install
npm run build
npm test          # 78 tests
npm run typecheck # Full TypeScript check
```

## License

MIT — see [LICENSE](LICENSE)
