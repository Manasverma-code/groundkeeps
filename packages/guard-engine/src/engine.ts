import type { Policy, PolicyEvaluation } from '@trust-layer/shared';
import { AgentIdentityManager } from './identity.js';
import { PolicyEngine } from './policy-engine.js';
import { GuardStore } from './store.js';

export class GuardEngine {
  private identityManager: AgentIdentityManager;
  private policyEngine: PolicyEngine;
  private store: GuardStore;

  constructor(signingKey?: string, store?: GuardStore) {
    this.store = store ?? new GuardStore(':memory:');
    this.identityManager = new AgentIdentityManager(signingKey);
    this.policyEngine = new PolicyEngine();
    this.loadFromStore();
  }

  private loadFromStore(): void {
    for (const [agentId, agent] of Object.entries(this.store.listAgents())) {
      this.identityManager.loadAgent(agentId, agent.name, agent.scope, agent.secret, agent.createdAt);
    }
    for (const policy of this.store.listPolicies()) {
      this.policyEngine.setPolicy(policy as unknown as Policy);
    }
  }

  evaluate(action: string, resource: string, agentId: string): PolicyEvaluation {
    return this.policyEngine.evaluate(action, resource, agentId);
  }

  setPolicy(policy: Policy): void {
    this.policyEngine.setPolicy(policy);
    this.store.setPolicy({
      agent: policy.agent,
      allow: (policy.allow ?? []).map((r) => ({ action: r.action, resource: r.resource })),
      deny: (policy.deny ?? []).map((r) => ({ action: r.action, resource: r.resource })),
    });
  }

  removePolicy(agentPattern: string): boolean {
    const removed = this.policyEngine.removePolicy(agentPattern);
    if (removed) this.store.removePolicy(agentPattern);
    return removed;
  }

  verifyAction(
    token: string,
    action: string,
    resource: string,
  ): { allowed: boolean; evaluation: PolicyEvaluation; agentId?: string } {
    const identity = this.identityManager.verifyToken(token);
    if (!identity) {
      return {
        allowed: false,
        evaluation: { allowed: false, reason: 'Invalid or expired token' },
      };
    }

    const agent = this.identityManager.getAgent(identity.agentId);
    const agentName = agent?.name ?? identity.agentId;
    const evaluation = this.policyEngine.evaluate(action, resource, agentName);
    return {
      allowed: evaluation.allowed,
      evaluation,
      agentId: identity.agentId,
    };
  }

  registerAgent(name: string, scope: string) {
    const creds = this.identityManager.registerAgent({ name, scope });
    const agent = this.identityManager.getAgent(creds.agent_id);
    if (agent) {
      this.store.setAgent(creds.agent_id, {
        name: agent.name,
        scope: agent.scope,
        secret: creds.client_secret,
        createdAt: agent.created_at,
      });
    }
    return creds;
  }

  getAgent(agentId: string) {
    return this.identityManager.getAgent(agentId);
  }

  listAgents() {
    return this.identityManager.listAgents();
  }

  revokeAgent(agentId: string) {
    const revoked = this.identityManager.revokeAgent(agentId);
    if (revoked) this.store.deleteAgent(agentId);
    return revoked;
  }

  verifyToken(token: string) {
    return this.identityManager.verifyToken(token);
  }

  listPolicies() {
    return this.policyEngine.listPolicies();
  }
}
