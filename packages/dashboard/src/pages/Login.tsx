import { useState } from 'react';

export function Login({ onLogin }: { onLogin: (key: string) => void }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/health', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        onLogin(key);
      } else {
        setError('Invalid API key');
      }
    } catch {
      setError('Could not connect to proxy');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <ShieldIcon />
          <h1>Ground-Keeps</h1>
        </div>
        <p className="login-subtitle">Enter your proxy API key to access the dashboard</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="api-key">API Key</label>
          <input
            id="api-key"
            type="password"
            placeholder="Enter your PROXY_API_KEY"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoFocus
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" disabled={loading || !key.trim()}>
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
