import { createProvider, providerFromEnv } from '@trust-layer/providers';
import { GroundingEngine } from '@trust-layer/grounding-engine';
import { GuardEngine } from '@trust-layer/guard-engine';
import { AuditStore } from '@trust-layer/audit-store';
import { createApp } from './app.js';

export async function startProxy() {
  if (!process.env['TARGET_LLM_PROVIDER']) process.env['TARGET_LLM_PROVIDER'] = 'ollama';
  if (!process.env['VERIFIER_LLM_PROVIDER']) process.env['VERIFIER_LLM_PROVIDER'] = 'ollama';

  const targetConfig = providerFromEnv('TARGET_LLM');
  const targetProvider = createProvider(targetConfig);

  const verifierConfig = providerFromEnv('VERIFIER_LLM');
  const verifierProvider = createProvider(verifierConfig);
  const groundingEngine = new GroundingEngine(verifierProvider);

  const guardEngine = new GuardEngine();

  const auditStore = await AuditStore.create(process.env['AUDIT_DB_PATH'] ?? ':memory:');

  const app = await createApp({
    targetProvider,
    groundingEngine,
    guardEngine,
    auditStore,
    defaultAgentId: process.env['DEFAULT_AGENT_ID'] ?? 'default',
  });

  const port = parseInt(process.env['PROXY_PORT'] ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Trust Proxy running on port ${port}`);
  console.log(`  Target LLM:   ${targetConfig.name} (${targetConfig.defaultModel})`);
  console.log(`  Verifier LLM: ${verifierConfig.name} (${verifierConfig.defaultModel})`);
  console.log(`  Guard Engine: enabled`);
  console.log(`  Audit Store:  ${process.env['AUDIT_DB_PATH'] ?? 'in-memory'}`);
  return app;
}
