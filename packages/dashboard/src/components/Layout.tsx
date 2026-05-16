import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="layout">
      <nav className="sidebar">
        <h2>Ground-Keeps</h2>
        <NavLink to="/" end>Overview</NavLink>
        <NavLink to="/audit">Audit Log</NavLink>
        <NavLink to="/monitor">Live Monitor</NavLink>
        <NavLink to="/agents">Agents</NavLink>
        <NavLink to="/policies">Policies</NavLink>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
