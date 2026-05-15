import type { PolicyEvaluation, Policy } from '@trust-layer/shared';

export class GuardEngine {
  async evaluate(action: string, resource: string, agentId: string): Promise<PolicyEvaluation> {
    throw new Error('Not implemented');
  }

  async setPolicy(policy: Policy): Promise<void> {
    throw new Error('Not implemented');
  }
}
