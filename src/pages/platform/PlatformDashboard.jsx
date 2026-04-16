import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { NavLink } from 'react-router-dom';
import {
  Users, ShieldAlert, School,
  CheckCircle2, XCircle, AlertTriangle, ArrowRight
} from 'lucide-react';

export default function PlatformDashboard() {
  const { listAllSchools, listAllUsers, profile } = useAuth();
  const [schools, setSchools] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listAllSchools(), listAllUsers()]).then(([s, u]) => {
      setSchools(s.data || []);
      setUsers(u.data || []);
      setLoading(false);
    });
  }, []);

  const activeSchools   = schools.filter(s => s.status === 'active').length;
  const suspendedSchools= schools.filter(s => s.status === 'suspended').length;
  const trialSchools    = schools.filter(s => s.status === 'trial').length;
  const totalUsers      = users.length;
  const activeUsers     = users.filter(u => u.active).length;

  const stats = [
    { label: 'Total Schools',  value: schools.length, icon: School,  color: 'indigo', sub: `${activeSchools} active` },
    { label: 'Total Users',    value: totalUsers,     icon: Users,   color: 'blue',   sub: `${activeUsers} active` },
    { label: 'On Trial',       value: trialSchools,   icon: AlertTriangle, color: 'amber', sub: 'pending upgrade' },
    { label: 'Suspended',      value: suspendedSchools,icon: XCircle, color: 'red',   sub: 'access blocked' },
  ];

  return (
    <div className="anim-fade-up">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.5rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ShieldAlert size={20} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0 }}>Platform Overview</h2>
            <p style={{ margin: 0 }}>Welcome back, {profile?.name} — Application Owner</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid-4" style={{ marginBottom: '2rem' }}>
        {stats.map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="card stat-card">
            <div className={`stat-icon ${color}`}><Icon size={22} /></div>
            <div>
              <div className="stat-value">{loading ? '–' : value}</div>
              <div className="stat-label">{label}</div>
              <div className="stat-delta text-muted" style={{ fontSize: '.75rem' }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Access */}
      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        {/* Tenant list preview */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <School size={16} className="text-primary" /> Schools
            </h3>
            <NavLink to="/platform/schools" className="btn btn-ghost btn-sm" style={{ gap: '.25rem' }}>
              Manage <ArrowRight size={13} />
            </NavLink>
          </div>
          <div>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading…</div>
            ) : schools.slice(0, 5).map(s => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '.875rem 1.5rem', borderBottom: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{s.logo}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{s.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)' }}>{s.code} · {s.board}</div>
                  </div>
                </div>
                <span className={`badge ${s.status === 'active' ? 'badge-green' : s.status === 'suspended' ? 'badge-red' : 'badge-amber'}`}>
                  {s.status}
                </span>
              </div>
            ))}
            {schools.length === 0 && !loading && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tx-muted)' }}>No schools yet.</div>
            )}
          </div>
        </div>

        {/* Recent users preview */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <Users size={16} className="text-primary" /> Recent Users
            </h3>
            <NavLink to="/platform/users" className="btn btn-ghost btn-sm" style={{ gap: '.25rem' }}>
              Manage <ArrowRight size={13} />
            </NavLink>
          </div>
          <div>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading…</div>
            ) : users.slice(0, 5).map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '.875rem 1.5rem', borderBottom: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.8rem', fontWeight: 700, color: 'white', flexShrink: 0
                  }}>{u.name?.[0]?.toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{u.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)' }}>
                      {u.schools?.name || 'No school'} · {u.role}
                    </div>
                  </div>
                </div>
                {u.active
                  ? <CheckCircle2 size={15} color="var(--clr-green)" />
                  : <XCircle size={15} color="var(--clr-red)" />
                }
              </div>
            ))}
            {users.length === 0 && !loading && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tx-muted)' }}>No users yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
