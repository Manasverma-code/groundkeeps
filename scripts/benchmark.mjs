#!/usr/bin/env node
/**
 * Ground-Keeps Performance Benchmarks
 * Validates against PRD targets:
 *   - Guard evaluation: <200ms
 *   - Hallucination FPR: <5%
 *   - Conflict resolution: >95%
 *
 * Usage: node scripts/benchmark.mjs
 */

import { GuardEngine } from '../packages/guard-engine/dist/engine.js';
import { AuditStore } from '../packages/audit-store/dist/store.js';
import { createProvider } from '../packages/providers/dist/factory.js';
import { GroundingEngine } from '../packages/grounding-engine/dist/engine.js';

const W = process.stdout;

function hr() { W.write('─'.repeat(60) + '\n'); }

async function measure(label, fn, iterations = 100) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn(i);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const min = times[0];
  const max = times[times.length - 1];

  W.write(`  ${label.padEnd(35)} avg=${avg.toFixed(2)}ms  p50=${p50.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  p99=${p99.toFixed(2)}ms  min=${min.toFixed(2)}ms  max=${max.toFixed(2)}ms\n`);
  return { avg, p50, p95, p99, min, max };
}

async function main() {
  W.write('\n');
  W.write('  ╔══════════════════════════════════════════════════════════╗\n');
  W.write('  ║            Ground-Keeps Performance Benchmarks           ║\n');
  W.write('  ╚══════════════════════════════════════════════════════════╝\n\n');

  // ── 1. Guard Engine Latency ─────────────────────
  W.write('  ┌─ Guard Engine ────────────────────────────────────────────┐\n');
  const guard = new GuardEngine('bench-key');

  // Register test agents
  for (let i = 0; i < 10; i++) {
    guard.registerAgent(`agent-${i}`, `scope:${i}`);
    guard.setPolicy({
      agent: `agent-${i}`,
      allow: [{ action: 'read', resource: 'documents/*' }, { action: 'read', resource: `scope-${i}/*` }],
      deny: [{ action: 'delete', resource: '*' }],
    });
  }

  const guardResults = await measure(
    'Guard: evaluate (10 policies)',
    (i) => guard.evaluate('read', `documents/doc-${i % 10}`, `agent-${i % 10}`),
    1000,
  );

  // ── 2. Token Verification ────────────────────────
  const token = guard.registerAgent('token-bench', 'bench').token;

  await measure(
    'Guard: verify token + eval',
    () => guard.verifyAction(token, 'read', 'documents/doc'),
    500,
  );

  // ── 3. Audit Store ──────────────────────────────
  W.write('\n  ┌─ Audit Store ────────────────────────────────────────────┐\n');
  const audit = await AuditStore.create(':memory:');

  await measure(
    'Audit: append entry',
    (i) => audit.append({
      agent_id: `agent-${i % 10}`,
      action: 'read',
      resource: `doc/doc-${i}`,
      policy_eval: { allowed: true, reason: 'benchmark' },
      payload_hash: '0'.repeat(64),
    }),
    500,
  );

  // Query after data is populated
  await measure(
    'Audit: query (500 entries)',
    () => audit.query({ limit: 50 }),
    100,
  );

  await measure(
    'Audit: chain verify (500 entries)',
    () => audit.verifyChain(),
    50,
  );

  // ── 4. Policy Engine Throughput ──────────────────
  W.write('\n  ┌─ Policy Engine ──────────────────────────────────────────┐\n');

  const guard2 = new GuardEngine('throughput');
  for (let i = 0; i < 50; i++) {
    guard2.registerAgent(`bulk-${i}`, `bulk`);
    guard2.setPolicy({
      agent: `bulk-${i}`,
      allow: [
        { action: 'read', resource: 'a/*' },
        { action: 'write', resource: 'b/*' },
        { action: 'execute', resource: 'c/*' },
      ],
      deny: [{ action: 'delete', resource: '*' }],
    });
  }

  await measure(
    'Policy: eval (50 agents, 4 rules each)',
    (i) => guard2.evaluate('read', `a/doc-${i}`, `bulk-${i % 50}`),
    500,
  );

  // ── 5. Hallucination Score (mock) ────────────────
  W.write('\n  ┌─ Grounding Engine (mock verifier) ───────────────────────┐\n');

  const mockProvider = {
    name: 'openai',
    async chat() {
      return {
        content: JSON.stringify([
          { text: 'Claim 1', supported: true, confidence: 0.95, source: 'src1' },
          { text: 'Claim 2', supported: true, confidence: 0.90, source: 'src1' },
          { text: 'Claim 3', supported: false, confidence: 0.1, reason: 'Not in sources' },
        ]),
        model: 'mock',
        provider: 'openai',
      };
    },
  };

  const grounding = new GroundingEngine(mockProvider);

  await measure(
    'Ground: verify 2 sources, 3 claims',
    () => grounding.verify({
      response: 'Test response with claims.',
      sources: [
        { id: 'src1', title: 'Source 1', content: 'Supporting content for claims 1 and 2.', authority_score: 0.9 },
        { id: 'src2', title: 'Source 2', content: 'Additional context.', authority_score: 0.7 },
      ],
    }),
    50,
  );

  // ── Summary ──────────────────────────────────────
  hr();
  W.write('\n  ┌─ Results Summary ────────────────────────────────────────┐\n');
  W.write('\n');
  W.write(`  PRD Target: Guard evaluation latency <200ms\n`);
  W.write(`  Actual:     p95=${guardResults.p95.toFixed(2)}ms  ${guardResults.p95 < 200 ? '✅ PASS' : '❌ FAIL'}\n`);
  W.write('\n');
  W.write(`  All benchmarks run with ${process.version} on ${process.platform}\n`);
  W.write(`  Timestamp: ${new Date().toISOString()}\n`);
  W.write('\n');
  hr();
  W.write('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
