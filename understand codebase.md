Quick understanding of this repository
This codebase is a TypeScript monorepo for a “trust layer” around LLMs. In plain English, it sits between an application and an LLM and makes sure:

the LLM’s answer is grounded in real sources,
the agent’s action is allowed by policy,
every decision is logged for audit and compliance.
The main flow is:

a request arrives at the proxy service,
the proxy runs grounding, governance, and guard checks,
it writes an audit trail,
it returns a verified response or blocks the action.

important files to understand the codebase.

README.md – repo overview
PRD.md – product and architecture intent
package.json – monorepo/workspaces
start.ts – app bootstrap
app.ts – main request pipeline
validation.ts – API request schemas
engine.ts – grounding core
claim-extractor.ts – claim extraction
verifier.ts – claim verification
engine.ts – guard core
policy-engine.ts – policy evaluation logic
store.ts – audit log implementation
types.ts – shared domain types
factory.ts – provider abstraction
app.tsx – frontend entry point


####Mental model of the repo
      Think of the system as three layers:

Input layer: proxy API and LLM provider integration
Trust layer: grounding, governance, escalation, and guard checks
Safety layer: audit storage, policy enforcement, and monitoring
