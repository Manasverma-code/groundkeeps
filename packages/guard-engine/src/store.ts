import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentInfo, Policy, PolicyRule, ActionType } from '@trust-layer/shared';

interface StoredAgent {
  name: string;
  scope: string;
  secret: string;
  createdAt: string;
}

interface StoredPolicy {
  agent: string;
  allow: { action: string; resource: string }[];
  deny: { action: string; resource: string }[];
}

interface StoreData {
  agents: Record<string, StoredAgent>;
  policies: StoredPolicy[];
}

export class GuardStore {
  private path: string;
  private data: StoreData;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? ':memory:';
    if (resolvedPath === ':memory:') {
      this.path = ':memory:';
      this.data = { agents: {}, policies: [] };
      return;
    }
    this.path = resolvedPath;
    const dir = resolvedPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.data = this.load();
  }

  private load(): StoreData {
    try {
      if (existsSync(this.path)) {
        return JSON.parse(readFileSync(this.path, 'utf-8'));
      }
    } catch { /* ignore corrupt file */ }
    return { agents: {}, policies: [] };
  }

  private save(): void {
    if (this.path === ':memory:') return;
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  listAgents(): Record<string, StoredAgent> {
    return { ...this.data.agents };
  }

  getAgent(agentId: string): StoredAgent | null {
    return this.data.agents[agentId] ?? null;
  }

  setAgent(agentId: string, agent: StoredAgent): void {
    this.data.agents[agentId] = agent;
    this.save();
  }

  deleteAgent(agentId: string): boolean {
    if (!this.data.agents[agentId]) return false;
    delete this.data.agents[agentId];
    this.save();
    return true;
  }

  listPolicies(): StoredPolicy[] {
    return [...this.data.policies];
  }

  setPolicy(policy: StoredPolicy): void {
    const existing = this.data.policies.findIndex((p) => p.agent === policy.agent);
    if (existing >= 0) {
      this.data.policies[existing] = policy;
    } else {
      this.data.policies.push(policy);
    }
    this.save();
  }

  removePolicy(agentPattern: string): boolean {
    const before = this.data.policies.length;
    this.data.policies = this.data.policies.filter((p) => p.agent !== agentPattern);
    const removed = this.data.policies.length < before;
    if (removed) this.save();
    return removed;
  }
}
