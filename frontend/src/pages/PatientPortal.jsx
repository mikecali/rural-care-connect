import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function vitalFlag(type, value) {
  if (!value) return null;
  const flags = {
    systolic: value >= 140 ? { label: 'High', cls: 'badge-red' } : value < 90 ? { label: 'Low', cls: 'badge-blue' } : { label: 'Normal', cls: 'badge-green' },
    glucose: value >= 7 ? { label: 'High', cls: 'badge-red' } : value < 3.9 ? { label: 'Low', cls: 'badge-blue' } : { label: 'Normal', cls: 'badge-green' },
    hba1c: value >= 7 ? { label: 'Above target', cls: 'badge-amber' } : { label: 'At target', cls: 'badge-green' },
  };
  return flags[type] || null;
}

// ── Teleconsult Room ─────────────────────────────────────────────────
function TeleconsultRoom({ consult, onEnd }) {
  const [elapsed, setElapsed] = useState(0);
  const [chatMsg, setChatMsg] = useState('');
  const [messages, setMessages] = useState([
    { from: 'system', text: 'Secure session started. This is a simulated teleconsultation.' },
    { from: 'clinician', text: `Hello! I'm Dr. Mendoza. I can see your records. How are you feeling today?` },
  ]);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function sendMsg(e) {
    e.preventDefault();
    if (!chatMsg.trim()) return;
    setMessages(m => [...m, { from: 'patient', text: chatMsg }]);
    setChatMsg('');
    // Simulate clinician reply
    setTimeout(() => {
      const replies = [
        'I see. Let me review your latest vitals.',
        'Your blood pressure readings have been noted. Are you taking your Amlodipine regularly?',
        'I\'ll update your treatment plan after this session.',
        'Any side effects from the current medications?',
        'That\'s good to hear. Keep monitoring your blood glucose daily.',
      ];
      setMessages(m => [...m, { from: 'clinician', text: replies[Math.floor(Math.random() * replies.length)] }]);
    }, 1200 + Math.random() * 1000);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d1117', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', background: '#161b22', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #30363d' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3fb950', display: 'inline-block' }}></span>
          <span style={{ color: '#e6edf3', fontWeight: 600, fontSize: 14 }}>Secure Teleconsultation — {consult.practitioner_name || 'Dr. Mendoza'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: '#58a6ff', fontSize: 13, fontFamily: 'monospace' }}>🔒 E2E Encrypted · {fmt(elapsed)}</span>
          <span style={{ color: '#f85149', fontSize: 12 }}>⚠ Not for emergencies — call El Nido Hospital for urgent care</span>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Video area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          {/* Clinician "video" */}
          <div style={{ width: '100%', maxWidth: 560, aspectRatio: '16/9', background: '#161b22', borderRadius: 12, border: '1px solid #30363d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div style={{ fontSize: 64 }}>🩺</div>
            <p style={{ color: '#8b949e', fontSize: 14, marginTop: 8 }}>Dr. Ricardo Mendoza</p>
            <p style={{ color: '#3fb950', fontSize: 12 }}>Internal Medicine / Geriatrics</p>
            <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: 4, fontSize: 11, color: '#e6edf3' }}>Clinician</div>
          </div>
          {/* Patient self-view */}
          <div style={{ width: 160, position: 'relative' }}>
            <div style={{ width: '100%', aspectRatio: '4/3', background: videoOff ? '#161b22' : '#1c2128', borderRadius: 8, border: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {videoOff ? <span style={{ color: '#8b949e', fontSize: 11 }}>Camera off</span> : <span style={{ fontSize: 36 }}>👤</span>}
            </div>
            <div style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4, fontSize: 10, color: '#e6edf3' }}>You</div>
          </div>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { icon: muted ? '🔇' : '🎙️', label: muted ? 'Unmute' : 'Mute', action: () => setMuted(m => !m), active: muted },
              { icon: videoOff ? '📷' : '📹', label: videoOff ? 'Start video' : 'Stop video', action: () => setVideoOff(v => !v), active: videoOff },
            ].map(btn => (
              <button key={btn.label} onClick={btn.action}
                style={{ padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: btn.active ? '#f85149' : '#21262d', color: '#e6edf3', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 20 }}>{btn.icon}</span>
                <span style={{ fontSize: 11 }}>{btn.label}</span>
              </button>
            ))}
            <button onClick={onEnd}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#da3633', color: 'white', fontWeight: 700, fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 20 }}>📴</span>
              <span style={{ fontSize: 11 }}>End call</span>
            </button>
          </div>
        </div>

        {/* Chat panel */}
        <div style={{ width: 320, background: '#161b22', borderLeft: '1px solid #30363d', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #30363d', color: '#8b949e', fontSize: 13, fontWeight: 600 }}>
            💬 Secure Chat
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'patient' ? 'flex-end' : 'flex-start' }}>
                {m.from === 'system' ? (
                  <div style={{ background: '#21262d', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#8b949e', textAlign: 'center', width: '100%' }}>{m.text}</div>
                ) : (
                  <div style={{ maxWidth: '85%', background: m.from === 'patient' ? '#1f6feb' : '#21262d', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: '#e6edf3', lineHeight: 1.4 }}>
                    {m.from === 'clinician' && <div style={{ fontSize: 10, color: '#58a6ff', marginBottom: 3 }}>Dr. Mendoza</div>}
                    {m.text}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendMsg} style={{ padding: 12, borderTop: '1px solid #30363d', display: 'flex', gap: 8 }}>
            <input value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder="Type a message…"
              style={{ flex: 1, background: '#21262d', border: '1px solid #30363d', borderRadius: 6, padding: '8px 10px', color: '#e6edf3', fontSize: 13, outline: 'none' }} />
            <button type="submit" style={{ background: '#1f6feb', border: 'none', borderRadius: 6, padding: '8px 12px', color: 'white', cursor: 'pointer', fontSize: 16 }}>↑</button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Book Consultation Modal ──────────────────────────────────────────
function BookConsultModal({ patient, onClose, onBooked }) {
  const [form, setForm] = useState({ chiefComplaint: '', consultType: 'teleconsult', scheduledAt: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const PRACTITIONER_ID = 'c0000000-0000-0000-0000-000000000002'; // seeded clinician

  async function handleBook(e) {
    e.preventDefault();
    if (!form.chiefComplaint.trim()) { setError('Please describe your chief complaint'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/consultations', {
        patientId: patient.id,
        practitionerId: PRACTITIONER_ID,
        chiefComplaint: form.chiefComplaint,
        consultType: form.consultType,
        scheduledAt: form.scheduledAt || new Date().toISOString(),
      });
      onBooked();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>📅 Book a Consultation</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--gray-400)' }}>×</button>
        </div>

        {/* Clinician card */}
        <div style={{ display: 'flex', gap: 12, background: 'var(--green-light)', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
          <span style={{ fontSize: 32 }}>🩺</span>
          <div>
            <p style={{ fontWeight: 700, color: 'var(--green)' }}>Dr. Ricardo Mendoza</p>
            <p style={{ fontSize: 13, color: 'var(--gray-600)' }}>Internal Medicine / Geriatrics</p>
            <p style={{ fontSize: 12, color: 'var(--green)', marginTop: 2 }}>PRC-MD-2019-12345 · Verified ✓</p>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleBook}>
          <div className="form-group">
            <label>Type of consultation</label>
            <select value={form.consultType} onChange={e => setForm(f => ({ ...f, consultType: e.target.value }))}>
              <option value="teleconsult">🖥️ Teleconsultation (video call)</option>
              <option value="in_person">🏠 In-person home visit</option>
            </select>
          </div>
          <div className="form-group">
            <label>Chief complaint / Reason *</label>
            <textarea rows={3} value={form.chiefComplaint} onChange={e => setForm(f => ({ ...f, chiefComplaint: e.target.value }))}
              placeholder="Describe your symptoms or reason for consultation…" />
          </div>
          <div className="form-group">
            <label>Preferred date & time <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}>(optional — leave blank for next available)</span></label>
            <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
              min={new Date().toISOString().slice(0, 16)} />
          </div>
          <div style={{ background: 'var(--amber-light)', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: 'var(--amber)' }}>
            ⚠️ This is NOT an emergency service. For emergencies, call El Nido Community Hospital immediately.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
              {loading ? 'Booking…' : 'Confirm booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Patient Portal ──────────────────────────────────────────────
export default function PatientPortal({ initialTab = "overview" }) {
  const [patient, setPatient] = useState(null);
  const [vitals, setVitals] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [showBook, setShowBook] = useState(false);
  const [activeConsult, setActiveConsult] = useState(null);
  const [bookSuccess, setBookSuccess] = useState('');

  async function load() {
    try {
      const p = await api.get('/patients/me');
      setPatient(p);
      const [v, c] = await Promise.all([
        api.get(`/vitals/patient/${p.id}`),
        api.get('/consultations'),
      ]);
      setVitals(v);
      setConsultations(c);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="loading">Loading your health record…</div>;
  if (!patient) return <div className="alert alert-error" style={{ margin: 24 }}>Could not load patient record.</div>;

  const latest = vitals[0];
  const chartData = [...vitals].reverse().slice(-10).map(v => ({
    date: new Date(v.measured_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    systolic: v.systolic_bp,
    glucose: v.blood_glucose ? parseFloat(v.blood_glucose) : null,
  }));

  const tabs = ['overview', 'vitals', 'consultations'];

  if (activeConsult) {
    return <TeleconsultRoom consult={activeConsult} onEnd={async () => {
      // Mark as completed when patient ends call
      try { await api.patch(`/consultations/${activeConsult.id}`, { status: 'completed' }); } catch {}
      setActiveConsult(null);
      load();
    }} />;
  }

  return (
    <div>
      {showBook && patient && (
        <BookConsultModal patient={patient} onClose={() => setShowBook(false)} onBooked={() => {
          setShowBook(false);
          setBookSuccess('✅ Consultation booked! See it in your Consultations tab.');
          setTimeout(() => setBookSuccess(''), 5000);
          load();
        }} />
      )}

      <div className="page-header">
        <div className="detail-header" style={{ margin: 0 }}>
          <div className="patient-avatar">👵</div>
          <div>
            <h2>{patient.full_name}</h2>
            <p className="text-muted">DOB: {new Date(patient.date_of_birth).toLocaleDateString('en-PH')} · {patient.barangay}, {patient.municipality}</p>
            <div className="conditions-list">
              {(patient.conditions || []).map(c => <span key={c} className="badge badge-amber">{c}</span>)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>PhilHealth: {patient.philhealth_no || '—'}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowBook(true)}>📅 Book Consultation</button>
        </div>
      </div>

      {bookSuccess && <div className="alert alert-success" style={{ margin: '0 28px', marginTop: 16 }}>{bookSuccess}</div>}

      <div style={{ display: 'flex', gap: 0, padding: '0 28px', background: 'white', borderBottom: '1px solid var(--gray-200)' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: tab === t ? 700 : 400,
              color: tab === t ? 'var(--green)' : 'var(--gray-600)', borderBottom: tab === t ? '2px solid var(--green)' : '2px solid transparent', fontSize: 14 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'consultations' && consultations.length > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--green)', color: 'white', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{consultations.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="page-body">
        {tab === 'overview' && (
          <>
            {latest && (
              <div className="card">
                <div className="card-title">Latest vitals — {new Date(latest.measured_at).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                {latest.systolic_bp && <div className="vital-row">
                  <span className="vital-label">Blood Pressure</span>
                  <span className="vital-value">{latest.systolic_bp}/{latest.diastolic_bp}</span>
                  <span className="vital-unit">mmHg</span>
                  {(() => { const f = vitalFlag('systolic', latest.systolic_bp); return f ? <span className={`badge ${f.cls}`}>{f.label}</span> : null; })()}
                </div>}
                {latest.blood_glucose && <div className="vital-row">
                  <span className="vital-label">Blood Glucose</span>
                  <span className="vital-value">{latest.blood_glucose}</span>
                  <span className="vital-unit">mmol/L</span>
                  {(() => { const f = vitalFlag('glucose', parseFloat(latest.blood_glucose)); return f ? <span className={`badge ${f.cls}`}>{f.label}</span> : null; })()}
                </div>}
                {latest.hba1c && <div className="vital-row">
                  <span className="vital-label">HbA1c</span>
                  <span className="vital-value">{latest.hba1c}</span>
                  <span className="vital-unit">%</span>
                  {(() => { const f = vitalFlag('hba1c', parseFloat(latest.hba1c)); return f ? <span className={`badge ${f.cls}`}>{f.label}</span> : null; })()}
                </div>}
                {latest.weight_kg && <div className="vital-row">
                  <span className="vital-label">Weight</span>
                  <span className="vital-value">{latest.weight_kg}</span>
                  <span className="vital-unit">kg</span>
                </div>}
                {latest.notes && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--gray-600)', background: 'var(--gray-50)', borderRadius: 6, padding: '8px 12px' }}>📝 {latest.notes}</div>}
              </div>
            )}
            {chartData.length > 1 && (
              <div className="card">
                <div className="card-title">Blood Pressure Trend</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[60, 200]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="systolic" stroke="#c62828" strokeWidth={2} dot={{ r: 3 }} name="Systolic BP" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {!latest && (
              <div className="empty-state"><div className="icon">📊</div><p>No vitals recorded yet. A community health worker will record these during your home visit.</p></div>
            )}
          </>
        )}

        {tab === 'vitals' && (
          <div className="card">
            <div className="card-title">All vitals ({vitals.length} records)</div>
            {vitals.length === 0 ? <div className="empty-state"><div className="icon">📋</div><p>No vitals yet</p></div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>BP (mmHg)</th><th>Glucose (mmol/L)</th><th>HbA1c (%)</th><th>Weight (kg)</th><th>Notes</th></tr></thead>
                  <tbody>
                    {vitals.map(v => (
                      <tr key={v.id}>
                        <td>{new Date(v.measured_at).toLocaleDateString('en-PH')}</td>
                        <td>{v.systolic_bp ? `${v.systolic_bp}/${v.diastolic_bp}` : '—'}</td>
                        <td>{v.blood_glucose || '—'}</td>
                        <td>{v.hba1c || '—'}</td>
                        <td>{v.weight_kg || '—'}</td>
                        <td style={{ maxWidth: 200, fontSize: 12 }}>{v.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'consultations' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setShowBook(true)}>📅 Book new consultation</button>
            </div>
            {consultations.length === 0
              ? <div className="empty-state"><div className="icon">🩺</div><p>No consultations yet. Book one above.</p></div>
              : consultations.map(c => (
                <div key={c.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 16, marginBottom: 12, background: 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <p style={{ fontWeight: 700 }}>{c.practitioner_name}</p>
                      <p style={{ fontSize: 13, color: 'var(--gray-600)' }}>
                        {c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={`badge ${c.consult_type === 'teleconsult' ? 'badge-blue' : 'badge-green'}`}>{c.consult_type === 'teleconsult' ? '🖥️ Teleconsult' : '🏠 In-person'}</span>
                      <span className={`badge ${c.status === 'completed' ? 'badge-green' : c.status === 'cancelled' ? 'badge-red' : 'badge-blue'}`}>{c.status}</span>
                    </div>
                  </div>
                  {c.chief_complaint && <p style={{ fontSize: 13, marginBottom: 4 }}>Reason: {c.chief_complaint}</p>}
                  {c.diagnosis && <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-800)' }}>Diagnosis: {c.diagnosis}</p>}
                  {c.treatment_plan && <p style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 4 }}>Plan: {c.treatment_plan}</p>}
                  {c.status === 'scheduled' && c.consult_type === 'teleconsult' && (
                    <button className="btn btn-blue btn-sm" style={{ marginTop: 10 }} onClick={() => setActiveConsult(c)}>
                      🎥 Join teleconsultation
                    </button>
                  )}
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
