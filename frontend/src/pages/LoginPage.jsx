import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import RegisterPage from './RegisterPage';

const DEMO_ACCOUNTS = [
  { role: 'Patient', email: 'patient@demo.rcc', icon: '👤' },
  { role: 'CHW', email: 'chw@demo.rcc', icon: '🏘️' },
  { role: 'Clinician', email: 'doctor@demo.rcc', icon: '🩺' },
  { role: 'Admin', email: 'admin@demo.rcc', icon: '⚙️' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  if (showRegister) return <RegisterPage onBack={() => setShowRegister(false)} onRegistered={() => setShowRegister(false)} />;

  async function handleLogin(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await api.post('/auth/login', { email, password });
      login(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function useAccount(acc) {
    setEmail(acc.email);
    setPassword('Demo1234!');
    setError('');
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🏥 Rural Care Connect</h1>
        <p className="subtitle">Geriatric hybrid care — El Nido, Palawan</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter email" required autoComplete="username" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required autoComplete="current-password" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ textAlign: 'center', margin: '14px 0 4px', fontSize: 13, color: 'var(--gray-400)' }}>
          New patient? <button onClick={() => setShowRegister(true)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Create account</button>
        </div>

        <div className="demo-accounts">
          <p>Quick access — demo accounts</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
            {DEMO_ACCOUNTS.map(a => (
              <button key={a.role} onClick={() => useAccount(a)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--gray-200)',
                  borderRadius: 7, background: email === a.email ? 'var(--green-light)' : 'white',
                  cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                  color: email === a.email ? 'var(--green)' : 'var(--gray-800)' }}>
                <span style={{ fontSize: 16 }}>{a.icon}</span>
                <span>{a.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
