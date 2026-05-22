import { NavLink } from 'react-router-dom';
import { useState, useEffect, type ReactNode } from 'react';
import { OverviewIcon, AuditIcon, MonitorIcon, AgentsIcon, PoliciesIcon } from './Icons.js';

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Overview', icon: OverviewIcon },
  { to: '/audit', label: 'Audit Log', icon: AuditIcon },
  { to: '/monitor', label: 'Live Monitor', icon: MonitorIcon },
  { to: '/agents', label: 'Agents', icon: AgentsIcon },
  { to: '/policies', label: 'Policies', icon: PoliciesIcon },
];

export function Layout({ children, onLogout }: { children: ReactNode; onLogout?: () => void }) {
  const [health, setHealth] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/health');
        setHealth(res.ok ? 'ok' : 'error');
      } catch {
        setHealth('error');
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <ShieldIcon />
          <span>groundkeeps</span>
        </div>

        <div className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <item.icon />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="status-row">
            <span className={`status-dot ${health}`} />
            <span className="status-label">
              {health === 'loading' ? 'Connecting...' : health === 'ok' ? 'Proxy Online' : 'Offline'}
            </span>
          </div>
          <div className="sidebar-footer-actions">
            <span className="sidebar-version">v0.1.0</span>
            {onLogout && (
              <button className="logout-btn" onClick={onLogout} title="Sign out">
                <LogoutIcon />
              </button>
            )}
          </div>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
