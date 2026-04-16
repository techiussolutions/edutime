import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../store/AppStore';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Calendar, CalendarClock, UserCheck, Users, BookOpen,
  Settings, LogOut, Bell, Search, ChevronRight, GraduationCap, Menu, X, CalendarCheck
} from 'lucide-react';

const NAV = [
  { to: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/timetable',     label: 'Master Timetable', icon: Calendar },
  { to: '/daily-timetable',label: 'Daily Timetable', icon: CalendarClock },
  { to: '/substitutions', label: 'Substitutions',  icon: UserCheck },
];
const MASTER = [
  { to: '/master/teachers',      label: 'Teachers',     icon: Users },
  { to: '/master/classes',       label: 'Classes',      icon: GraduationCap },
  { to: '/master/subjects',      label: 'Subjects',     icon: BookOpen },
  { to: '/master/availability',  label: 'Availability', icon: CalendarCheck },
];

export default function AppShell() {
  const { state, dispatch } = useApp();
  const { profile, school: authSchool, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const school = authSchool || state.school;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const pendingSubs = state.absences.filter(a => {
    const today = new Date().toISOString().split('T')[0];
    return a.date === today;
  }).length;

  const logout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      {/* ── SIDEBAR OVERLAY (Mobile) ────────────── */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* ── SIDEBAR ────────────────────────────── */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-icon">E</div>
          <div style={{ flex: 1 }}>
            <div className="logo-text">EduTime</div>
            <div className="logo-sub">School Platform</div>
          </div>
          <button className="mobile-close-btn" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav" style={{ paddingTop: '1rem' }}>
          <div className="sidebar-section-label">Main</div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              {label}
              {label === 'Substitutions' && pendingSubs > 0 && (
                <span className="nav-badge">{pendingSubs}</span>
              )}
            </NavLink>
          ))}

          <div className="sidebar-section-label" style={{ marginTop: '.75rem' }}>Master Data</div>
          {MASTER.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          <div className="sidebar-section-label" style={{ marginTop: '.75rem' }}>Administration</div>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings size={18} /> Settings
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Users size={18} /> Users
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="school-chip">
            <div className="ava">{school.logo}</div>
            <div className="info">
              <p className="truncate" style={{ maxWidth: 160 }}>{school.name}</p>
              <small>{profile?.name} · {profile?.role}</small>
            </div>
          </div>
          <button className="nav-item" style={{ marginTop: '.5rem', color: '#f87171' }} onClick={logout}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN ──────────────────────────────── */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>{school.name}</span>
              <ChevronRight size={14} />
              <span className="crumb-active">Portal</span>
            </div>
          </div>
          <div className="topbar-right">
            <button className="topbar-icon-btn"><Bell size={17} /></button>
            <div className="user-pill">
              <div className="ava">{profile?.name?.[0] ?? 'A'}</div>
              <span className="name">{profile?.name}</span>
              <span className="badge badge-indigo" style={{ marginLeft: '.5rem', fontSize: '0.7rem' }}>{profile?.role}</span>
            </div>
          </div>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
