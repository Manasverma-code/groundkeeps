#!/usr/bin/env bash
# Trust Layer — Curl Demo Script
# Run against a running proxy at http://localhost:3000
set -e

BASE="http://localhost:3000"
echo "=== Trust Layer Demo ==="
echo ""

# 1. Health check
echo "1. Health check"
curl -s "$BASE/health" | jq .
echo ""

# 2. Register an agent
echo "2. Register agent"
AGENT_RESP=$(curl -s -X POST "$BASE/v1/agents" \
  -H "Content-Type: application/json" \
  -d '{"name": "hr-bot", "scope": "hr:read"}')
echo "$AGENT_RESP" | jq .
AGENT_ID=$(echo "$AGENT_RESP" | jq -r '.agent_id')
TOKEN=$(echo "$AGENT_RESP" | jq -r '.token')
echo ""

# 3. Set a policy
echo "3. Set policy"
curl -s -X POST "$BASE/v1/policies" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "hr-bot",
    "allow": [{"action": "read", "resource": "employee-records/*"}],
    "deny": [{"action": "delete", "resource": "*"}]
  }' | jq .
echo ""

# 4. Chat (proxy to LLM)
echo "4. Chat (proxy to LLM)"
curl -s -X POST "$BASE/v1/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Say hello in one word"}]
  }' | jq '{id, model, provider, choices: [.choices[0].message]}'
echo ""

# 5. Verify an existing response
echo "5. Verify an existing response"
curl -s -X POST "$BASE/v1/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "response": "Paris is the capital of France.",
    "sources": [{"id": "wiki", "title": "Wikipedia", "content": "Paris is the capital of France."}],
    "action": "read",
    "resource": "documents/faq",
    "agent_token": "'"$TOKEN"'"
  }' | jq '{verified, hallucination_score: .grounding.hallucination_score, guard_allowed: .guard.allowed, audit_id}'
echo ""

# 6. Check audit log
echo "6. Audit log (last 5 entries)"
curl -s "$BASE/v1/audit?limit=5" | jq '.[] | {time: .timestamp, action: .action, resource: .resource, allowed: .policy_eval.allowed}'
echo ""

echo "=== Demo Complete ==="
