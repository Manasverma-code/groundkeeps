import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Overview } from './pages/Overview.js';
import { AuditLog } from './pages/AuditLog.js';
import { Agents } from './pages/Agents.js';
import { Policies } from './pages/Policies.js';
import { Monitor } from './pages/Monitor.js';
import { Login } from './pages/Login.js';
import './App.css';

export function App() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('ground_keeps_api_key'));

  const handleLogin = (key: string) => {
    sessionStorage.setItem('ground_keeps_api_key', key);
    setApiKey(key);
  };

  if (!apiKey) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Layout onLogout={() => { sessionStorage.removeItem('ground_keeps_api_key'); setApiKey(null); }}>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<Overview />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/policies" element={<Policies />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
