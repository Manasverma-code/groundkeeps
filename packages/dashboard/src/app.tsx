import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Overview } from './pages/Overview.js';
import { AuditLog } from './pages/AuditLog.js';
import { Agents } from './pages/Agents.js';
import { Policies } from './pages/Policies.js';
import './App.css';

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/policies" element={<Policies />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
