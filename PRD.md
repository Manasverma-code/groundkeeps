# PRD: Trust Layer for Enterprise AI

## 1. Elevator Pitch

A middleware layer that sits between LLMs and enterprise systems, verifying that every answer is grounded in real data and every action stays within policy. Solves the two reasons enterprises won't deploy AI: they can't trust the answers, and they can't control the actions.

## 2. Problem

### 2.1 RAG Reliability Crisis
- 100% false positive rate on hallucination detection using embedding methods
- No production-grade evaluation without ground truth
- Compounding errors across pipeline stages
- Knowledge conflicts silently resolved (usually wrong)
- 10^23 configuration space with no automated optimization

### 2.2 Agent Governance Void
- AI agents have no persistent identity, scoped authority, or audit trail
- No framework for "who is this agent, what can it do, who answers when it fails"
- Enterprises manually reviewing every agent action defeats the purpose
- Regulatory pressure (EU AI Act, HIPAA, SOX) requires auditable AI decisions

## 3. Target Market

- **Primary**: Regulated enterprises (healthcare, finance, insurance, legal, defense)
- **Secondary**: SaaS companies embedding AI features
- **TAM**: $8B (AI observability $3B + AI governance $5B by 2028)

## 4. Product Overview

A middleware API layer with two engines:

### 4.1 Grounding Engine (RAG Reliability)
- Real-time hallucination detection using reasoning-based verification (not embeddings)
- Automated RAG pipeline evaluation without ground truth labels
- Knowledge conflict resolution with transparent source ranking
- Temporal awareness (flags outdated evidence)
- Configuration optimization across retrieval, chunking, and generation params

### 4.2 Guard Engine (Agent Governance)
- Agent identity management (scoped credentials, not static API keys)
- Declarative permission policies (can read X, can write Y, cannot delete)
- Real-time action verification before execution
- Full audit trail per agent, per action
- Compliance reporting (EU AI Act, HIPAA, SOC 2)

## 5. User Flow

1. **Onboard**: Connect data sources + define permission policies
2. **Instrument**: Replace direct LLM calls with proxy to our API
3. **Monitor**: Dashboard shows accuracy, hallucination rate, blocked actions, compliance status
4. **Iterate**: Flagged hallucinations feed back into pipeline tuning

## 6. Key Metrics

| Metric | Target |
|---|---|
| Hallucination detection FPR | <5% (vs 100% for embedding methods) |
| Knowledge conflict resolution accuracy | >95% |
| Agent action verification latency | <200ms |
| False positive rate on policy blocks | <1% |
| Time to first value (TTFV) | <1 hour integration |

## 7. Technical Architecture

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

- **Proxy service** — intercepts LLM calls, adds verification
- **Verification models** — fine-tuned smaller LLMs for fact-checking (runs on-prem)
- **Policy engine** — declarative rules, compiled to decision trees
- **Audit store** — append-only log, WAL-based
- **Dashboard** — React frontend, real-time metrics

## 8. MVP Scope (3 months)

- RAG grounding engine: hallucination detection + source ranking
- Guard engine: basic policy enforcement (allow/deny based on tags)
- API proxy for OpenAI and Anthropic
- Dashboard with accuracy metrics and blocked action log
- 5 pilot customers in healthcare or fintech

## 9. Defensibility

- **Data moat**: Every verification improves the detection models (feedback loop)
- **Switching cost**: Embedded proxy replaces direct LLM calls
- **Regulatory moat**: Compliance certifications take 12-18 months to replicate
- **Workflow lock-in**: Policies, audit trails, and ground truth data are non-portable

## 10. Revenue Model

- **Usage-based**: $0.001 per verification call
- **Enterprise tier**: $10K/mo for on-prem deployment + compliance reporting
- **Typical ACV**: $50-120K/year for mid-market enterprise

## 11. Competition

| Competitor | Focus | Gap |
|---|---|---|
| Arize / Helicone | LLM observability | No governance or grounding |
| Keycard / DoNotPay | Agent security | No RAG reliability |
| Guardrails AI | LLM output guardrails | No grounding engine |
| Vectara / Voiceflow | RAG pipelines | No governance |

## 12. Risks

- **Latency cost**: Two verification passes per query could make it too slow
- **Model dependency**: Detection accuracy tied to underlying verification model quality
- **Enterprise sales cycle**: 6-12 month procurement in regulated industries
- **Pricing pressure**: LLM providers may bundle similar features for free

---

## 13. Production Deployment Checklist

### 13.1 VPS Setup (Oracle Free Tier)
- [ ] SSH into the Oracle VPS
- [ ] Update system: `sudo apt update && sudo apt upgrade -y`
- [ ] Install Docker: `curl -fsSL https://get.docker.com | sudo bash`
- [ ] Install Git: `sudo apt install -y git`
- [ ] Clone & build: `git clone https://github.com/Manasverma-code/groundkeeps.git /opt/groundkeeps && cd /opt/groundkeeps && npm install && npm run build`

### 13.2 DNS
- [ ] A record: `license.groundkeeps.in` → `<oracle-vps-ip>`
- [ ] A record: `api.groundkeeps.in` → `<oracle-vps-ip>` (main proxy)

### 13.3 License Server
- [ ] Run: `bash scripts/deploy-license-server.sh`
- [ ] Save the generated **ADMIN_KEY**
- [ ] Verify: `curl https://license.groundkeeps.in/v1/health`

### 13.4 Razorpay Webhook
- [ ] Go to Razorpay Dashboard → Settings → Webhooks
- [ ] URL: `https://license.groundkeeps.in/v1/webhook/razorpay`
- [ ] Generate secret: `openssl rand -hex 32`
- [ ] Paste in Razorpay Secret field AND server `.env` as `RAZORPAY_WEBHOOK_SECRET`
- [ ] Select event: **`payment.captured`**
- [ ] Alert email: `hello@groundkeeps.in` (or your email)

### 13.5 Main Proxy (if deploying)
- [ ] Run: `bash scripts/deploy.sh`
- [ ] Set `LICENSE_SERVER_URL=https://license.groundkeeps.in` in `.env.prod`
- [ ] Set `LICENSE_KEY` for pro (or leave blank for free)
