import { createProvider, providerFromEnv } from '@trust-layer/providers';
import { GroundingEngine, DocumentGovernanceEngine, OutputGovernanceEngine, EscalationEngine } from '@trust-layer/grounding-engine';
import { GuardEngine, GuardStore } from '@trust-layer/guard-engine';
import { AuditStore } from '@trust-layer/audit-store';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import type { WebhookConfig } from './webhooks.js';
import { createLicenseEnforcement } from './license.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

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

  const documentGovernanceEngine = new DocumentGovernanceEngine();
  const outputGovernanceEngine = new OutputGovernanceEngine();
  const escalationEngine = new EscalationEngine(verifierProvider);

  const guardStore = new GuardStore(process.env['GUARD_DB_PATH']);
  const guardEngine = new GuardEngine(undefined, guardStore);

  const auditStore = await AuditStore.create(auditPath ?? ':memory:');

  // Serve dashboard if built files exist
  const dashboardDir = existsSync(resolve(__dirname, '../../dashboard/dist')) ? resolve(__dirname, '../../dashboard/dist') : undefined;

  const apiKey = process.env['PROXY_API_KEY'];

  if (!apiKey) {
    console.warn('\n  ⚠️  WARNING: PROXY_API_KEY is not set. All API endpoints are accessible without authentication.');
    console.warn('  ⚠️  Set PROXY_API_KEY in your environment or .env file for production use.\n');
  }

  let webhookConfig: WebhookConfig | undefined;
  const webhookUrl = process.env['WEBHOOK_URL'];
  if (webhookUrl) {
    const eventsRaw = process.env['WEBHOOK_EVENTS'] ?? 'policy_violation,escalation_blocked,high_hallucination';
    const threshold = parseFloat(process.env['WEBHOOK_HALLUCINATION_THRESHOLD'] ?? '0.5');
    webhookConfig = {
      url: webhookUrl,
      events: eventsRaw.split(',').map((e: string) => e.trim() as WebhookConfig['events'][number]),
      hallucinationThreshold: isNaN(threshold) ? 0.5 : threshold,
    };
    console.log(`  🔔 Webhook:      ${webhookUrl} (events: ${webhookConfig.events.join(', ')})`);
  }

  const licenseEnforcement = createLicenseEnforcement(
    process.env['LICENSE_KEY'],
    process.env['USAGE_DB_PATH'],
    process.env['LICENSE_SERVER_URL'],
  );

  const app = await createApp({
    targetProvider,
    groundingEngine,
    documentGovernanceEngine,
    outputGovernanceEngine,
    escalationEngine,
    guardEngine,
    auditStore,
    licenseEnforcement,
    defaultAgentId: process.env['DEFAULT_AGENT_ID'] ?? 'default',
    dashboardDir,
    apiKey,
    webhookConfig,
  });

  const port = parseInt(process.env['PROXY_PORT'] ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`  📋 License Tier: ${licenseEnforcement.state.tier}${licenseEnforcement.state.expiresAt ? ` (expires ${licenseEnforcement.state.expiresAt.toISOString().split('T')[0]})` : ''}`);
  console.log(`\n  🛡️  groundkeeps running on http://localhost:${port}`);
  console.log(`  📡 Target LLM:   ${targetConfig.name} (${targetConfig.defaultModel})`);
  console.log(`  🔍 Verifier LLM: ${verifierConfig.name} (${verifierConfig.defaultModel})`);
  console.log(`  🛡️  Guard Engine: enabled (${process.env['GUARD_DB_PATH'] ? 'persistent' : 'in-memory'})`);
  console.log(`  🔑 API Auth:     ${apiKey ? 'required (Authorization: Bearer <key>)' : 'disabled'}`);
  console.log(`  📋 Audit Store:  ${auditPath ?? 'in-memory'}`);
  console.log(`  ⚡ Rate Limit:   100 req/min per client`);
  console.log(`  ⏱️  LLM Timeout:  120s`);
  if (dashboardDir) console.log(`  📊 Dashboard:    http://localhost:${port}`);
  console.log(``);
  return app;
}

startProxy().catch((err) => {
  console.error('Failed to start proxy:', err);
  process.exit(1);
});
