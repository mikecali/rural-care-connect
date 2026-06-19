import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import PatientPortal from '../pages/PatientPortal';
import CHWPage from '../pages/CHWPage';
import ClinicianPage from '../pages/ClinicianPage';
import AdminDashboard from '../pages/AdminDashboard';
import TriagePage from '../pages/TriagePage';

const NAV = {
  patient: [
    { key: 'portal',  icon: '🏠', label: 'My Health Record' },
    { key: 'triage',  icon: '🤖', label: 'AI Pre-Screening', badge: 'NEW' },
    { key: 'consult', icon: '📅', label: 'Consultations' },
  ],
  chw: [
    { key: 'patients', icon: '👥', label: 'Patients' },
  ],
  clinician: [
    { key: 'consultations', icon: '🩺', label: 'Consultations' },
  ],
  admin: [
    { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  ],
};

const ROLE_LABELS = { patient: 'Patient', chw: 'Community Health Worker', clinician: 'Clinician', admin: 'Administrator' };
const ROLE_COLORS = { patient: '#1565c0', chw: '#2ea06a', clinician: '#7b1fa2', admin: '#e65100' };

export default function AppShell() {
  const { auth, logout } = useAuth();
  const navItems = NAV[auth.role] || [];
  const [active, setActive] = useState(navItems[0]?.key);

  function renderPage() {
    const role = auth.role;
    if (role === 'chw') return <CHWPage />;
    if (role === 'clinician') return <ClinicianPage />;
    if (role === 'admin') return <AdminDashboard />;

    // Patient — multi-tab
    if (active === 'triage') return (
      <TriagePage onBookConsult={() => setActive('consult')} />
    );
    if (active === 'consult') return (
      <PatientPortal initialTab="consultations" />
    );
    return <PatientPortal initialTab="overview" />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>🏥 Rural Care Connect</h1>
          <p>El Nido, Palawan · Demo v1.0</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button key={item.key}
              className={`nav-item ${active === item.key ? 'active' : ''}`}
              onClick={() => setActive(item.key)}>
              <span className="icon">{item.icon}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
              {item.badge && (
                <span style={{ fontSize: 10, fontWeight: 700, background: '#ff9800',
                  color: 'white', borderRadius: 4, padding: '1px 5px' }}>{item.badge}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%',
              background: ROLE_COLORS[auth.role] || '#fff', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>
              {auth.email?.[0]?.toUpperCase()}
            </span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{auth.email}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{ROLE_LABELS[auth.role]}</div>
            </div>
          </div>
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}
