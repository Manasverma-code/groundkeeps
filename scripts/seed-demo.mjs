#!/usr/bin/env node
/**
 * Seeds demo data into a running Trust Layer proxy.
 * Usage: node scripts/seed-demo.mjs
 */

const BASE = process.env['TRUST_LAYER_URL'] ?? 'http://localhost:3000';

async function req(path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${text ? ': ' + text : ''}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function main() {
  console.log('Trust Layer — Seeding Demo Data\n');

  // Check if proxy is running
  try {
    const health = await req('/health');
    console.log(`  Proxy: ${health.status} (${health.service})\n`);
  } catch {
    console.error('  Proxy not running at', BASE);
    console.error('  Start it first: npm run dev  or  docker compose up');
    process.exit(1);
  }

  // 1. Register agents
  console.log('1. Registering agents...');
  const hrBot = await req('/v1/agents', {
    method: 'POST', body: JSON.stringify({ name: 'hr-bot', scope: 'hr:read' }),
  });
  console.log(`   hr-bot: ${hrBot.agent_id.slice(0, 8)}...`);

  const financeBot = await req('/v1/agents', {
    method: 'POST', body: JSON.stringify({ name: 'finance-bot', scope: 'finance:read' }),
  });
  console.log(`   finance-bot: ${financeBot.agent_id.slice(0, 8)}...`);

  // 2. Set policies
  console.log('\n2. Setting policies...');
  await req('/v1/policies', {
    method: 'POST', body: JSON.stringify({
      agent: 'hr-bot',
      allow: [
        { action: 'read', resource: 'employee-records/*' },
        { action: 'read', resource: 'policies/*' },
      ],
      deny: [
        { action: 'read', resource: 'employee-records/sensitive/*' },
        { action: 'delete', resource: '*' },
      ],
    }),
  });
  console.log('   hr-bot: allow read employee-records/* + policies/*, deny sensitive/* + delete *');

  await req('/v1/policies', {
    method: 'POST', body: JSON.stringify({
      agent: 'finance-bot',
      allow: [
        { action: 'read', resource: 'reports/*' },
        { action: 'read', resource: 'budgets/*' },
      ],
      deny: [
        { action: 'write', resource: 'budgets/*' },
        { action: 'delete', resource: '*' },
      ],
    }),
  });
  console.log('   finance-bot: allow read reports/* + budgets/*, deny write budgets/* + delete *');

  // 3. Seed audit log with sample entries
  console.log('\n3. Seeding audit log...');
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    const hoursAgo = i * 2;
    const timestamp = new Date(now - hoursAgo * 3600000).toISOString();
    const isHr = i % 2 === 0;
    const agentId = isHr ? hrBot.agent_id : financeBot.agent_id;
    const action = i < 8 ? 'read' : (i === 8 ? 'delete' : 'read');
    const resource = isHr
      ? `employee-records/employee-${Math.floor(i / 2) + 1}`
      : `reports/q${Math.floor(i / 3) + 1}-${2025 + Math.floor(i / 6)}`;

    const evalResult = await req('/v1/evaluate', {
      method: 'POST', body: JSON.stringify({ action, resource, agent_id: isHr ? 'hr-bot' : 'finance-bot' }),
    });

    await req('/v1/audit', {
      method: 'POST', body: JSON.stringify({
        agent_id: agentId,
        action: evalResult.allowed ? action : `${action}:blocked`,
        resource,
        policy_eval: { allowed: evalResult.allowed, reason: evalResult.reason, matched_rule: evalResult.matched_rule },
        payload_hash: `${i}`.padStart(64, '0'),
      }),
    });
    console.log(`   [${timestamp.slice(11, 19)}] ${isHr ? 'hr-bot' : 'finance-bot'} ${action} ${resource} → ${evalResult.allowed ? 'ALLOW' : 'DENY'}`);
  }

  // 4. Save token for dashboard
  console.log('\n4. Demo credentials:');
  console.log(`   hr-bot token:     ${hrBot.token.slice(0, 40)}...`);
  console.log(`   finance-bot token: ${financeBot.token.slice(0, 40)}...`);

  // 5. Verify audit chain
  try {
    const chain = await req('/v1/audit/chain/verify');
    console.log(`\n5. Audit chain: ${chain.valid ? '✅ INTACT (SHA-256 verified)' : '❌ BROKEN'}`);
    console.log(`   Entries: ${chain.firstEntry ? 'present' : 'none'}`);
  } catch {
    console.log('\n5. Audit chain: unable to verify');
  }

  console.log('\n✅ Demo seeded! Open http://localhost:5173 to view the dashboard.');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
