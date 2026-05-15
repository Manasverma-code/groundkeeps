import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditStore } from '../store.js';
import type { PolicyEvaluation } from '@trust-layer/shared';

describe('AuditStore', () => {
  let store: AuditStore;

  const mockPolicyEval: PolicyEvaluation = {
    allowed: true,
    reason: 'test policy',
  };

  beforeEach(async () => {
    store = await AuditStore.create(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('appends an entry and returns it', () => {
    const entry = store.append({
      agent_id: 'agent-1',
      action: 'read',
      resource: 'records/patient-123',
      policy_eval: mockPolicyEval,
      payload_hash: 'abc123',
    });

    expect(entry.audit_id).toBeDefined();
    expect(entry.timestamp).toBeDefined();
    expect(entry.agent_id).toBe('agent-1');
    expect(entry.action).toBe('read');
    expect(entry.resource).toBe('records/patient-123');
    expect(entry.hash).toBeDefined();
    expect(entry.prev_hash).toBe('');
  });

  it('chains entries via prev_hash', () => {
    const first = store.append({
      agent_id: 'agent-1', action: 'read', resource: 'a',
      policy_eval: mockPolicyEval, payload_hash: '1',
    });
    const second = store.append({
      agent_id: 'agent-1', action: 'write', resource: 'b',
      policy_eval: mockPolicyEval, payload_hash: '2',
    });
    const third = store.append({
      agent_id: 'agent-2', action: 'delete', resource: 'c',
      policy_eval: mockPolicyEval, payload_hash: '3',
    });

    expect(first.prev_hash).toBe('');
    expect(second.prev_hash).toBe(first.hash);
    expect(third.prev_hash).toBe(second.hash);
  });

  it('queries entries by agent_id', () => {
    store.append({ agent_id: 'agent-1', action: 'read', resource: 'a', policy_eval: mockPolicyEval, payload_hash: '1' });
    store.append({ agent_id: 'agent-2', action: 'write', resource: 'b', policy_eval: mockPolicyEval, payload_hash: '2' });
    store.append({ agent_id: 'agent-1', action: 'delete', resource: 'c', policy_eval: mockPolicyEval, payload_hash: '3' });

    const agent1Entries = store.query({ agent_id: 'agent-1' });
    expect(agent1Entries).toHaveLength(2);
    expect(agent1Entries.every((e) => e.agent_id === 'agent-1')).toBe(true);
  });

  it('queries entries by action', () => {
    store.append({ agent_id: 'agent-1', action: 'read', resource: 'a', policy_eval: mockPolicyEval, payload_hash: '1' });
    store.append({ agent_id: 'agent-2', action: 'write', resource: 'b', policy_eval: mockPolicyEval, payload_hash: '2' });
    store.append({ agent_id: 'agent-1', action: 'read', resource: 'c', policy_eval: mockPolicyEval, payload_hash: '3' });

    const readEntries = store.query({ action: 'read' });
    expect(readEntries).toHaveLength(2);
  });

  it('supports pagination with limit and offset', () => {
    for (let i = 0; i < 10; i++) {
      store.append({ agent_id: 'agent-1', action: 'read', resource: `r-${i}`, policy_eval: mockPolicyEval, payload_hash: `${i}` });
    }

    const page1 = store.query({ limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = store.query({ limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);
    expect(page2[0].resource).not.toBe(page1[0].resource);
  });

  it('gets entry by audit_id', () => {
    const entry = store.append({ agent_id: 'agent-1', action: 'read', resource: 'x', policy_eval: mockPolicyEval, payload_hash: 'hash' });
    const found = store.getByAuditId(entry.audit_id);
    expect(found).not.toBeNull();
    expect(found!.audit_id).toBe(entry.audit_id);

    const notFound = store.getByAuditId('non-existent');
    expect(notFound).toBeNull();
  });

  it('counts entries', () => {
    expect(store.count({})).toBe(0);

    store.append({ agent_id: 'agent-1', action: 'read', resource: 'a', policy_eval: mockPolicyEval, payload_hash: '1' });
    store.append({ agent_id: 'agent-2', action: 'write', resource: 'b', policy_eval: mockPolicyEval, payload_hash: '2' });

    expect(store.count({})).toBe(2);
    expect(store.count({ agent_id: 'agent-1' })).toBe(1);
  });

  it('verifies an unbroken chain', () => {
    store.append({ agent_id: 'a1', action: 'read', resource: 'r1', policy_eval: mockPolicyEval, payload_hash: 'h1' });
    store.append({ agent_id: 'a1', action: 'write', resource: 'r2', policy_eval: mockPolicyEval, payload_hash: 'h2' });
    store.append({ agent_id: 'a2', action: 'delete', resource: 'r3', policy_eval: mockPolicyEval, payload_hash: 'h3' });

    const result = store.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.firstEntry).not.toBeNull();
    expect(result.lastEntry).not.toBeNull();
  });

  it('verifies an empty chain as valid', () => {
    const result = store.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.firstEntry).toBeNull();
    expect(result.lastEntry).toBeNull();
  });

  it('queries by time range', () => {
    const entry = store.append({ agent_id: 'a1', action: 'read', resource: 'r1', policy_eval: mockPolicyEval, payload_hash: 'h1' });

    const entries = store.query({ since: entry.timestamp });
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const future = new Date(Date.now() + 86400000).toISOString();
    const empty = store.query({ since: future });
    expect(empty).toHaveLength(0);
  });
});
