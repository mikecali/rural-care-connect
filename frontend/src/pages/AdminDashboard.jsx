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

const TABS = ['overview', 'patients', 'audit', 'ai-triage'];

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
      </div>
    </div>
  );
}
