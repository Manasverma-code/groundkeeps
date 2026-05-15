/**
 * Trust Layer — Node.js Client Example
 *
 * Usage:
 *   node nodejs_client.mjs
 */

const BASE_URL = 'http://localhost:3000';

class TrustLayerClient {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok && options.method !== 'POST' || res.status >= 500) {
      if (!res.ok) {
        const err = await res.text().catch(() => 'Unknown error');
        throw new Error(`${res.status}: ${err}`);
      }
    }
    return res.json();
  }

  /** Register a new agent */
  async registerAgent(name, scope) {
    const data = await this.request('/v1/agents', {
      method: 'POST',
      body: JSON.stringify({ name, scope }),
    });
    this.token = data.token;
    return data;
  }

  /** Set a policy */
  async setPolicy(agent, allow, deny) {
    const body = { agent, allow };
    if (deny) body.deny = deny;
    return this.request('/v1/policies', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** Proxy a chat completion */
  async chat(messages, model) {
    const body = { messages };
    if (model) body.model = model;
    return this.request('/v1/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** Ground and guard an existing response */
  async verify(response, sources, action, resource) {
    const body = { response, sources, action, resource };
    if (this.token) body.agent_token = this.token;
    return this.request('/v1/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** Full pipeline: chat → ground → guard → audit */
  async chatAndVerify(messages, sources, action, resource, model) {
    const body = { messages, sources, action, resource };
    if (model) body.model = model;
    if (this.token) body.agent_token = this.token;
    return this.request('/v1/chat/verify', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** Fetch audit log */
  async getAuditLog(limit = 10) {
    return this.request(`/v1/audit?limit=${limit}`);
  }
}

// ── Demo ──────────────────────────────────────────────

async function main() {
  const client = new TrustLayerClient();

  console.log('=== Trust Layer Demo ===\n');

  // 1. Register agent
  const creds = await client.registerAgent('hr-bot', 'hr:read');
  console.log(`Registered agent: ${creds.agent_id}`);

  // 2. Set policy
  await client.setPolicy(
    'hr-bot',
    [{ action: 'read', resource: 'employee-records/*' }],
    [{ action: 'delete', resource: '*' }],
  );
  console.log('Policy set: allow read employee-records/*, deny delete *');

  // 3. Chat + verify
  console.log('\n--- Chat + Verify ---');
  const result = await client.chatAndVerify(
    [{ role: 'user', content: 'Summarize employee data' }],
    [{
      id: 'src-1',
      title: 'Employee DB',
      content: 'John is a senior engineer.',
      authority_score: 0.9,
    }],
    'read',
    'employee-records/john-doe',
  );

  console.log(`Verified: ${result.verified}`);
  if (result.grounding) {
    console.log(`Hallucination score: ${result.grounding.hallucination_score}`);
    for (const c of result.grounding.claims) {
      console.log(`  Claim: ${c.text} → ${c.supported ? 'OK' : '!!'}`);
    }
  }
  console.log(`Guard: ${result.guard.allowed} (${result.guard.reason})`);
  console.log(`Audit ID: ${result.audit_id}`);

  // 4. Check audit log
  console.log('\n--- Recent Audit Entries ---');
  const entries = await client.getAuditLog(5);
  for (const entry of entries) {
    console.log(`  [${entry.action}] on ${entry.resource} — allowed: ${entry.policy_eval.allowed}`);
  }
}

main().catch(console.error);
