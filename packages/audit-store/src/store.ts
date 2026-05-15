import type { AuditEntry } from '@trust-layer/shared';

export class AuditStore {
  async append(entry: Omit<AuditEntry, 'audit_id' | 'timestamp' | 'prev_hash'>): Promise<AuditEntry> {
    throw new Error('Not implemented');
  }

  async query(params: { agent_id?: string; limit?: number; offset?: number }): Promise<AuditEntry[]> {
    throw new Error('Not implemented');
  }
}
