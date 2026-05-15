import { describe, it, expect, beforeEach } from 'vitest';
import { GuardEngine } from '../engine.js';

describe('GuardEngine', () => {
  let engine: GuardEngine;

  beforeEach(() => {
    engine = new GuardEngine('test-key');
  });

  it('registers an agent and verifies action with token', () => {
    engine.setPolicy({
      agent: 'my-agent',
      allow: [{ action: 'read', resource: 'docs/*' }],
    });

    const creds = engine.registerAgent('my-agent', 'read');
    const result = engine.verifyAction(creds.token, 'read', 'docs/report.pdf');
    expect(result.allowed).toBe(true);
    expect(result.agentId).toBe(creds.agent_id);
  });

  it('denies action not matching policy via token verification', () => {
    engine.setPolicy({
      agent: 'my-agent',
      allow: [{ action: 'read', resource: 'docs/*' }],
    });

    const creds = engine.registerAgent('my-agent', 'read');
    const result = engine.verifyAction(creds.token, 'delete', 'docs/report.pdf');
    expect(result.allowed).toBe(false);
  });

  it('fails verification with invalid token', () => {
    const result = engine.verifyAction('bad.token.here', 'read', 'docs/x');
    expect(result.allowed).toBe(false);
    expect(result.evaluation.reason).toContain('Invalid');
  });

  it('evaluates action directly by agent id', () => {
    engine.setPolicy({
      agent: 'bot',
      allow: [{ action: 'read', resource: '*' }],
    });

    expect(engine.evaluate('read', 'anything', 'bot').allowed).toBe(true);
    expect(engine.evaluate('write', 'anything', 'bot').allowed).toBe(false);
  });

  it('lists agents and policies', () => {
    engine.registerAgent('agent-a', 'scope-a');
    engine.registerAgent('agent-b', 'scope-b');
    engine.setPolicy({ agent: 'agent-a', allow: [{ action: 'read', resource: '*' }] });

    expect(engine.listAgents()).toHaveLength(2);
    expect(engine.listPolicies()).toHaveLength(1);
  });

  it('revokes agent and invalidates its token', () => {
    const creds = engine.registerAgent('temp', 'temp');
    engine.revokeAgent(creds.agent_id);
    const result = engine.verifyAction(creds.token, 'read', 'x');
    expect(result.allowed).toBe(false);
  });
});
