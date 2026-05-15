import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api, type AuditEntry } from '../api.js';
import { StatsCard } from '../components/StatsCard.js';

export function Overview() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [agentCount, setAgentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getAuditLog({ limit: 100 }),
      api.getAgents().then((a) => setAgentCount(a.length)).catch(() => {}),
    ])
      .then(([log]) => setEntries(log))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalActions = entries.length;
  const blockedActions = entries.filter((e) => !e.policy_eval.allowed).length;
  const blockedRate = totalActions > 0 ? ((blockedActions / totalActions) * 100).toFixed(1) : '0.0';

  const actionsByType = entries.reduce<Record<string, number>>((acc, e) => {
    const key = e.action.replace(':blocked', '');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(actionsByType).map(([action, count]) => ({
    action,
    total: count,
  }));

  if (loading) return <div className="header"><h1>Loading...</h1></div>;

  return (
    <div>
      <div className="header">
        <h1>Overview</h1>
        <p>Real-time Trust Layer metrics</p>
      </div>

      <div className="cards">
        <StatsCard title="Total Actions" value={totalActions} />
        <StatsCard title="Blocked Actions" value={blockedActions} color="red" subtitle={`${blockedRate}% blocked rate`} />
        <StatsCard title="Registered Agents" value={agentCount} color="green" />
        <StatsCard title="Audit Chain" value="Verified" color="green" subtitle="SHA-256 hash chain intact" />
      </div>

      {chartData.length > 0 && (
        <div className="chart-box">
          <h3>Actions by Type</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="action" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="total" fill="#1a1a2e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="chart-box">
        <h3>Recent Audit Entries ({blockedActions} blocked)</h3>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Agent</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, 10).map((e) => (
              <tr key={e.audit_id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(e.timestamp).toLocaleString()}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{e.agent_id.slice(0, 8)}</td>
                <td>{e.action}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{e.resource}</td>
                <td>
                  <span className={`badge ${e.policy_eval.allowed ? 'allow' : 'deny'}`}>
                    {e.policy_eval.allowed ? 'ALLOW' : 'DENY'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
