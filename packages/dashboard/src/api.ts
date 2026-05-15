const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

export interface AuditEntry {
  audit_id: string;
  timestamp: string;
  agent_id: string;
  action: string;
  resource: string;
  policy_eval: { allowed: boolean; reason: string };
  payload_hash: string;
  prev_hash: string;
  hash: string;
}

export interface Agent {
  agent_id: string;
  name: string;
  scope: string;
  created_at: string;
}

export interface Policy {
  agent: string;
  allow: { action: string; resource: string }[];
  deny?: { action: string; resource: string }[];
}

export const api = {
  health: () => request<{ status: string }>('/health'),

  getAuditLog: (params?: { agent_id?: string; action?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.agent_id) qs.set('agent_id', params.agent_id);
    if (params?.action) qs.set('action', params.action);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return request<AuditEntry[]>(`/v1/audit${query ? `?${query}` : ''}`);
  },

  getAuditCount: (params?: { agent_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.agent_id) qs.set('agent_id', params.agent_id);
    const query = qs.toString();
    return request<{ count: number }>(`/v1/audit/count${query ? `?${query}` : ''}`);
  },

  getAgents: () => request<Agent[]>('/v1/agents'),
  createAgent: (name: string, scope: string) =>
    request<{ agent_id: string; client_secret: string; token: string }>('/v1/agents', {
      method: 'POST',
      body: JSON.stringify({ name, scope }),
    }),
  deleteAgent: (id: string) =>
    request<void>(`/v1/agents/${id}`, { method: 'DELETE' }),

  getPolicies: () => request<Policy[]>('/v1/policies'),
  setPolicy: (policy: Policy) =>
    request<{ status: string }>('/v1/policies', {
      method: 'POST',
      body: JSON.stringify(policy),
    }),

  evaluate: (action: string, resource: string, agentId: string) =>
    request<{ allowed: boolean; reason: string }>('/v1/evaluate', {
      method: 'POST',
      body: JSON.stringify({ action, resource, agent_id: agentId }),
    }),
};
