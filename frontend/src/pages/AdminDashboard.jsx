import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';

const COLORS = ['#1a7a4a', '#1565c0', '#e65100', '#c62828', '#7b1fa2'];

const ACTION_ICONS = {
  // Auth
  login: '🔑', register: '✅', logout: '🚪',
  // Patient
  view_patient: '👁️', list_patients: '📋', view_own_record: '👤',
  // Vitals
  record_vitals: '📊', view_vitals: '📊',
  // Consultations
  view_consultation: '🩺', list_consultations: '🩺',
  create_consultation: '➕', update_consultation: '✏️',
  create_prescription: '💊',
  // Admin
  view_admin_stats: '📈', view_security_report: '🛡️',
  // AI Triage
  triage_chat:                '🤖',
  triage_summary_generated:   '📋',
  triage_emergency_detected:  '🚨',
  triage_assessment:          '🔍',
};

const ACTION_LABELS = {
  triage_chat:               'AI triage — chat turn',
  triage_summary_generated:  'AI triage — summary generated',
  triage_emergency_detected: 'AI triage — EMERGENCY detected',
  triage_assessment:         'AI triage — assessment',
};

const TABS = ['overview', 'patients', 'audit', 'ai-triage', 'settings'];

export default function AdminDashboard() {
  const [stats, setStats]       = useState(null);
  const [tab, setTab]           = useState('overview');
  const [patients, setPatients] = useState([]);
  const [audit, setAudit]       = useState([]);
  const [triageLogs, setTriageLogs] = useState([]);
  const [auditFilter, setAuditFilter] = useState('all');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.get('/admin/stats').then(s => { setStats(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'patients' && !patients.length)
      api.get('/admin/patients').then(setPatients).catch(() => {});
    if (tab === 'audit' && !audit.length)
      api.get('/admin/audit?limit=200').then(setAudit).catch(() => {});
    if (tab === 'ai-triage' && !triageLogs.length)
      api.get('/admin/audit?action=triage_chat&limit=200')
        .then(data => {
          // Fetch all triage-related events
          return api.get('/admin/audit?limit=500').then(all =>
            all.filter(e => e.action && e.action.startsWith('triage_'))
          );
        })
        .then(setTriageLogs)
        .catch(() => {});
  }, [tab]);

  if (loading) return <div className="loading">Loading admin dashboard…</div>;

  const consultStatusData = Object.entries(stats?.consultationsByStatus || {}).map(([k, v]) => ({ name: k, value: v }));
  const conditionsData    = stats?.topConditions || [];
  const roleData          = Object.entries(stats?.usersByRole || {}).map(([k, v]) => ({ name: k, value: v }));
  const triageStats       = stats?.triageStats || {};
  const authStats         = stats?.authStats?.last24h || {};

  // Filtered audit events
  const filteredAudit = auditFilter === 'all'
    ? audit
    : auditFilter === 'ai'
    ? audit.filter(e => e.action?.startsWith('triage_'))
    : audit.filter(e => e.action === auditFilter);

  const tabLabel = t => ({ overview: 'Overview', patients: 'Patients', audit: 'Audit Log', 'ai-triage': '🤖 AI Triage' }[t] || t);

  return (
    <div>
      <div className="page-header">
        <h2>Admin Dashboard</h2>
        <span className="badge badge-green">● Live</span>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, padding:'0 28px', background:'white', borderBottom:'1px solid var(--gray-200)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'12px 20px', background:'none', border:'none', cursor:'pointer',
              fontWeight: tab===t ? 700 : 400,
              color: tab===t ? 'var(--green)' : 'var(--gray-600)',
              borderBottom: tab===t ? '2px solid var(--green)' : '2px solid transparent',
              fontSize: 14 }}>
            {tabLabel(t)}
            {t === 'ai-triage' && (triageStats.triage_emergency_detected > 0) && (
              <span style={{ marginLeft:6, background:'var(--red)', color:'white', borderRadius:999, padding:'1px 6px', fontSize:10 }}>
                {triageStats.triage_emergency_detected} 🚨
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="page-body">

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="label">Total Patients</div>
                <div className="value">{stats?.totalPatients || 0}</div>
                <div className="sub">Registered</div>
              </div>
              <div className="stat-card">
                <div className="label">Consultations</div>
                <div className="value">{Object.values(stats?.consultationsByStatus||{}).reduce((a,b)=>a+b,0)}</div>
                <div className="sub">{stats?.consultationsByStatus?.completed||0} completed</div>
              </div>
              <div className="stat-card">
                <div className="label">Vitals (7 days)</div>
                <div className="value">{stats?.vitalsLast7Days||0}</div>
                <div className="sub">CHW recordings</div>
              </div>
              <div className="stat-card">
                <div className="label">AI Triage sessions</div>
                <div className="value">{triageStats.triage_chat || 0}</div>
                <div className="sub">{triageStats.triage_summary_generated || 0} completed · {triageStats.triage_emergency_detected || 0} 🚨</div>
              </div>
              <div className="stat-card">
                <div className="label">Logins (24h)</div>
                <div className="value" style={{ color: authStats.failure > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {(authStats.success || 0) + (authStats.failure || 0)}
                </div>
                <div className="sub">{authStats.failure || 0} failed</div>
              </div>
            </div>

            <div className="two-col">
              <div className="card">
                <div className="card-title">Top Conditions</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={conditionsData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize:11 }} />
                    <YAxis type="category" dataKey="condition" tick={{ fontSize:12 }} width={50} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#1a7a4a" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="card-title">Users by Role</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={roleData} cx="50%" cy="50%" outerRadius={65} dataKey="value" nameKey="name"
                      label={({name,value}) => `${name}: ${value}`} labelLine={false}>
                      {roleData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Recent Activity</div>
              {(stats?.recentAuditEvents||[]).slice(0,12).map(e => (
                <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--gray-100)' }}>
                  <span style={{ fontSize:18, width:28, textAlign:'center' }}>{ACTION_ICONS[e.action]||'📌'}</span>
                  <div style={{ flex:1 }}>
                    <span style={{ fontWeight:600, fontSize:13 }}>{ACTION_LABELS[e.action] || e.action.replace(/_/g,' ')}</span>
                    {e.email && <span className="text-muted" style={{ marginLeft:8 }}>{e.email}</span>}
                    {e.action?.startsWith('triage_') && (
                      <span style={{ marginLeft:8, fontSize:11, background:'#e3f0ff', color:'#1565c0', borderRadius:4, padding:'1px 6px' }}>AI</span>
                    )}
                  </div>
                  <span className={`badge ${e.outcome==='success'?'badge-green':'badge-red'}`}>{e.outcome}</span>
                  <span className="text-muted" style={{ fontSize:11, width:140, textAlign:'right' }}>{new Date(e.occurred_at).toLocaleString('en-PH')}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── PATIENTS ── */}
        {tab === 'patients' && (
          <div className="card" style={{ padding:0 }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--gray-200)', fontWeight:600 }}>
              All Patients ({patients.length})
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Barangay</th><th>Conditions</th><th>PhilHealth</th><th>Vitals</th><th>Last Vitals</th><th>Consults</th><th>Account</th></tr></thead>
                <tbody>
                  {patients.map(p => (
                    <tr key={p.id}>
                      <td><strong>{p.full_name}</strong><br /><span className="text-muted">{new Date(p.date_of_birth).toLocaleDateString('en-PH')}</span></td>
                      <td>{p.barangay||'—'}</td>
                      <td>{(p.conditions||[]).map(c=><span key={c} className="badge badge-amber" style={{marginRight:4}}>{c}</span>)}</td>
                      <td className="text-muted">{p.philhealth_no||'—'}</td>
                      <td>{p.vitals_count||0}</td>
                      <td className="text-muted">{p.last_vitals?new Date(p.last_vitals).toLocaleDateString('en-PH'):'—'}</td>
                      <td>{p.consult_count||0}</td>
                      <td><span className={`badge ${p.email?'badge-green':'badge-gray'}`}>{p.email?'App':'CHW only'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── AUDIT LOG ── */}
        {tab === 'audit' && (
          <div>
            {/* Filter bar */}
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              {[
                { key:'all', label:'All events' },
                { key:'login', label:'🔑 Logins' },
                { key:'record_vitals', label:'📊 Vitals' },
                { key:'ai', label:'🤖 AI Triage' },
                { key:'create_consultation', label:'🩺 Consultations' },
                { key:'register', label:'✅ Registrations' },
              ].map(f => (
                <button key={f.key} onClick={() => setAuditFilter(f.key)}
                  className={`btn btn-sm ${auditFilter===f.key?'btn-primary':'btn-secondary'}`}>
                  {f.label}
                </button>
              ))}
              <span className="text-muted" style={{ fontSize:12, alignSelf:'center', marginLeft:'auto' }}>
                {filteredAudit.length} events
              </span>
            </div>

            <div className="card" style={{ padding:0 }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--gray-200)', fontWeight:600, fontSize:14, display:'flex', justifyContent:'space-between' }}>
                <span>Audit Log <span className="text-muted" style={{ fontWeight:400, fontSize:12 }}>Append-only · RA 10173 compliant</span></span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Time (PST)</th><th>User</th><th>Role</th><th>Action</th><th>Resource</th><th>Outcome</th></tr></thead>
                  <tbody>
                    {filteredAudit.map(e => (
                      <tr key={e.id} style={{ background: e.action?.startsWith('triage_') ? '#f0f7ff' : 'inherit' }}>
                        <td className="text-muted" style={{ fontSize:12 }}>{new Date(e.occurred_at).toLocaleString('en-PH')}</td>
                        <td style={{ fontSize:13 }}>{e.email||<span className="text-muted">—</span>}</td>
                        <td><span className="badge badge-gray">{e.actor_role||'—'}</span></td>
                        <td style={{ fontSize:13 }}>
                          {ACTION_ICONS[e.action]||'📌'} {ACTION_LABELS[e.action]||e.action.replace(/_/g,' ')}
                          {e.action?.startsWith('triage_') && (
                            <span style={{ marginLeft:6, fontSize:10, background:'#e3f0ff', color:'#1565c0', borderRadius:4, padding:'1px 5px' }}>AI</span>
                          )}
                        </td>
                        <td className="text-muted" style={{ fontSize:12 }}>{e.resource_type||'—'}</td>
                        <td><span className={`badge ${e.outcome==='success'?'badge-green':'badge-red'}`}>{e.outcome}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── AI TRIAGE TAB ── */}
        {tab === 'ai-triage' && (
          <div>
            {/* Summary cards */}
            <div className="stats-grid" style={{ marginBottom:20 }}>
              <div className="stat-card">
                <div className="label">Total chat turns</div>
                <div className="value" style={{ color:'#1565c0' }}>{triageLogs.filter(e=>e.action==='triage_chat').length}</div>
                <div className="sub">Patient messages to AI</div>
              </div>
              <div className="stat-card">
                <div className="label">Summaries generated</div>
                <div className="value" style={{ color:'var(--green)' }}>{triageLogs.filter(e=>e.action==='triage_summary_generated').length}</div>
                <div className="sub">Completed interviews</div>
              </div>
              <div className="stat-card">
                <div className="label">🚨 Emergencies detected</div>
                <div className="value" style={{ color:'var(--red)' }}>{triageLogs.filter(e=>e.action==='triage_emergency_detected').length}</div>
                <div className="sub">Bypassed AI — immediate alert</div>
              </div>
              <div className="stat-card">
                <div className="label">Unique users</div>
                <div className="value">{new Set(triageLogs.map(e=>e.email).filter(Boolean)).size}</div>
                <div className="sub">Patients using AI triage</div>
              </div>
            </div>

            {/* Emergency alerts — shown prominently if any */}
            {triageLogs.filter(e=>e.action==='triage_emergency_detected').length > 0 && (
              <div style={{ background:'#ffebee', border:'2px solid #ef9a9a', borderRadius:10, padding:'14px 18px', marginBottom:20 }}>
                <p style={{ fontWeight:700, color:'var(--red)', marginBottom:10 }}>🚨 Emergency Detections</p>
                {triageLogs.filter(e=>e.action==='triage_emergency_detected').map(e => (
                  <div key={e.id} style={{ display:'flex', gap:12, padding:'6px 0', borderBottom:'1px solid #ffcdd2', fontSize:13 }}>
                    <span style={{ color:'var(--gray-600)' }}>{new Date(e.occurred_at).toLocaleString('en-PH')}</span>
                    <span style={{ fontWeight:600 }}>{e.email||'Unknown'}</span>
                    <span className="badge badge-gray">{e.actor_role}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Full AI triage event log */}
            <div className="card" style={{ padding:0 }}>
              <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--gray-200)', fontWeight:600, fontSize:14 }}>
                AI Triage Event Log
                <span className="text-muted" style={{ fontWeight:400, fontSize:12, marginLeft:10 }}>
                  {triageLogs.length} events
                </span>
              </div>
              {triageLogs.length === 0 ? (
                <div className="empty-state"><div className="icon">🤖</div><p>No AI triage sessions yet. Patients can access pre-screening from the AI Pre-Screening tab.</p></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Time (PST)</th><th>User</th><th>Role</th><th>Event</th><th>Outcome</th></tr></thead>
                    <tbody>
                      {triageLogs.map(e => (
                        <tr key={e.id} style={{
                          background: e.action==='triage_emergency_detected' ? '#fff3f3'
                                    : e.action==='triage_summary_generated'  ? '#f0fff4'
                                    : 'inherit'
                        }}>
                          <td className="text-muted" style={{ fontSize:12 }}>{new Date(e.occurred_at).toLocaleString('en-PH')}</td>
                          <td style={{ fontSize:13 }}>{e.email||<span className="text-muted">—</span>}</td>
                          <td><span className="badge badge-gray">{e.actor_role||'—'}</span></td>
                          <td style={{ fontSize:13 }}>
                            <span style={{ marginRight:8 }}>{ACTION_ICONS[e.action]||'🤖'}</span>
                            {ACTION_LABELS[e.action]||e.action.replace(/_/g,' ')}
                          </td>
                          <td><span className={`badge ${e.outcome==='success'?'badge-green':'badge-red'}`}>{e.outcome}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LLM SETTINGS ── */}
        {tab === 'settings' && <LLMSettingsPanel />}
      </div>
    </div>
  );
}

// ── LLM Settings Panel ───────────────────────────────────────
function LLMSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [status, setStatus]     = useState(null);
  const [form, setForm]         = useState({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    api.get('/settings').then(data => {
      setSettings(data);
      setForm({
        llm_provider:  data.current_provider,
        claude_model:  data.settings?.claude_model?.value || 'claude-sonnet-4-6',
        llm_model:     data.settings?.llm_model?.value || 'gemma4:e2b',
        claude_api_key: '',
      });
    }).catch(() => {});
    api.get('/settings/llm-status').then(setStatus).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const payload = { llm_provider: form.llm_provider, claude_model: form.claude_model, llm_model: form.llm_model };
      if (form.claude_api_key) payload.claude_api_key = form.claude_api_key;
      await api.patch('/settings', payload);
      setSaved(true);
      setTimeout(() => api.get('/settings/llm-status').then(setStatus).catch(() => {}), 1000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const testConnection = () => { setStatus(null); api.get('/settings/llm-status').then(setStatus).catch(() => {}); };

  if (!settings) return <div className="loading">Loading settings…</div>;

  const isOllama = form.llm_provider === 'ollama';
  const statusColor = status?.status === 'connected' ? 'var(--green)' : status?.status === 'error' ? 'var(--red)' : 'var(--amber)';

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>AI Provider Settings</div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
          Controls which AI model powers triage and surveillance reports. Changes take effect immediately.
        </p>

        <div style={{ marginBottom: 20 }}>
          <label className="form-label">AI Provider</label>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {[
              { value: 'ollama', label: '\uD83D\uDDA5\uFE0F Ollama (Local)', sub: 'Runs on your server — private, no API cost' },
              { value: 'claude', label: '\u2601\uFE0F Claude (Anthropic)', sub: 'Faster, more capable — requires API key' },
            ].map(p => (
              <div key={p.value} onClick={() => setForm(f => ({ ...f, llm_provider: p.value }))}
                style={{ flex: 1, padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${form.llm_provider === p.value ? 'var(--green)' : 'var(--gray-200)'}`,
                  background: form.llm_provider === p.value ? '#E1F5EE' : 'white' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{p.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {isOllama && (
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Ollama Model</label>
            <select className="input" value={form.llm_model} onChange={e => setForm(f => ({ ...f, llm_model: e.target.value }))}>
              {(settings.ollama_models || []).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Model must already be pulled on Ollama.</p>
          </div>
        )}

        {!isOllama && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Claude Model</label>
              <select className="input" value={form.claude_model} onChange={e => setForm(f => ({ ...f, claude_model: e.target.value }))}>
                {(settings.claude_models || []).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">
                Anthropic API Key
                {settings.env_api_key_set && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--green)', fontWeight: 400 }}>✓ ANTHROPIC_API_KEY env var is set</span>}
              </label>
              <input type="password" className="input"
                placeholder={settings.settings?.claude_api_key?.is_set ? 'Key already set — paste to update' : settings.env_api_key_set ? 'Using env var — paste to override' : 'sk-ant-api03-…'}
                value={form.claude_api_key} onChange={e => setForm(f => ({ ...f, claude_api_key: e.target.value }))} />
              <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Leave blank to keep existing key. Must start with <code>sk-ant-</code>.</p>
            </div>
          </>
        )}

        {status && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8,
            background: 'var(--color-background-secondary)', border: '1px solid var(--color-border-tertiary)', marginBottom: 16 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
            <div style={{ fontSize: 13 }}>
              <strong>{status.provider === 'claude' ? 'Claude' : 'Ollama'}</strong>{' — '}{status.status}
              {status.active_model && <span className="text-muted"> · {status.active_model}</span>}
              {status.error && <span style={{ color: 'var(--red)', marginLeft: 8 }}>{status.error}</span>}
            </div>
            <button onClick={testConnection} className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', fontSize: 12 }}>Test</button>
          </div>
        )}

        {saved && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#E1F5EE', border: '1px solid #9FE1CB', color: '#085041', fontSize: 13, marginBottom: 12 }}>✅ Settings saved. New provider active immediately.</div>}
        {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#FCEBEB', border: '1px solid #F7C1C1', color: '#791F1F', fontSize: 13, marginBottom: 12 }}>❌ {error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save settings'}</button>
          <button onClick={testConnection} className="btn btn-secondary">Test connection</button>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--color-background-secondary)' }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Provider comparison</div>
        <table style={{ fontSize: 13, width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--color-border-secondary)' }}>
            <th style={{ textAlign: 'left', padding: '6px 0' }}>Feature</th>
            <th style={{ textAlign: 'center', padding: '6px 8px' }}>Ollama (Local)</th>
            <th style={{ textAlign: 'center', padding: '6px 8px' }}>Claude (API)</th>
          </tr></thead>
          <tbody>
            {[
              ['Speed (triage reply)', '~30–60s', '~3–8s'],
              ['Speed (surveillance report)', '~3–5 min', '~15–30s'],
              ['Cost', 'Free (electricity only)', 'Per token (~$0.003/report)'],
              ['Data privacy', '100% on-server', 'Sent to Anthropic API'],
              ['Report quality', 'Good (Gemma 4)', 'Excellent (Claude)'],
              ['Internet required', 'No — works offline', 'Yes'],
              ['Best for', 'Production in GIDA', 'Demo / fast reporting'],
            ].map(([f, o, c]) => (
              <tr key={f} style={{ borderBottom: '1px solid var(--color-border-tertiary)' }}>
                <td style={{ padding: '8px 0', color: 'var(--color-text-secondary)' }}>{f}</td>
                <td style={{ textAlign: 'center', padding: 8 }}>{o}</td>
                <td style={{ textAlign: 'center', padding: 8 }}>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
