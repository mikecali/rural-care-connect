import { useState, useEffect } from 'react';
import { api } from '../api/client';

const CONDITION_LABELS = { T2DM: 'Type 2 Diabetes', HTN: 'Hypertension', CIHD: 'Chronic Ischaemic Heart Disease' };

function VitalsForm({ patient, onSaved, onCancel }) {
  const [form, setForm] = useState({ systolicBp: '', diastolicBp: '', bloodGlucose: '', weightKg: '', hba1c: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Offline queue stored in localStorage for demo
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = { patientId: patient.id, ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')) };
    // Convert numeric fields
    ['systolicBp','diastolicBp','bloodGlucose','weightKg','hba1c'].forEach(k => { if (payload[k]) payload[k] = parseFloat(payload[k]); });

    if (!navigator.onLine) {
      // Queue locally
      const queue = JSON.parse(localStorage.getItem('rcc_vitals_queue') || '[]');
      queue.push({ ...payload, _queuedAt: new Date().toISOString() });
      localStorage.setItem('rcc_vitals_queue', JSON.stringify(queue));
      onSaved({ offline: true });
      return;
    }

    try {
      await api.post('/vitals', payload);
      onSaved({});
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false); }
  }

  return (
    <div className="card" style={{ maxWidth: 540 }}>
      <div className="card-title">Record Vitals — {patient.full_name}</div>
      {offlineMode && <div className="alert alert-warning">⚠️ Offline mode — vitals will be queued and synced when connected</div>}
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={handleSave}>
        <div className="form-row">
          <div className="form-group">
            <label>Systolic BP (mmHg)</label>
            <input type="number" value={form.systolicBp} onChange={e => set('systolicBp', e.target.value)} placeholder="e.g. 140" min="60" max="300" />
          </div>
          <div className="form-group">
            <label>Diastolic BP (mmHg)</label>
            <input type="number" value={form.diastolicBp} onChange={e => set('diastolicBp', e.target.value)} placeholder="e.g. 90" min="40" max="200" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Blood Glucose (mmol/L)</label>
            <input type="number" step="0.1" value={form.bloodGlucose} onChange={e => set('bloodGlucose', e.target.value)} placeholder="e.g. 7.2" min="1" max="35" />
          </div>
          <div className="form-group">
            <label>Weight (kg)</label>
            <input type="number" step="0.1" value={form.weightKg} onChange={e => set('weightKg', e.target.value)} placeholder="e.g. 62.5" />
          </div>
        </div>
        <div className="form-group">
          <label>HbA1c (%)</label>
          <input type="number" step="0.1" value={form.hba1c} onChange={e => set('hba1c', e.target.value)} placeholder="e.g. 7.8" min="3" max="20" />
        </div>
        <div className="form-group">
          <label>Notes / Observations</label>
          <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Medication adherence, symptoms, patient concerns…" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : offlineMode ? 'Queue for sync' : 'Save vitals'}</button>
          <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function CHWPage() {
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [vitals, setVitals] = useState([]);
  const [view, setView] = useState('list'); // list | detail | record
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const q = JSON.parse(localStorage.getItem('rcc_vitals_queue') || '[]');
    setQueueCount(q.length);
    loadPatients();
  }, []);

  async function loadPatients() {
    setLoading(true);
    try { setPatients(await api.get('/patients')); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function selectPatient(p) {
    setSelected(p);
    setView('detail');
    const v = await api.get(`/vitals/patient/${p.id}`);
    setVitals(v);
  }

  const filtered = patients.filter(p =>
    !search || p.full_name.toLowerCase().includes(search.toLowerCase()) || (p.barangay || '').toLowerCase().includes(search.toLowerCase())
  );

  async function syncQueue() {
    const queue = JSON.parse(localStorage.getItem('rcc_vitals_queue') || '[]');
    if (!queue.length) return;
    let synced = 0;
    const remaining = [];
    for (const item of queue) {
      try { await api.post('/vitals', item); synced++; }
      catch { remaining.push(item); }
    }
    localStorage.setItem('rcc_vitals_queue', JSON.stringify(remaining));
    setQueueCount(remaining.length);
    setSuccess(`Synced ${synced} record(s)`);
    setTimeout(() => setSuccess(''), 4000);
  }

  return (
    <div>
      <div className="page-header">
        <h2>Community Health Worker</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {queueCount > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={syncQueue}>
              ⚡ Sync {queueCount} pending
            </button>
          )}
        </div>
      </div>
      <div className="page-body">
        {success && <div className="alert alert-success">{success}</div>}

        {view === 'list' && (
          <>
            <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
              <input placeholder="🔍 Search patients by name or barangay…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, background: 'none' }} />
            </div>
            {loading ? <div className="loading">Loading patients…</div> : (
              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Patient</th><th>Barangay</th><th>Conditions</th><th>Last Visit</th><th></th></tr></thead>
                    <tbody>
                      {filtered.map(p => (
                        <tr key={p.id}>
                          <td><strong>{p.full_name}</strong><br /><span className="text-muted">{new Date(p.date_of_birth).toLocaleDateString('en-PH')}</span></td>
                          <td>{p.barangay || '—'}</td>
                          <td>{(p.conditions || []).map(c => <span key={c} className="badge badge-amber" style={{ marginRight: 4, marginBottom: 2 }}>{c}</span>)}</td>
                          <td className="text-muted">—</td>
                          <td><button className="btn btn-primary btn-sm" onClick={() => selectPatient(p)}>View</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {view === 'detail' && selected && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setView('list')}>← Back</button>
              <button className="btn btn-primary btn-sm" onClick={() => setView('record')}>+ Record Vitals</button>
            </div>
            <div className="card">
              <div className="detail-header">
                <div className="patient-avatar">👴</div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700 }}>{selected.full_name}</h3>
                  <p className="text-muted">{selected.barangay}, {selected.municipality} · {selected.mobile}</p>
                  <div className="conditions-list">
                    {(selected.conditions || []).map(c => <span key={c} className="badge badge-amber">{c} — {CONDITION_LABELS[c] || c}</span>)}
                  </div>
                </div>
              </div>
            </div>
            <div className="section-title">📊 Vitals History</div>
            {vitals.length === 0 ? <div className="empty-state"><div className="icon">📋</div><p>No vitals recorded yet</p></div> :
              vitals.map(v => (
                <div key={v.id} className="card" style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{new Date(v.measured_at).toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</strong>
                    <span className="badge badge-green">Synced</span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 14 }}>
                    {v.systolic_bp && <span>BP: <strong>{v.systolic_bp}/{v.diastolic_bp}</strong> mmHg</span>}
                    {v.blood_glucose && <span>Glucose: <strong>{v.blood_glucose}</strong> mmol/L</span>}
                    {v.hba1c && <span>HbA1c: <strong>{v.hba1c}%</strong></span>}
                    {v.weight_kg && <span>Weight: <strong>{v.weight_kg} kg</strong></span>}
                  </div>
                  {v.notes && <p style={{ fontSize: 12, color: 'var(--gray-600)', marginTop: 6 }}>📝 {v.notes}</p>}
                </div>
              ))
            }
          </>
        )}

        {view === 'record' && selected && (
          <>
            <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={() => setView('detail')}>← Back to patient</button>
            <VitalsForm patient={selected} onCancel={() => setView('detail')}
              onSaved={({ offline }) => {
                setSuccess(offline ? '⚡ Queued offline — will sync when connected' : '✅ Vitals saved successfully');
                setTimeout(() => setSuccess(''), 4000);
                if (!offline) { setView('detail'); selectPatient(selected); }
                else { const q = JSON.parse(localStorage.getItem('rcc_vitals_queue') || '[]'); setQueueCount(q.length); setView('detail'); }
              }} />
          </>
        )}
      </div>
    </div>
  );
}
