import { useState } from 'react';
import { api } from '../api/client';

const CONDITIONS = ['T2DM', 'HTN', 'CIHD'];
const CONDITION_LABELS = { T2DM: 'Type 2 Diabetes', HTN: 'Hypertension', CIHD: 'Chronic Ischaemic Heart Disease' };

const BARANGAYS = ['El Nido Poblacion', 'Sibaltan', 'Corong-Corong', 'Maremegmeg', 'Buena Suerte',
  'Teneguiban', 'San Fernando', 'Aberawan', 'Bagong Bayan', 'Bebeladan', 'Bucana', 'Liminangcong', 'Malatgao',
  'Manaloc', 'Masagana', 'New Ibajay', 'Pag-asa', 'Pasadeña', 'Pinagsalugan', 'Poblacion', 'Punang',
  'Rigid', 'Rollo', 'Sabang', 'San Isidro', 'San Jose', 'Sibaltan', 'Tagabinet', 'Tegeraoan', 'Tulalian'];

export default function RegisterPage({ onBack, onRegistered }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    fullName: '', dateOfBirth: '', mobile: '+63', email: '', password: '', confirmPassword: '',
    philhealthNo: '', barangay: '', conditions: [],
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function toggleCondition(c) {
    setForm(f => ({
      ...f,
      conditions: f.conditions.includes(c) ? f.conditions.filter(x => x !== c) : [...f.conditions, c]
    }));
  }

  function validateStep1() {
    if (!form.fullName.trim()) return 'Full name is required';
    if (!form.dateOfBirth) return 'Date of birth is required';
    const dob = new Date(form.dateOfBirth);
    const age = (Date.now() - dob) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 18) return 'Patient must be 18 years or older';
    if (!form.mobile.match(/^\+63\d{10}$/)) return 'Mobile must be +63 followed by 10 digits';
    if (!form.barangay) return 'Please select your barangay';
    return null;
  }

  function validateStep2() {
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'Valid email is required';
    if (form.password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(form.password)) return 'Password must contain at least one uppercase letter';
    if (!/[0-9]/.test(form.password)) return 'Password must contain at least one number';
    if (form.password !== form.confirmPassword) return 'Passwords do not match';
    return null;
  }

  function nextStep() {
    setError('');
    const err = step === 1 ? validateStep1() : null;
    if (err) { setError(err); return; }
    setStep(s => s + 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const err = validateStep2();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      await api.post('/auth/register', {
        fullName: form.fullName,
        dateOfBirth: form.dateOfBirth,
        mobile: form.mobile,
        email: form.email,
        password: form.password,
        philhealthNo: form.philhealthNo || undefined,
        barangay: form.barangay,
        conditions: form.conditions,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (success) return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <h2 style={{ color: 'var(--green)', marginBottom: 8 }}>Account created!</h2>
        <p style={{ color: 'var(--gray-600)', fontSize: 14, marginBottom: 24 }}>
          Welcome to Rural Care Connect, {form.fullName.split(' ')[0]}.<br />
          You can now sign in with your email and password.
        </p>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onBack}>Sign in now</button>
      </div>
    </div>
  );

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-600)', fontSize: 18, lineHeight: 1 }}>←</button>
          <h1 style={{ fontSize: 18 }}>🏥 Create Patient Account</h1>
        </div>
        <p className="subtitle">Step {step} of 2 — {step === 1 ? 'Personal details' : 'Account credentials'}</p>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {[1, 2].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? 'var(--green)' : 'var(--gray-200)', transition: 'background 0.3s' }} />
          ))}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {step === 1 && (
          <div>
            <div className="form-group">
              <label>Full legal name *</label>
              <input value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="As it appears on your government ID" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Date of birth *</label>
                <input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} max={new Date().toISOString().split('T')[0]} />
              </div>
              <div className="form-group">
                <label>Mobile number *</label>
                <input value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="+63XXXXXXXXXX" />
              </div>
            </div>
            <div className="form-group">
              <label>Barangay *</label>
              <select value={form.barangay} onChange={e => set('barangay', e.target.value)}>
                <option value="">Select barangay…</option>
                {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>PhilHealth number <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional)</span></label>
              <input value={form.philhealthNo} onChange={e => set('philhealthNo', e.target.value)} placeholder="PH-XXXXXXXX" />
            </div>
            <div className="form-group">
              <label>Known health conditions <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(select all that apply)</span></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {CONDITIONS.map(c => (
                  <button key={c} type="button" onClick={() => toggleCondition(c)}
                    style={{ padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${form.conditions.includes(c) ? 'var(--green)' : 'var(--gray-200)'}`,
                      background: form.conditions.includes(c) ? 'var(--green-light)' : 'white',
                      color: form.conditions.includes(c) ? 'var(--green)' : 'var(--gray-600)',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    {c}
                  </button>
                ))}
              </div>
              {form.conditions.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
                  {form.conditions.map(c => CONDITION_LABELS[c]).join(' · ')}
                </p>
              )}
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={nextStep}>Continue →</button>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email address *</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" autoComplete="email" />
            </div>
            <div className="form-group">
              <label>Password *</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 8 chars, 1 uppercase, 1 number" autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label>Confirm password *</label>
              <input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="Repeat password" autoComplete="new-password" />
            </div>

            {/* RA 10173 consent */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--gray-800)' }}>Data Privacy Consent (RA 10173)</strong><br />
              By creating an account, you consent to Rural Care Connect collecting and processing your personal health information for the purpose of providing healthcare services. Your data will be stored securely and will not be shared without your explicit consent. You may request access, correction, or deletion of your data at any time.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
