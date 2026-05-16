import { useState, useEffect, useRef } from 'react';
import { api, type RecentVerification } from '../api.js';

function scoreColor(score: number | null): string {
  if (score === null) return '#b8b8be';
  if (score < 0.3) return '#7a9e7e';
  if (score < 0.6) return '#d4a84b';
  return '#c48a8a';
}

function EscalationBadge({ action }: { action: string | null }) {
  if (!action) return <span className="badge" style={{ background: '#f0ece7', color: '#b8b8be' }}>none</span>;
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    pass: { bg: '#f0f5ef', color: '#6b8f6e', border: '#dce8da' },
    flag: { bg: '#fdf6e8', color: '#d4a84b', border: '#f0e4cc' },
    block: { bg: '#f8eeee', color: '#b57070', border: '#eedcdc' },
    correct: { bg: '#e8f0f8', color: '#5a8aaa', border: '#ccddee' },
  };
  const c = colors[action] ?? { bg: '#f0ece7', color: '#b8b8be', border: '#e0dbd6' };
  return <span className="badge" style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{action}</span>;
}

export function Monitor() {
  const [entries, setEntries] = useState<RecentVerification[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const poll = async () => {
      try { setEntries(await api.getRecent()); } catch { /* server not ready */ }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (autoScroll && feedRef.current) feedRef.current.scrollTop = 0;
  }, [entries, autoScroll]);

  const scored = entries.filter(e => e.hallucination_score !== null);
  const avgScore = scored.length ? scored.reduce((s, e) => s + e.hallucination_score!, 0) / scored.length : null;
  const checked = entries.filter(e => e.output_governance_passed !== null);
  const passRate = checked.length ? checked.filter(e => e.output_governance_passed).length / checked.length : null;
  const escalated = entries.filter(e => e.escalation_action && e.escalation_action !== 'pass');
  const totalExclusions = entries.reduce((s, e) => s + e.governance_exclusions, 0);

  return (
    <div>
      <div className="header">
        <h1>Live Monitor</h1>
        <p>Real-time hallucination scores and governance results</p>
      </div>

      <div className="cards">
        <div className="card">
          <h3>Avg Hallucination Score</h3>
          <div className="value" style={{ color: scoreColor(avgScore) }}>
            {avgScore !== null ? `${(avgScore * 100).toFixed(1)}%` : '\u2014'}
          </div>
          <div className="subtitle">Across last {entries.length} verifications</div>
        </div>
        <div className="card">
          <h3>Output Gov Pass Rate</h3>
          <div className="value" style={{ color: passRate !== null ? (passRate >= 0.8 ? '#7a9e7e' : passRate >= 0.5 ? '#d4a84b' : '#c48a8a') : '#b8b8be' }}>
            {passRate !== null ? `${(passRate * 100).toFixed(0)}%` : '\u2014'}
          </div>
          <div className="subtitle">{checked.length} checks performed</div>
        </div>
        <div className="card">
          <h3>Escalations</h3>
          <div className="value" style={{ color: '#d4a84b' }}>{escalated.length}</div>
          <div className="subtitle">{entries.filter(e => e.escalation_action === 'block').length} blocked</div>
        </div>
        <div className="card">
          <h3>Excluded Sources</h3>
          <div className="value" style={{ color: '#5a8aaa' }}>{totalExclusions}</div>
          <div className="subtitle">Filtered by document governance</div>
        </div>
      </div>

      <div className="chart-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Verification Feed</h3>
          <label style={{ fontSize: 12, color: '#9a9a9e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
            Auto-scroll
          </label>
        </div>
        <div ref={feedRef} style={{ maxHeight: 600, overflowY: 'auto' }}>
          {entries.length === 0 ? (
            <p style={{ color: '#b8b8be', fontSize: 13, textAlign: 'center', padding: 40 }}>
              Waiting for verification data\u2026
            </p>
          ) : (
            entries.map((entry, i) => (
              <div key={`${entry.timestamp}-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0',
                borderBottom: i < entries.length - 1 ? '1px solid #f0ece7' : 'none',
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 700, fontSize: 13,
                  background: entry.hallucination_score !== null ? `${scoreColor(entry.hallucination_score)}22` : '#f0ece7',
                  color: scoreColor(entry.hallucination_score),
                  border: `2px solid ${scoreColor(entry.hallucination_score)}`,
                  flexShrink: 0,
                }}>
                  {entry.hallucination_score !== null ? `${(entry.hallucination_score * 100).toFixed(0)}` : '\u2014'}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                      color: entry.verified ? '#7a9e7e' : '#c48a8a',
                    }}>
                      {entry.verified ? 'VERIFIED' : 'BLOCKED'}
                    </span>
                    <span style={{ fontSize: 11, color: '#b8b8be' }}>\u00B7</span>
                    <span style={{ fontSize: 11, color: '#b8b8be' }}>{entry.type}</span>
                    <span style={{ fontSize: 11, color: '#b8b8be' }}>\u00B7</span>
                    <span style={{ fontSize: 11, color: '#b8b8be' }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {entry.governance_exclusions > 0 && (
                      <span style={{ fontSize: 12, color: '#5a8aaa' }}>{entry.governance_exclusions} excluded</span>
                    )}
                    <EscalationBadge action={entry.escalation_action} />
                    {entry.output_governance_passed !== null && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: entry.output_governance_passed ? '#7a9e7e' : '#c48a8a' }}>
                        {entry.output_governance_passed ? '\u2713 citations' : `\u2717 ${entry.violations} violations`}
                      </span>
                    )}
                    {entry.audit_id && (
                      <span style={{ fontSize: 11, color: '#b8b8be', fontFamily: 'monospace' }}>{entry.audit_id.slice(0, 8)}\u2026</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
