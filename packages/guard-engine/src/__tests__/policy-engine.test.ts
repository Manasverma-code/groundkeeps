import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from '../policy-engine.js';
import type { Policy } from '@trust-layer/shared';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  it('allows an action matching an allow rule', () => {
    const policy: Policy = {
      agent: 'hr-bot',
      allow: [{ action: 'read', resource: 'employee-records/*' }],
    };
    engine.setPolicy(policy);

    const result = engine.evaluate('read', 'employee-records/123', 'hr-bot');
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('Allowed');
  });

  it('denies an action matching a deny rule, even if allow matches', () => {
    const policy: Policy = {
      agent: 'hr-bot',
      allow: [{ action: 'read', resource: '*/*' }],
      deny: [{ action: 'read', resource: 'employee-records/sensitive/*' }],
    };
    engine.setPolicy(policy);

    const allowed = engine.evaluate('read', 'public/doc', 'hr-bot');
    expect(allowed.allowed).toBe(true);

    const denied = engine.evaluate('read', 'employee-records/sensitive/payroll', 'hr-bot');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('Denied');
  });

  it('denies action not in allow rules', () => {
    const policy: Policy = {
      agent: 'hr-bot',
      allow: [{ action: 'read', resource: 'docs/*' }],
    };
    engine.setPolicy(policy);

    const result = engine.evaluate('write', 'docs/note', 'hr-bot');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not explicitly allowed');
  });

  it('returns not allowed when no policy matches the agent', () => {
    const result = engine.evaluate('read', 'any/resource', 'unknown-agent');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No policy found');
  });

  it('matches wildcard agent patterns', () => {
    const policy: Policy = {
      agent: '*-bot',
      allow: [{ action: 'execute', resource: 'tasks/*' }],
    };
    engine.setPolicy(policy);

    expect(engine.evaluate('execute', 'tasks/send-email', 'hr-bot').allowed).toBe(true);
    expect(engine.evaluate('execute', 'tasks/send-email', 'finance-bot').allowed).toBe(true);
    expect(engine.evaluate('execute', 'tasks/send-email', 'user-manual').allowed).toBe(false);
  });

  it('matches resource glob patterns', () => {
    const policy: Policy = {
      agent: 'dev',
      allow: [
        { action: 'read', resource: 'logs/*' },
        { action: 'write', resource: 'src/**/*.ts' },
      ],
    };
    engine.setPolicy(policy);

    expect(engine.evaluate('read', 'logs/app.log', 'dev').allowed).toBe(true);
    expect(engine.evaluate('write', 'src/components/button.ts', 'dev').allowed).toBe(true);
    expect(engine.evaluate('read', 'secrets/db-password', 'dev').allowed).toBe(false);
  });

  it('updates existing policy for same agent', () => {
    const policy1: Policy = {
      agent: 'bot',
      allow: [{ action: 'read', resource: 'old/*' }],
    };
    const policy2: Policy = {
      agent: 'bot',
      allow: [{ action: 'read', resource: 'new/*' }],
    };

    engine.setPolicy(policy1);
    engine.setPolicy(policy2);

    expect(engine.evaluate('read', 'old/doc', 'bot').allowed).toBe(false);
    expect(engine.evaluate('read', 'new/doc', 'bot').allowed).toBe(true);
  });

  it('removes a policy', () => {
    engine.setPolicy({ agent: 'temp', allow: [{ action: 'read', resource: '*' }] });
    expect(engine.removePolicy('temp')).toBe(true);
    expect(engine.evaluate('read', 'x', 'temp').allowed).toBe(false);
  });

  it('lists all policies', () => {
    engine.setPolicy({ agent: 'a', allow: [{ action: 'read', resource: '*' }] });
    engine.setPolicy({ agent: 'b', allow: [{ action: 'write', resource: '*' }] });
    expect(engine.listPolicies()).toHaveLength(2);
  });
});
