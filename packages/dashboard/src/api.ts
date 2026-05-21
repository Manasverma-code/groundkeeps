function getApiKey(): string {
  return sessionStorage.getItem('ground_keeps_api_key') || '';
}

function clearApiKey() {
  sessionStorage.removeItem('ground_keeps_api_key');
  window.location.href = '/login';
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    clearApiKey();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
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

export interface RecentVerification {
  timestamp: string;
  type: 'verify' | 'chat/verify';
  verified: boolean;
  hallucination_score: number | null;
  governance_exclusions: number;
  output_governance_passed: boolean | null;
  escalation_action: string | null;
  violations: number;
  audit_id: string | null;
}

export interface Policy {
  agent: string;
  allow: { action: string; resource: string }[];
  deny?: { action: string; resource: string }[];
}

export const api = {
  health: () => request<{ status: string; engines: Record<string, string> }>('/health'),

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

  getChainVerify: () => request<{ valid: boolean }>('/v1/audit/chain/verify'),

  getAgents: () => request<Agent[]>('/v1/agents'),
  createAgent: (name: string, scope: string) =>
    request<{ agent_id: string; client_secret: string; token: string }>('/v1/agents', {
      method: 'POST', body: JSON.stringify({ name, scope }),
    }),
  deleteAgent: (id: string) => fetch(`/v1/agents/${id}`, { method: 'DELETE' }),

  getPolicies: () => request<Policy[]>('/v1/policies'),
  setPolicy: (policy: Policy) =>
    request<{ status: string }>('/v1/policies', {
      method: 'POST', body: JSON.stringify(policy),
    }),

  evaluate: (action: string, resource: string, agentId: string) =>
    request<{ allowed: boolean; reason: string }>('/v1/evaluate', {
      method: 'POST', body: JSON.stringify({ action, resource, agent_id: agentId }),
    }),

  getRecent: () => request<RecentVerification[]>('/v1/recent'),
};
