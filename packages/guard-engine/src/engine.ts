import type { Policy, PolicyEvaluation } from '@trust-layer/shared';
import { AgentIdentityManager } from './identity.js';
import { PolicyEngine } from './policy-engine.js';

export class GuardEngine {
  private identityManager: AgentIdentityManager;
  private policyEngine: PolicyEngine;

  constructor(signingKey?: string) {
    this.identityManager = new AgentIdentityManager(signingKey);
    this.policyEngine = new PolicyEngine();
  }

  evaluate(action: string, resource: string, agentId: string): PolicyEvaluation {
    return this.policyEngine.evaluate(action, resource, agentId);
  }

  setPolicy(policy: Policy): void {
    this.policyEngine.setPolicy(policy);
  }

  removePolicy(agentPattern: string): boolean {
    return this.policyEngine.removePolicy(agentPattern);
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
    return this.identityManager.registerAgent({ name, scope });
  }

  getAgent(agentId: string) {
    return this.identityManager.getAgent(agentId);
  }

  listAgents() {
    return this.identityManager.listAgents();
  }

  revokeAgent(agentId: string) {
    return this.identityManager.revokeAgent(agentId);
  }

  verifyToken(token: string) {
    return this.identityManager.verifyToken(token);
  }

  listPolicies() {
    return this.policyEngine.listPolicies();
  }
}
