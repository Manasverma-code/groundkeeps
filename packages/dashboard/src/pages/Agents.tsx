import { useEffect, useState, useCallback } from 'react';
import { api, type Agent } from '../api.js';

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [newCreds, setNewCreds] = useState<{ agent_id: string; client_secret: string; token: string } | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setAgents(await api.getAgents());
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNewCreds(null);
    if (!name.trim() || !scope.trim()) { setError('Name and scope required'); return; }
    try {
      const creds = await api.createAgent(name, scope);
      setNewCreds(creds);
      setName('');
      setScope('');
      setToast(`Agent "${name}" created`);
      fetchAgents();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = async (id: string, agentName: string) => {
    if (!confirm(`Delete agent "${agentName}"?`)) return;
    try {
      await api.deleteAgent(id);
      setToast(`Agent "${agentName}" deleted`);
      fetchAgents();
    } catch (err) {
      setError(String(err));
    }
  };

  useEffect(() => { if (toast) setTimeout(() => setToast(null), 3000); }, [toast]);

  return (
    <div>
      <div className="header">
        <h1>Agents</h1>
        <p>Manage AI agent identities and scoped credentials</p>
      </div>

      <form onSubmit={handleCreate}>
        <h3 style={{ marginBottom: 12 }}>Register New Agent</h3>
        <div className="row">
          <div>
            <label>Agent Name</label>
            <input placeholder="e.g. hr-bot" value={name} onChange={(e) => setName(e.target.value)} className={error ? 'error' : ''} />
          </div>
          <div>
            <label>Scope</label>
            <input placeholder="e.g. hr:read" value={scope} onChange={(e) => setScope(e.target.value)} className={error ? 'error' : ''} />
          </div>
        </div>
        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button type="submit">Create Agent</button>
      </form>

      {newCreds && (
        <div className="chart-box">
          <h3 style={{ color: '#22c55e' }}>Agent Created</h3>
          <pre>{JSON.stringify(newCreds, null, 2)}</pre>
          <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>
            Save these credentials — they won't be shown again.
          </p>
          <button className="danger" onClick={() => setNewCreds(null)} style={{ marginTop: 8 }}>Dismiss</button>
        </div>
      )}

      {loading ? <p>Loading...</p> : (
        <table>
          <thead>
            <tr>
              <th>Agent ID</th>
              <th>Name</th>
              <th>Scope</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.agent_id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.agent_id.slice(0, 12)}...</td>
                <td>{a.name}</td>
                <td><span className="badge allow">{a.scope}</span></td>
                <td style={{ fontSize: 12 }}>{new Date(a.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="danger" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => handleDelete(a.agent_id, a.name)}>
                    Revoke
                  </button>
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
