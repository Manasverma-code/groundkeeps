import { createProvider, providerFromEnv } from '@trust-layer/providers';
import { GroundingEngine } from '@trust-layer/grounding-engine';
import { GuardEngine } from '@trust-layer/guard-engine';
import { AuditStore } from '@trust-layer/audit-store';
import { existsSync, mkdirSync } from 'node:fs';
import { createApp } from './app.js';

export async function startProxy() {
  // Default to ollama if no provider configured
  if (!process.env['TARGET_LLM_PROVIDER']) process.env['TARGET_LLM_PROVIDER'] = 'ollama';
  if (!process.env['VERIFIER_LLM_PROVIDER']) process.env['VERIFIER_LLM_PROVIDER'] = 'ollama';

  // Create data directory if using file-based audit
  const auditPath = process.env['AUDIT_DB_PATH'];
  if (auditPath && auditPath !== ':memory:') {
    const dir = auditPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const targetConfig = providerFromEnv('TARGET_LLM');
  const targetProvider = createProvider(targetConfig);

  const verifierConfig = providerFromEnv('VERIFIER_LLM');
  const verifierProvider = createProvider(verifierConfig);
  const groundingEngine = new GroundingEngine(verifierProvider);

  const guardEngine = new GuardEngine();

  const auditStore = await AuditStore.create(auditPath ?? ':memory:');

  // Serve dashboard if built files exist
  const dashboardDir = existsSync('./packages/dashboard/dist') ? './packages/dashboard/dist' : undefined;

  const app = await createApp({
    targetProvider,
    groundingEngine,
    guardEngine,
    auditStore,
    defaultAgentId: process.env['DEFAULT_AGENT_ID'] ?? 'default',
    dashboardDir,
  });

  const port = parseInt(process.env['PROXY_PORT'] ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`\n  🛡️  Ground-Keeps running on http://localhost:${port}`);
  console.log(`  📡 Target LLM:   ${targetConfig.name} (${targetConfig.defaultModel})`);
  console.log(`  🔍 Verifier LLM: ${verifierConfig.name} (${verifierConfig.defaultModel})`);
  console.log(`  🛡️  Guard Engine: enabled`);
  console.log(`  📋 Audit Store:  ${auditPath ?? 'in-memory'}`);
  if (dashboardDir) console.log(`  📊 Dashboard:    http://localhost:${port}`);
  console.log(``);
  return app;
}
