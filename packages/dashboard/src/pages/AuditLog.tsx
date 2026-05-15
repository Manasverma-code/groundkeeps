import { useEffect, useState, useCallback } from 'react';
import { api, type AuditEntry } from '../api.js';
import { AuditTable } from '../components/AuditTable.js';

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAgent, setFilterAgent] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLog({
        agent_id: filterAgent || undefined,
        action: filterAction || undefined,
        limit: pageSize,
        offset: page * pageSize,
      });
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [filterAgent, filterAction, page]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  return (
    <div>
      <div className="header">
        <h1>Audit Log</h1>
        <p>Tamper-proof action log with SHA-256 chain verification</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); setPage(0); fetchLog(); }}>
        <div className="row">
          <div>
            <label>Agent ID</label>
            <input
              placeholder="Filter by agent ID..."
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
            />
          </div>
          <div>
            <label>Action</label>
            <input
              placeholder="Filter by action..."
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            />
          </div>
        </div>
        <button type="submit">Search</button>
      </form>

      {loading ? <p>Loading...</p> : <AuditTable entries={entries} />}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          style={{ background: page === 0 ? '#e5e7eb' : '#1a1a2e', cursor: page === 0 ? 'default' : 'pointer' }}
        >
          Previous
        </button>
        <span style={{ padding: '10px 0', fontSize: 13, color: '#667' }}>Page {page + 1}</span>
        <button
          disabled={entries.length < pageSize}
          onClick={() => setPage((p) => p + 1)}
          style={{ background: entries.length < pageSize ? '#e5e7eb' : '#1a1a2e', cursor: entries.length < pageSize ? 'default' : 'pointer' }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
