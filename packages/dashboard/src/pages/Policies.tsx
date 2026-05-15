import { useEffect, useState, useCallback } from 'react';
import { api, type Policy } from '../api.js';

export function Policies() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState('');
  const [action, setAction] = useState('read');
  const [resource, setResource] = useState('');
  const [denyAction, setDenyAction] = useState('delete');
  const [denyResource, setDenyResource] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    try {
      setPolicies(await api.getPolicies());
    } catch {
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!agent.trim() || !resource.trim()) { setError('Agent and resource required'); return; }
    try {
      const policy: Policy = {
        agent: agent.trim(),
        allow: [{ action: action as 'read' | 'write' | 'delete' | 'execute', resource: resource.trim() }],
      };
      if (denyResource.trim()) {
        policy.deny = [{ action: denyAction as 'read' | 'write' | 'delete' | 'execute', resource: denyResource.trim() }];
      }
      await api.setPolicy(policy);
      setToast(`Policy set for "${agent}"`);
      setAgent('');
      setResource('');
      setDenyResource('');
      fetchPolicies();
    } catch (err) {
      setError(String(err));
    }
  };

  useEffect(() => { if (toast) setTimeout(() => setToast(null), 3000); }, [toast]);

  return (
    <div>
      <div className="header">
        <h1>Policies</h1>
        <p>Declarative allow/deny rules for agent actions</p>
      </div>

      <form onSubmit={handleCreate}>
        <h3 style={{ marginBottom: 12 }}>Set Policy</h3>
        <div>
          <label>Agent Pattern</label>
          <input placeholder="e.g. hr-bot or *-bot" value={agent} onChange={(e) => setAgent(e.target.value)} className={error ? 'error' : ''} />
        </div>
        <h4 style={{ margin: '12px 0 8px', fontSize: 13, color: '#22c55e' }}>Allow</h4>
        <div className="row">
          <div>
            <label>Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="read">read</option>
              <option value="write">write</option>
              <option value="delete">delete</option>
              <option value="execute">execute</option>
            </select>
          </div>
          <div>
            <label>Resource Pattern</label>
            <input placeholder="e.g. employee-records/*" value={resource} onChange={(e) => setResource(e.target.value)} />
          </div>
        </div>
        <h4 style={{ margin: '12px 0 8px', fontSize: 13, color: '#ef4444' }}>Deny (optional)</h4>
        <div className="row">
          <div>
            <label>Action</label>
            <select value={denyAction} onChange={(e) => setDenyAction(e.target.value)}>
              <option value="read">read</option>
              <option value="write">write</option>
              <option value="delete">delete</option>
              <option value="execute">execute</option>
            </select>
          </div>
          <div>
            <label>Resource Pattern</label>
            <input placeholder="e.g. sensitive/*" value={denyResource} onChange={(e) => setDenyResource(e.target.value)} />
          </div>
        </div>
        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button type="submit">Set Policy</button>
      </form>

      {loading ? <p>Loading...</p> : (
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Allow Rules</th>
              <th>Deny Rules</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace' }}>{p.agent}</td>
                <td>
                  {p.allow.map((r, j) => (
                    <span key={j} className="badge allow" style={{ marginRight: 4 }}>
                      {r.action} {r.resource}
                    </span>
                  ))}
                </td>
                <td>
                  {(p.deny ?? []).map((r, j) => (
                    <span key={j} className="badge deny" style={{ marginRight: 4 }}>
                      {r.action} {r.resource}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
