import { useState, useEffect } from 'react';
import { api } from '../api/client';

function ConsultDetail({ consult, onBack, onUpdated }) {
  const [notes, setNotes] = useState({ diagnosis: consult.diagnosis || '', treatmentPlan: consult.treatment_plan || '' });
  const [rxForm, setRxForm] = useState({ drugGenericName: '', dosage: '', frequency: '', quantity: '', instructions: '' });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [success, setSuccess] = useState('');

  useEffect(() => { loadDetail(); }, []);

  async function loadDetail() {
    const d = await api.get(`/consultations/${consult.id}`);
    setDetail(d);
    setNotes({ diagnosis: d.diagnosis || '', treatmentPlan: d.treatment_plan || '' });
  }

  async function saveNotes() {
    setSaving(true);
    await api.patch(`/consultations/${consult.id}`, { diagnosis: notes.diagnosis, treatmentPlan: notes.treatmentPlan });
    setSuccess('Notes saved'); setTimeout(() => setSuccess(''), 3000);
    setSaving(false); onUpdated();
  }

  async function completeConsult() {
    await api.patch(`/consultations/${consult.id}`, { status: 'completed' });
    onUpdated(); onBack();
  }

  async function addRx(e) {
    e.preventDefault();
    if (!rxForm.drugGenericName) return;
    await api.post(`/consultations/${consult.id}/prescriptions`, { ...rxForm, quantity: parseInt(rxForm.quantity) || null });
    setRxForm({ drugGenericName: '', dosage: '', frequency: '', quantity: '', instructions: '' });
    loadDetail();
  }

  if (!detail) return <div className="loading">Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
        <span className={`badge ${detail.status === 'completed' ? 'badge-green' : 'badge-blue'}`}>{detail.status}</span>
        {detail.status !== 'completed' && <button className="btn btn-primary btn-sm" onClick={completeConsult}>✓ Mark Complete</button>}
      </div>
      {success && <div className="alert alert-success">{success}</div>}

      <div className="two-col">
        <div>
          <div className="card">
            <div className="card-title">Patient</div>
            <p style={{ fontWeight: 700, fontSize: 16 }}>{detail.patient_name}</p>
            <p className="text-muted">DOB: {new Date(detail.date_of_birth).toLocaleDateString('en-PH')}</p>
            <div className="conditions-list mt-16">
              {(detail.conditions || []).map(c => <span key={c} className="badge badge-amber">{c}</span>)}
            </div>
          </div>
          <div className="card">
            <div className="card-title">Chief Complaint</div>
            <p style={{ fontSize: 14 }}>{detail.chief_complaint || '—'}</p>
          </div>
          <div className="card">
            <div className="card-title">Diagnosis & Plan</div>
            <div className="form-group">
              <label>Diagnosis</label>
              <textarea rows={2} value={notes.diagnosis} onChange={e => setNotes(n => ({ ...n, diagnosis: e.target.value }))} placeholder="ICD-10 diagnosis…" />
            </div>
            <div className="form-group">
              <label>Treatment Plan</label>
              <textarea rows={3} value={notes.treatmentPlan} onChange={e => setNotes(n => ({ ...n, treatmentPlan: e.target.value }))} placeholder="Management plan…" />
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveNotes} disabled={saving}>{saving ? 'Saving…' : 'Save notes'}</button>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-title">Prescriptions (RA 6675 — generic name required)</div>
            {(detail.prescriptions || []).map((rx, i) => (
              <div key={rx.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                <p style={{ fontWeight: 700 }}>{i + 1}. {rx.drug_generic_name}</p>
                <p style={{ fontSize: 13, color: 'var(--gray-600)' }}>{rx.dosage} — {rx.frequency} — Qty: {rx.quantity || '—'}</p>
                {rx.instructions && <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>{rx.instructions}</p>}
              </div>
            ))}
            {detail.status !== 'completed' && (
              <form onSubmit={addRx} style={{ marginTop: 14 }}>
                <div className="section-title" style={{ fontSize: 13, marginBottom: 10 }}>+ Add Prescription</div>
                <div className="form-group">
                  <label>Generic Drug Name *</label>
                  <input value={rxForm.drugGenericName} onChange={e => setRxForm(f => ({ ...f, drugGenericName: e.target.value }))} placeholder="e.g. Amlodipine" required />
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Dosage</label><input value={rxForm.dosage} onChange={e => setRxForm(f => ({ ...f, dosage: e.target.value }))} placeholder="e.g. 10mg" /></div>
                  <div className="form-group"><label>Frequency</label><input value={rxForm.frequency} onChange={e => setRxForm(f => ({ ...f, frequency: e.target.value }))} placeholder="e.g. Once daily (OD)" /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Qty</label><input type="number" value={rxForm.quantity} onChange={e => setRxForm(f => ({ ...f, quantity: e.target.value }))} placeholder="30" /></div>
                  <div className="form-group"><label>Instructions</label><input value={rxForm.instructions} onChange={e => setRxForm(f => ({ ...f, instructions: e.target.value }))} placeholder="With food" /></div>
                </div>
                <button className="btn btn-blue btn-sm" type="submit">Add drug</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClinicianPage() {
  const [consultations, setConsultations] = useState([]);
  const [patients, setPatients] = useState([]);
  const [practitioners, setPractitioners] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ patientId: '', chiefComplaint: '', consultType: 'teleconsult', scheduledAt: new Date().toISOString().slice(0, 16) });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [c, p] = await Promise.all([api.get('/consultations'), api.get('/patients')]);
    setConsultations(c); setPatients(p);
    setLoading(false);
  }

  async function createConsult(e) {
    e.preventDefault();
    const auth = JSON.parse(localStorage.getItem('rcc_auth') || '{}');
    // Get practitioner id from backend by user id — simplified: use first verified clinician
    const allPractitioners = await api.get('/patients').catch(() => []);
    // We POST with logged-in clinician — backend will use their user id
    // For demo: get practitioner linked to current user
    const meRes = await fetch('/api/patients', { headers: { Authorization: `Bearer ${auth.token}` } });
    // Actually use a direct practitioner lookup — simplified for demo
    await api.post('/consultations', {
      ...newForm,
      practitionerId: 'c0000000-0000-0000-0000-000000000002', // seeded clinician
    });
    setShowNewForm(false);
    loadAll();
  }

  if (loading) return <div className="loading">Loading consultations…</div>;

  if (selected) return (
    <div>
      <div className="page-header"><h2>Consultation Detail</h2></div>
      <div className="page-body">
        <ConsultDetail consult={selected} onBack={() => { setSelected(null); loadAll(); }} onUpdated={loadAll} />
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h2>Clinician Dashboard</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNewForm(!showNewForm)}>+ New Consultation</button>
      </div>
      <div className="page-body">
        {showNewForm && (
          <div className="card" style={{ maxWidth: 480 }}>
            <div className="card-title">Schedule Consultation</div>
            <form onSubmit={createConsult}>
              <div className="form-group">
                <label>Patient</label>
                <select value={newForm.patientId} onChange={e => setNewForm(f => ({ ...f, patientId: e.target.value }))} required>
                  <option value="">Select patient…</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.full_name} — {p.barangay}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Chief Complaint</label>
                <textarea rows={2} value={newForm.chiefComplaint} onChange={e => setNewForm(f => ({ ...f, chiefComplaint: e.target.value }))} placeholder="Reason for consultation…" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select value={newForm.consultType} onChange={e => setNewForm(f => ({ ...f, consultType: e.target.value }))}>
                    <option value="teleconsult">Teleconsult</option>
                    <option value="in_person">In-person</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Scheduled</label>
                  <input type="datetime-local" value={newForm.scheduledAt} onChange={e => setNewForm(f => ({ ...f, scheduledAt: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" type="submit">Schedule</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowNewForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray-200)', fontWeight: 600 }}>
            Consultations ({consultations.length})
          </div>
          {consultations.length === 0 ? (
            <div className="empty-state"><div className="icon">📋</div><p>No consultations yet</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Patient</th><th>Type</th><th>Scheduled</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {consultations.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.patient_name}</strong></td>
                      <td><span className={`badge ${c.consult_type === 'teleconsult' ? 'badge-blue' : 'badge-green'}`}>{c.consult_type}</span></td>
                      <td className="text-muted">{c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td><span className={`badge ${c.status === 'completed' ? 'badge-green' : c.status === 'cancelled' ? 'badge-red' : 'badge-blue'}`}>{c.status}</span></td>
                      <td><button className="btn btn-secondary btn-sm" onClick={() => setSelected(c)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
