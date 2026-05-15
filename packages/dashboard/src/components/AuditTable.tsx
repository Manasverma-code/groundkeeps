import type { AuditEntry } from '../api.js';

interface AuditTableProps {
  entries: AuditEntry[];
}

export function AuditTable({ entries }: AuditTableProps) {
  if (entries.length === 0) {
    return <p style={{ color: '#8899bb', padding: 20 }}>No audit entries found.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Agent</th>
          <th>Action</th>
          <th>Resource</th>
          <th>Result</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.audit_id}>
            <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.timestamp).toLocaleString()}</td>
            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.agent_id.slice(0, 8)}...</td>
            <td>{e.action}</td>
            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.resource}</td>
            <td>
              <span className={`badge ${e.policy_eval.allowed ? 'allow' : 'deny'}`}>
                {e.policy_eval.allowed ? 'ALLOW' : 'DENY'}
              </span>
            </td>
            <td style={{ fontSize: 12, color: '#667' }}>{e.policy_eval.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
