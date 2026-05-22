# Contributing

Thanks for your interest in groundkeeps!

## Getting Started

```bash
git clone https://github.com/Manasverma-code/groundkeeps.git
cd groundkeeps
npm install
npm run build
npm test
```

## Project Structure

```
packages/
  shared/          — TypeScript types shared across all packages
  providers/       — LLM provider abstraction (8 providers)
  trust-proxy/     — Fastify server with all API routes
  grounding-engine — Hallucination detection, source ranking, conflict resolution
  guard-engine/    — Agent identity, JWT tokens, policy evaluation
  audit-store/     — WAL-based SQLite audit log with SHA-256 chain
  dashboard/       — React frontend (Vite + Recharts)
scripts/           — Launch scripts, demo seeder, benchmarks
docs/              — Integration guide, OpenAPI spec, examples
```

## Before Submitting a PR

```bash
npm run build       # Must pass
npm run typecheck   # Must pass
npm run lint        # Must pass
npm test            # Must pass (78 tests)
```

## Code Style

- TypeScript with strict mode
- ES modules (`import`/`export`)
- No semicolons (Prettier manages this)
- Single quotes
- 100 char print width

## Need Help?

Open an issue or start a discussion on GitHub.
