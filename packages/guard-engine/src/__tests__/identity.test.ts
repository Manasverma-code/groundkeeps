import { describe, it, expect, beforeEach } from 'vitest';
import { AgentIdentityManager } from '../identity.js';

describe('AgentIdentityManager', () => {
  let manager: AgentIdentityManager;

  beforeEach(() => {
    manager = new AgentIdentityManager('test-signing-key');
  });

  it('registers an agent and returns credentials', () => {
    const creds = manager.registerAgent({ name: 'hr-bot', scope: 'hr:read' });
    expect(creds.agent_id).toBeDefined();
    expect(creds.client_secret).toBeDefined();
    expect(creds.token).toBeDefined();
    expect(creds.token.split('.')).toHaveLength(3);
  });

  it('verifies a valid token', () => {
    const creds = manager.registerAgent({ name: 'hr-bot', scope: 'hr:read' });
    const result = manager.verifyToken(creds.token);
    expect(result).not.toBeNull();
    expect(result!.agentId).toBe(creds.agent_id);
    expect(result!.scope).toBe('hr:read');
  });

  it('rejects an invalid token', () => {
    const result = manager.verifyToken('invalid.token.here');
    expect(result).toBeNull();
  });

  it('rejects a tampered token', () => {
    const creds = manager.registerAgent({ name: 'test', scope: 'test' });
    const parts = creds.token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;
    const result = manager.verifyToken(tampered);
    expect(result).toBeNull();
  });

  it('gets agent info by id', () => {
    const creds = manager.registerAgent({ name: 'my-agent', scope: 'read' });
    const info = manager.getAgent(creds.agent_id);
    expect(info).not.toBeNull();
    expect(info!.name).toBe('my-agent');
    expect(info!.scope).toBe('read');
  });

  it('returns null for non-existent agent', () => {
    expect(manager.getAgent('non-existent')).toBeNull();
  });

  it('lists all registered agents', () => {
    manager.registerAgent({ name: 'a1', scope: 's1' });
    manager.registerAgent({ name: 'a2', scope: 's2' });
    expect(manager.listAgents()).toHaveLength(2);
  });

  it('revokes an agent', () => {
    const creds = manager.registerAgent({ name: 'temp', scope: 'temp' });
    expect(manager.revokeAgent(creds.agent_id)).toBe(true);
    expect(manager.getAgent(creds.agent_id)).toBeNull();
  });

  it('returns false when revoking non-existent agent', () => {
    expect(manager.revokeAgent('non-existent')).toBe(false);
  });

  it('verifies token fails after agent is revoked', () => {
    const creds = manager.registerAgent({ name: 'temp', scope: 'temp' });
    manager.revokeAgent(creds.agent_id);
    const result = manager.verifyToken(creds.token);
    expect(result).toBeNull();
  });
});
