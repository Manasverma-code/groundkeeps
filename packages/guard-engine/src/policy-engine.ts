import type { Policy, PolicyRule, PolicyEvaluation, ActionType } from '@trust-layer/shared';

interface CompiledRule {
  action: ActionType;
  resourcePattern: RegExp;
  resourceGlob: string;
}

interface CompiledPolicy {
  agentPattern: RegExp;
  allow: CompiledRule[];
  deny: CompiledRule[];
}

export class PolicyEngine {
  private policies: CompiledPolicy[] = [];

  setPolicy(policy: Policy): void {
    const agentPattern = this.globToRegex(policy.agent);
    const compiled: CompiledPolicy = {
      agentPattern,
      allow: (policy.allow ?? []).map((r) => this.compileRule(r)),
      deny: (policy.deny ?? []).map((r) => this.compileRule(r)),
    };

    const existing = this.policies.findIndex(
      (p) => p.agentPattern.source === agentPattern.source,
    );
    if (existing >= 0) {
      this.policies[existing] = compiled;
    } else {
      this.policies.push(compiled);
    }
  }

  removePolicy(agentPattern: string): boolean {
    const regex = this.globToRegex(agentPattern);
    const before = this.policies.length;
    this.policies = this.policies.filter((p) => p.agentPattern.source !== regex.source);
    return this.policies.length < before;
  }

  evaluate(action: string, resource: string, agentId: string): PolicyEvaluation {
    const agentPolicy = this.findPolicyForAgent(agentId);
    if (!agentPolicy) {
      return {
        allowed: false,
        reason: `No policy found for agent ${agentId}`,
      };
    }

    const actionType = action as ActionType;

    const denyMatch = this.matchRule(actionType, resource, agentPolicy.deny);
    if (denyMatch) {
      return {
        allowed: false,
        reason: `Denied by policy: ${denyMatch.action} ${denyMatch.resourceGlob}`,
        matched_rule: `deny:${denyMatch.action}:${denyMatch.resourceGlob}`,
      };
    }

    const allowMatch = this.matchRule(actionType, resource, agentPolicy.allow);
    if (allowMatch) {
      return {
        allowed: true,
        reason: `Allowed by policy: ${allowMatch.action} ${allowMatch.resourceGlob}`,
        matched_rule: `allow:${allowMatch.action}:${allowMatch.resourceGlob}`,
      };
    }

    return {
      allowed: false,
      reason: `Action ${action} on ${resource} not explicitly allowed for agent ${agentId}`,
    };
  }

  listPolicies(): Policy[] {
    return this.policies.map((p) => ({
      agent: p.agentPattern.source,
      allow: p.allow.map((r) => ({ action: r.action, resource: r.resourceGlob })),
      deny: p.deny.map((r) => ({ action: r.action, resource: r.resourceGlob })),
    }));
  }

  private findPolicyForAgent(agentId: string): CompiledPolicy | null {
    return this.policies.find((p) => p.agentPattern.test(agentId)) ?? null;
  }

  private matchRule(
    action: ActionType,
    resource: string,
    rules: CompiledRule[],
  ): CompiledRule | null {
    for (const rule of rules) {
      if (rule.action === action && rule.resourcePattern.test(resource)) {
        return rule;
      }
    }
    return null;
  }

  private compileRule(rule: PolicyRule): CompiledRule {
    return {
      action: rule.action,
      resourcePattern: this.globToRegex(rule.resource),
      resourceGlob: rule.resource,
    };
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
  }
}
