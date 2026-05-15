# Integration Guide

Add Trust Layer to your AI application in under 5 minutes.

## Architecture

```
Your App → Trust Layer Proxy → LLM Provider (OpenAI, Anthropic, etc.)
               │
          ┌────┴────┐
       Grounding  Guard
       Engine     Engine
          └────┬────┘
           Audit Store
```

## Quick Start

### 1. Start the proxy

```bash
# Using Docker (recommended)
cp .env.example .env
docker compose up --build

# Or directly with Node.js
npm install && npm run build
cp .env.example .env
npx tsx packages/trust-proxy/src/start.ts
```

The proxy starts on `http://localhost:3000`.

### 2. Register an agent

```bash
curl -X POST http://localhost:3000/v1/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app", "scope": "read"}'
```

Save the returned `agent_id`, `client_secret`, and `token`.

### 3. Set a policy

```bash
curl -X POST http://localhost:3000/v1/policies \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "my-app",
    "allow": [{"action": "read", "resource": "documents/*"}],
    "deny": [{"action": "delete", "resource": "*"}]
  }'
```

### 4. Make a verified LLM call

```bash
curl -X POST http://localhost:3000/v1/chat/verify \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What is the capital of France?"}],
    "sources": [{"id": "wiki-1", "title": "Wikipedia", "content": "Paris is the capital of France."}],
    "action": "read",
    "resource": "documents/faq",
    "agent_token": "<token from step 2>"
  }'
```

## Integration Patterns

### Pattern A: Proxy existing LLM calls (drop-in)

Replace your direct LLM API calls with Trust Layer proxy calls. Uses the same format.

**Before:**
```python
# Direct OpenAI call
response = openai.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}]
)
```

**After:**
```python
# Proxied through Trust Layer
response = requests.post("http://localhost:3000/v1/chat", json={
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
})
```

### Pattern B: Verify existing responses

Already have an LLM response? Send it through the grounding engine.

```bash
curl -X POST http://localhost:3000/v1/verify \
  -H "Content-Type: application/json" \
  -d '{
    "response": "Paris is the capital of France. It has a population of 2 million.",
    "sources": [{"id": "wiki", "title": "Wiki", "content": "Paris is the capital of France."}],
    "action": "read",
    "resource": "documents/answer"
  }'
```

### Pattern C: Full pipeline (chat + verify)

Single call: chat with LLM → ground against sources → check policy → audit log.

```bash
curl -X POST http://localhost:3000/v1/chat/verify \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Summarize the patient record"}],
    "sources": [{"id": "emr-1", "title": "Patient Record", "content": "..."}],
    "action": "read",
    "resource": "emr/patient-123",
    "agent_token": "<token>"
  }'
```

## API Reference

### `POST /v1/chat`
Proxy to target LLM. Same format as OpenAI chat completions.

### `POST /v1/verify`
Ground + guard an existing response.

| Field | Type | Required | Description |
|---|---|---|---|
| `response` | string | yes | LLM response text to verify |
| `sources` | array | yes | Source documents to check against |
| `action` | string | yes | Action being performed (read/write/delete/execute) |
| `resource` | string | yes | Target resource path |
| `agent_token` | string | no | JWT token for guard evaluation |
| `agent_id` | string | no | Agent ID for direct policy lookup |

### `POST /v1/chat/verify`
Full pipeline. All `/v1/verify` fields + chat fields.

| Field | Type | Required | Description |
|---|---|---|---|
| `messages` | array | yes | Chat messages (OpenAI format) |
| `model` | string | no | LLM model override |
| `sources` | array | yes | Source documents |
| `action` | string | yes | Action being performed |
| `resource` | string | yes | Target resource |

### `POST /v1/agents`
Register a new agent.

### `POST /v1/policies`
Set a policy rule.

### `GET /v1/audit`
Query the audit log.

| Query param | Type | Description |
|---|---|---|
| `agent_id` | string | Filter by agent |
| `action` | string | Filter by action |
| `limit` | integer | Max entries (default 50, max 1000) |
| `offset` | integer | Pagination offset |

## Response Format

### Success

```json
{
  "verified": true,
  "response": "Paris is the capital of France.",
  "grounding": {
    "hallucination_score": 0,
    "claims": [
      {"text": "Paris is the capital of France.", "supported": true, "confidence": 0.98}
    ],
    "ranked_sources": [...],
    "conflicts": []
  },
  "guard": {
    "allowed": true,
    "reason": "Allowed by policy: read documents/*"
  },
  "audit_id": "uuid-here"
}
```

### Blocked by guard

```json
{
  "verified": false,
  "error": "Action blocked by guard policy",
  "guard": {
    "allowed": false,
    "reason": "Denied by policy: delete *",
    "matched_rule": "deny:delete:*"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TARGET_LLM_PROVIDER` | `ollama` | LLM behind the proxy |
| `TARGET_LLM_API_KEY` | — | API key for the target LLM |
| `TARGET_LLM_MODEL` | `llama3.2` | Model name for target LLM |
| `VERIFIER_LLM_PROVIDER` | `ollama` | LLM for fact-checking |
| `VERIFIER_LLM_API_KEY` | — | API key for verifier LLM |
| `VERIFIER_LLM_MODEL` | `llama3.2` | Model for verifier |
| `PROXY_PORT` | `3000` | HTTP port |
| `AUDIT_DB_PATH` | `:memory:` | SQLite path for audit log |

## Supported LLM Providers

| Provider | Config Value | Key Required | Free Tier |
|---|---|---|---|
| OpenAI | `openai` | Yes | No |
| Anthropic | `anthropic` | Yes | No |
| Google Gemini | `gemini` | Yes | Yes (60 req/min) |
| Groq | `groq` | Yes | Yes (30 req/min) |
| DeepSeek | `deepseek` | Yes | No (cheap) |
| Together | `together` | Yes | No |
| OpenRouter | `openrouter` | Yes | Has free models |
| Ollama (local) | `ollama` | No | Yes |
