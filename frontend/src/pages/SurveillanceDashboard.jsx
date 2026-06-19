// build-$(date +%s)
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const ALERT_COLORS = {
  watch:   { bg: '#FAEEDA', text: '#633806', border: '#FAC775' },
  warning: { bg: '#FBEAF0', text: '#72243E', border: '#F4C0D1' },
  alert:   { bg: '#FCEBEB', text: '#791F1F', border: '#F7C1C1' },
  normal:  { bg: '#E1F5EE', text: '#085041', border: '#9FE1CB' },
};
const PIE_COLORS = ['#9FE1CB','#FAC775','#E24B4A','#7F77DD'];
// Tabs available per role
const ROLE_TABS = {
  patient:   ['report-symptoms'],
  chw:       ['overview','report-symptoms','reports','health'],
  clinician: ['overview','report-symptoms','reports','health'],
  admin:     ['overview','report-symptoms','reports','health'],
};
const TAB_LABELS = {
  overview:          'Overview',
  'report-symptoms': 'Report Symptoms',
  reports:           'AI Reports',
  health:            'Health Metrics',
};

export default function SurveillanceDashboard({ defaultTab }) {
  const { auth } = useAuth();
  const role = auth?.role || 'patient';
  const TABS = ROLE_TABS[role] || ['report-symptoms'];
  const [tab, setTab]         = useState(defaultTab || TABS[0]);
  const [summary, setSummary] = useState(null);
  const [aiReports, setAiReports] = useState([]);
  const [activeReport, setActiveReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [days, setDays]       = useState(30);

  useEffect(() => {
    // Patients only see the report form — no summary needed
    if (role === 'patient') { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.get(`/surveillance/summary?days=${days}`)
       .then(data => setSummary(data))
       .catch(e => { setError(e.message || 'Failed to load'); })
       .finally(() => setLoading(false));
  }, [days, role]);

  useEffect(() => {
    if (tab === 'reports' && !aiReports.length)
      api.get('/surveillance/ai-reports').then(setAiReports).catch(() => {});
  }, [tab]);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const result = await api.post('/surveillance/generate-report', { days });
      setActiveReport(result.report);
      setAiReports(prev => [result.report, ...prev]);
      setTab('reports');
    } catch { alert('Report generation failed. Check Ollama is running.'); }
    finally { setGenerating(false); }
  };

  const printReport = () => {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Surveillance Report</title>
    <style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;font-size:14px;line-height:1.7}
    h2{color:#1a1a1a}h3{color:#333;margin-top:24px}pre{white-space:pre-wrap;font-family:inherit}
    .meta{color:#666;font-size:13px;margin-bottom:20px}
    .disclaimer{background:#fff3cd;border:1px solid #ffc107;padding:12px;border-radius:6px;font-size:13px;margin-bottom:20px}</style>
    </head><body>
    <h2>Rural Care Connect — Symptom Surveillance Report</h2>
    <div class="meta">Generated: ${new Date(activeReport?.generated_at).toLocaleString('en-PH')} &nbsp;|&nbsp; Model: ${activeReport?.model_used} &nbsp;|&nbsp; Alert level: ${activeReport?.alert_level?.toUpperCase()}</div>
    <div class="disclaimer"><strong>Disclaimer:</strong> This report is based on symptom reports only — not confirmed diagnoses. All conditions mentioned are unconfirmed and require clinical assessment and laboratory testing before any diagnosis can be made.</div>
    <pre>${activeReport?.ai_summary}</pre></body></html>`);
    w.document.close(); w.print();
  };

  if (loading) return <div className="loading">Loading surveillance data…</div>;


  const hotspots = summary?.detected_hotspots || summary?.active_hotspots || [];
  const alertLevel = hotspots.some(h => h.alert_level === 'alert') ? 'alert'
                   : hotspots.some(h => h.alert_level === 'warning') ? 'warning'
                   : hotspots.length > 0 ? 'watch' : 'normal';
  const alertC = ALERT_COLORS[alertLevel];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Symptom Surveillance</h2>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 2 }}>
            Symptom-based — no diagnosis required · AI interprets patterns · Location hotspot mapping
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={days} onChange={e => { setDays(Number(e.target.value)); setSummary(null); setLoading(true); }}
            className="select" style={{ fontSize: 13 }}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          {role !== 'patient' && (
            <button className="btn btn-primary" onClick={generateReport} disabled={generating}>
              {generating ? '⏳ Analysing…' : '🤖 Generate AI Report'}
            </button>
          )}
        </div>
      </div>

      {/* Disclaimer banner */}
      <div style={{ margin: '0 28px 12px', padding: '10px 14px', borderRadius: 8,
        background: '#FEF9E7', border: '1px solid #FAC775', fontSize: 12, color: '#633806' }}>
        <strong>Clinical note:</strong> Symptom reports here are unconfirmed. AI interpretation identifies patterns — not diagnoses. Blood work or clinical assessment is required before any disease can be confirmed.
      </div>

      {/* Active hotspot alert */}
      {hotspots.length > 0 && (
        <div style={{ margin: '0 28px 14px', padding: '12px 16px', borderRadius: 10,
          background: alertC.bg, border: `1.5px solid ${alertC.border}`, color: alertC.text }}>
          <strong>⚠ {hotspots.length} symptom hotspot{hotspots.length > 1 ? 's' : ''} detected</strong>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            {hotspots.slice(0, 3).map((h, i) => (
              <span key={i} style={{ marginRight: 16 }}>
                📍 {h.barangay}{h.sitio ? '/' + h.sitio : ''} — {h.signal_name || h.possible_condition} ({h.report_count || h.count} reports)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 28px', background: 'white', borderBottom: '1px solid var(--gray-200)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontWeight: tab === t ? 700 : 400, fontSize: 13,
              color: tab === t ? 'var(--green)' : 'var(--gray-600)',
              borderBottom: tab === t ? '2px solid var(--green)' : '2px solid transparent' }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="page-body">

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && error && (
          <div style={{ margin: '0 0 16px', padding: '12px 16px', background: '#FCEBEB', border: '1px solid #F7C1C1', borderRadius: 8, color: '#791F1F', fontSize: 13 }}>
            Could not load surveillance data: {error}
          </div>
        )}
        {tab === 'overview' && summary && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="label">Symptom reports</div>
                <div className="value">{summary.total_reports || 0}</div>
                <div className="sub">Last {days} days</div>
              </div>
              <div className="stat-card" style={{ background: alertC.bg, borderColor: alertC.border }}>
                <div className="label">Hotspots</div>
                <div className="value" style={{ color: alertC.text }}>{hotspots.length}</div>
                <div className="sub">{alertLevel.toUpperCase()}</div>
              </div>
              <div className="stat-card">
                <div className="label">Barangays affected</div>
                <div className="value">{(summary.by_barangay || []).length}</div>
                <div className="sub">With reports</div>
              </div>
              <div className="stat-card">
                <div className="label">Patient reports</div>
                <div className="value">
                  {(summary.by_reporter_role || []).find(r => r.reporter_role === 'patient')?.count || 0}
                </div>
                <div className="sub">Self-reported</div>
              </div>
              <div className="stat-card">
                <div className="label">CHW reports</div>
                <div className="value">
                  {(summary.by_reporter_role || []).find(r => r.reporter_role === 'chw')?.count || 0}
                </div>
                <div className="sub">Home visits</div>
              </div>
            </div>

            <div className="two-col">
              <div className="card">
                <div className="card-title">Top reported symptoms</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={(summary.top_symptoms || []).slice(0,8).map(s => ({
                    name: s.symptom.replace(/_/g,' '), count: parseInt(s.count)
                  }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#7F77DD" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="card-title">Reports by barangay</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={(summary.by_barangay || []).slice(0,6)} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="barangay" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#D4537E" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Hotspot cards */}
            {hotspots.length > 0 && (
              <div className="card">
                <div className="card-title">Symptom hotspots — AI signal</div>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                  These locations have symptom clusters consistent with the listed conditions. Clinical assessment required before any diagnosis.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {hotspots.map((h, i) => {
                    const c = ALERT_COLORS[h.alert_level] || ALERT_COLORS.watch;
                    return (
                      <div key={i} style={{ flex: '1 1 220px', padding: '12px 14px', borderRadius: 10,
                        background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                          {h.barangay}{h.sitio ? ' / ' + h.sitio : ''}
                        </div>
                        <div style={{ fontSize: 12, marginBottom: 4 }}>
                          {h.report_count || h.count} reports · {h.window_days}d window
                        </div>
                        <div style={{ fontSize: 12, fontStyle: 'italic' }}>
                          Possibly consistent with: {h.possible_condition}
                        </div>
                        <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600 }}>
                          {(h.alert_level || '').toUpperCase()} · Unconfirmed
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent reports */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '14px 20px', fontWeight: 600, fontSize: 14, borderBottom: '1px solid var(--gray-200)' }}>
                Recent symptom reports (last 7 days)
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Patient</th><th>Location</th><th>Symptoms</th><th>Onset</th><th>Severity</th><th>Reported by</th>
                  </tr></thead>
                  <tbody>
                    {(summary.recent_reports || []).map((r, i) => (
                      <tr key={i}>
                        <td>{r.patient_name || '—'}</td>
                        <td style={{ fontSize: 12 }}>{r.barangay}{r.sitio ? '/' + r.sitio : ''}</td>
                        <td style={{ fontSize: 12, maxWidth: 200 }}>
                          {(r.symptoms || []).map(s => s.replace(/_/g,' ')).join(', ')}
                        </td>
                        <td className="text-muted" style={{ fontSize: 12 }}>
                          {r.onset_date ? new Date(r.onset_date).toLocaleDateString('en-PH') : '—'}
                        </td>
                        <td><span className={`badge ${r.severity === 'severe' ? 'badge-red' : r.severity === 'moderate' ? 'badge-amber' : 'badge-gray'}`}>{r.severity}</span></td>
                        <td><span className="badge badge-gray">{r.reporter_role}</span></td>
                      </tr>
                    ))}
                    {!(summary.recent_reports || []).length && (
                      <tr><td colSpan={6} className="empty-state">No reports in last 7 days</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── REPORT SYMPTOMS ── */}
        {tab === 'report-symptoms' && <SymptomReportForm />}

        {/* ── AI REPORTS ── */}
        {tab === 'reports' && (
          <div>
            {activeReport ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>AI Symptom Surveillance Report</div>
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {new Date(activeReport.generated_at).toLocaleString('en-PH')} · {activeReport.model_used} ·
                      <span style={{ marginLeft: 6, color: ALERT_COLORS[activeReport.alert_level]?.text }}>
                        {activeReport.alert_level?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={printReport} className="btn btn-secondary btn-sm">🖨 Print / PDF</button>
                    <button onClick={() => setActiveReport(null)} className="btn btn-secondary btn-sm">← All reports</button>
                  </div>
                </div>

                <div style={{ padding: '10px 16px', marginBottom: 14, borderRadius: 8,
                  background: '#FEF9E7', border: '1px solid #FAC775', fontSize: 12, color: '#633806' }}>
                  <strong>Disclaimer:</strong> This is an AI interpretation of symptom data only. No diagnoses are confirmed. Clinical assessment and laboratory tests are required.
                </div>

                <div className="card" style={{ lineHeight: 1.8, fontSize: 14 }}>
                  {(activeReport.ai_summary || '').split('\n').map((line, i) => {
                    if (line.startsWith('## '))
                      return <h3 key={i} style={{ fontWeight: 600, fontSize: 15, marginTop: 20, marginBottom: 8 }}>{line.replace('## ','')}</h3>;
                    if (!line.trim()) return <br key={i} />;
                    return <p key={i} style={{ margin: '4px 0', color: 'var(--color-text-secondary)' }}>{line}</p>;
                  })}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontWeight: 600 }}>AI surveillance reports ({aiReports.length})</div>
                  <button onClick={generateReport} disabled={generating} className="btn btn-primary btn-sm">
                    {generating ? '⏳ Generating…' : '🤖 New AI Report'}
                  </button>
                </div>
                {aiReports.length === 0 ? (
                  <div className="empty-state">
                    <div className="icon">📋</div>
                    <p>No reports yet. Click "Generate AI Report" to analyse current symptom patterns.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {aiReports.map(r => {
                      const c = ALERT_COLORS[r.alert_level] || ALERT_COLORS.normal;
                      return (
                        <div key={r.id} onClick={() => setActiveReport(r)}
                          className="card" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              Symptom Surveillance Report — {new Date(r.generated_at).toLocaleDateString('en-PH')}
                            </div>
                            <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                              {r.total_reports} reports · {r.barangays_affected} barangays · {r.model_used}
                            </div>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                            background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                            {r.alert_level?.toUpperCase()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── HEALTH METRICS ── */}
        {tab === 'health' && (
          <HealthMetricsTab healthData={summary?.health_metrics || []} />
        )}
      </div>
    </div>
  );
}

// ── Symptom report form ───────────────────────────────────────
function SymptomReportForm() {
  const [symptomGroups, setSymptomGroups] = useState({});
  const [selected, setSelected]           = useState([]);
  const [form, setForm]                   = useState({ severity: 'mild', source: 'home_visit' });
  const [patients, setPatients]           = useState([]);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);

  useEffect(() => {
    api.get('/surveillance/symptoms').then(setSymptomGroups).catch(() => {
      // Fallback symptom list if API call fails
      setSymptomGroups({
        'Fever & temperature': ['fever','chills','night_sweats'],
        'Head & face': ['headache','jaw_swelling','runny_nose','red_eyes'],
        'Skin': ['rash','bleeding_gums','slow_healing_wounds'],
        'Respiratory': ['cough_2weeks','shortness_of_breath_exertion','blood_in_sputum'],
        'Digestive': ['nausea','vomiting','abdominal_pain','diarrhoea'],
        'Musculoskeletal': ['joint_pain','eye_pain','back_pain'],
        'Metabolic / NCD': ['excessive_thirst','frequent_urination','unexplained_fatigue','blurred_vision','weight_loss'],
        'General': ['fatigue','loss_of_appetite','body_weakness'],
      });
    });
    api.get('/patients').then(setPatients).catch(() => {});
  }, []);

  const toggle = (sym) => setSelected(prev =>
    prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
  );

  const submit = async () => {
    if (!form.barangay) return alert('Barangay is required');
    if (!selected.length) return alert('Select at least one symptom');
    if (!form.onsetDate) return alert('Onset date is required');
    setSaving(true);
    try {
      await api.post('/surveillance/report-symptoms', {
        ...form,
        symptoms: selected,
        patientId: form.patientId || null,  // null = unregistered, backend handles this
      });
      setSaved(true);
      setSelected([]);
      setForm({ severity: 'mild', source: 'home_visit' });
    } catch { alert('Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  if (saved) return (
    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Symptom report submitted</div>
      <p className="text-muted" style={{ marginBottom: 20 }}>Thank you. The health team will review this report.</p>
      <button onClick={() => setSaved(false)} className="btn btn-primary">Submit another report</button>
    </div>
  );

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, background: '#F0FBF5', borderColor: '#9FE1CB' }}>
        <p style={{ fontSize: 13, color: '#085041', margin: 0 }}>
          <strong>Instructions for CHW:</strong> Record what the patient is experiencing. You do NOT need to know what disease it is — just describe the symptoms and where the patient lives. The health team will follow up.
        </p>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 16 }}>Patient & location</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div><label className="form-label">Patient (optional)</label>
            <select className="input" value={form.patientId || ''}
              onChange={e => setForm(f => ({ ...f, patientId: e.target.value || null }))}>
              <option value="">Unregistered / unknown</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select></div>
          <div><label className="form-label">Barangay <span style={{ color: 'red' }}>*</span></label>
            <input className="input" placeholder="e.g. Sibaltan"
              value={form.barangay || ''} onChange={e => setForm(f => ({ ...f, barangay: e.target.value }))} /></div>
          <div><label className="form-label">Sitio / area</label>
            <input className="input" placeholder="e.g. Sitio Buena Vista"
              value={form.sitio || ''} onChange={e => setForm(f => ({ ...f, sitio: e.target.value }))} /></div>
          <div><label className="form-label">When did symptoms start? <span style={{ color: 'red' }}>*</span></label>
            <input type="date" className="input" max={new Date().toISOString().split('T')[0]}
              onChange={e => setForm(f => ({ ...f, onsetDate: e.target.value }))} /></div>
          <div><label className="form-label">Severity</label>
            <select className="input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
              <option value="mild">Mild — patient is at home, managing</option>
              <option value="moderate">Moderate — limiting daily activity</option>
              <option value="severe">Severe — needs urgent attention</option>
            </select></div>
          <div><label className="form-label">Temperature (°C)</label>
            <input type="number" step="0.1" min="35" max="42" className="input" placeholder="e.g. 38.5"
              onChange={e => setForm(f => ({ ...f, temperatureC: parseFloat(e.target.value) }))} /></div>
          <div style={{ gridColumn: '1/-1', display: 'flex', gap: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" onChange={e => setForm(f => ({ ...f, isChild: e.target.checked }))} />
              Patient is under 18
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" onChange={e => setForm(f => ({ ...f, hasTravelHistory: e.target.checked }))} />
              Recent travel outside barangay
            </label>
          </div>
        </div>

        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          What symptoms does the patient have? <span style={{ color: 'red' }}>*</span>
          {selected.length > 0 && (
            <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 8, color: 'var(--green)' }}>
              {selected.length} selected
            </span>
          )}
        </div>

        {Object.keys(symptomGroups).length === 0 && (
          <div style={{ padding: 12, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            Loading symptom list…
          </div>
        )}

        {Object.entries(symptomGroups).map(([group, syms]) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{group}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {syms.map(sym => {
                const isSelected = selected.includes(sym);
                return (
                  <button key={sym} onClick={() => toggle(sym)}
                    style={{ padding: '6px 12px', borderRadius: 20, border: `1.5px solid ${isSelected ? 'var(--green)' : 'var(--gray-200)'}`,
                      background: isSelected ? '#E1F5EE' : 'white', color: isSelected ? '#085041' : 'var(--gray-700)',
                      cursor: 'pointer', fontSize: 13, fontWeight: isSelected ? 600 : 400 }}>
                    {sym.replace(/_/g,' ')}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          <label className="form-label">Additional notes</label>
          <textarea className="input" rows={2} placeholder="Any other details the doctor should know…"
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={submit} disabled={saving} className="btn btn-primary">
            {saving ? 'Saving…' : 'Submit symptom report'}
          </button>
          <button onClick={() => { setSelected([]); setForm({ severity: 'mild', source: 'home_visit' }); }}
            className="btn btn-secondary">Clear</button>
        </div>
      </div>
    </div>
  );
}

// ── Health metrics tab ────────────────────────────────────────
function HealthMetricsTab({ healthData }) {
  return (
    <div>
      <div className="two-col">
        <div className="card">
          <div className="card-title">BMI distribution</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={healthData} cx="50%" cy="50%" outerRadius={65}
                dataKey="count" nameKey="bmi_category"
                label={({ bmi_category, count }) => `${bmi_category}: ${count}`}>
                {healthData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % 4]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title">BMI categories</div>
          {healthData.length === 0 ? (
            <div className="empty-state">No health metrics recorded yet</div>
          ) : (
            <div style={{ paddingTop: 8 }}>
              {healthData.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                  borderBottom: '1px solid var(--gray-100)' }}>
                  <span style={{ fontSize: 14 }}>{h.bmi_category}</span>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className="text-muted" style={{ fontSize: 13 }}>avg BMI {h.avg_bmi}</span>
                    <span style={{ fontWeight: 600 }}>{h.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

