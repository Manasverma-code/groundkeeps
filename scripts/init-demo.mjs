import { createProvider, providerFromEnv } from '../packages/providers/dist/index.js';
import { GroundingEngine } from '../packages/grounding-engine/dist/index.js';
import { GuardEngine } from '../packages/guard-engine/dist/index.js';
import { AuditStore } from '../packages/audit-store/dist/index.js';

async function main() {
  console.log('Trust Layer — Demo Initializer\n');

  // 1. Set up engines
  const verifierConfig = providerFromEnv('VERIFIER_LLM');
  const verifier = createProvider(verifierConfig);
  const grounding = new GroundingEngine(verifier);
  const guard = new GuardEngine('demo-signing-key');
  const audit = await AuditStore.create(':memory:');

  // 2. Register a demo agent
  const creds = guard.registerAgent('hr-bot', 'hr:read');
  console.log(`Registered agent: hr-bot`);
  console.log(`  Agent ID: ${creds.agent_id}`);
  console.log(`  Token:    ${creds.token.slice(0, 40)}...\n`);

  // 3. Set demo policies
  guard.setPolicy({
    agent: 'hr-bot',
    allow: [
      { action: 'read', resource: 'employee-records/*' },
      { action: 'read', resource: 'policies/*' },
    ],
    deny: [
      { action: 'read', resource: 'employee-records/sensitive/*' },
      { action: 'delete', resource: '*' },
    ],
  });
  console.log('Policy set for hr-bot:');
  console.log('  Allow: read employee-records/*, read policies/*');
  console.log('  Deny:  read employee-records/sensitive/*, delete *\n');

  // 4. Demo verification
  const testResponse = 'Employee John Doe earns $120,000 per year and works in the engineering department.';
  const testSources = [
    {
      id: 'src-1',
      title: 'Employee Records',
      content: 'John Doe is a senior engineer in the engineering department.',
      timestamp: new Date().toISOString(),
      authority_score: 0.9,
    },
  ];

  console.log('Testing grounding engine...');
  const groundingResult = await grounding.verify({
    response: testResponse,
    sources: testSources,
  });
  console.log(`  Hallucination score: ${groundingResult.hallucination_score}`);
  console.log(`  Claims extracted: ${groundingResult.claims.length}`);
  for (const c of groundingResult.claims) {
    console.log(`    [${c.supported ? 'OK' : '!!'}] ${c.text} (conf: ${c.confidence})`);
  }
  console.log(`  Conflicts: ${groundingResult.conflicts.length}\n`);

  // 5. Demo guard
  console.log('Testing guard engine...');
  const allowedEval = guard.evaluate('read', 'employee-records/john-doe', 'hr-bot');
  console.log(`  read employee-records/john-doe  → ${allowedEval.allowed ? 'ALLOW' : 'DENY'}`);

  const deniedEval = guard.evaluate('delete', 'employee-records/john-doe', 'hr-bot');
  console.log(`  delete employee-records/john-doe → ${deniedEval.allowed ? 'ALLOW' : 'DENY'}`);

  const blockedEval = guard.evaluate('read', 'employee-records/sensitive/payroll', 'hr-bot');
  console.log(`  read employee-records/sensitive/* → ${blockedEval.allowed ? 'ALLOW' : 'DENY'}\n`);

  // 6. Audit log
  audit.append({
    agent_id: creds.agent_id,
    action: 'read',
    resource: 'employee-records/john-doe',
    policy_eval: allowedEval,
    payload_hash: 'demo-hash',
  });

  audit.append({
    agent_id: creds.agent_id,
    action: 'delete:blocked',
    resource: 'employee-records/john-doe',
    policy_eval: deniedEval,
    payload_hash: 'demo-hash',
  });

  console.log('Audit log entries:');
  const entries = audit.query({ limit: 5 });
  for (const e of entries) {
    console.log(`  [${e.timestamp}] ${e.action} on ${e.resource} — allowed: ${e.policy_eval.allowed}`);
  }

  const chain = audit.verifyChain();
  console.log(`\nAudit chain valid: ${chain.valid}`);
  console.log('\nDemo complete! 🎉');
}

main().catch(console.error);
