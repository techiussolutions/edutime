import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './store/AppStore';

import LoginPage             from './pages/LoginPage';
import AppShell              from './pages/AppShell';
import Dashboard             from './pages/Dashboard';
import TimetablePage         from './pages/TimetablePage';
import DailyTimetablePage    from './pages/DailyTimetablePage';
import WizardPage            from './pages/WizardPage';
import SubstitutionPage      from './pages/SubstitutionPage';
import SettingsPage          from './pages/SettingsPage';
import TeachersPage          from './pages/master/TeachersPage';
import ClassesPage           from './pages/master/ClassesPage';
import SubjectsPage          from './pages/master/SubjectsPage';
import TeacherAvailabilityPage from './pages/master/TeacherAvailabilityPage';
import UserManagementPage    from './pages/admin/UserManagementPage';

/* ── Auth guard: must be logged in ────────────────────────── */
function AuthGuard({ children }) {
  const { isLoggedIn, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return children;
}

/* ── Permission guard: requires specific permission ───────── */
function PermGuard({ perm, children }) {
  const { can } = useAuth();
  if (!can(perm)) return <Navigate to="/dashboard" replace />;
  return children;
}

/* ── Full-screen loading spinner ──────────────────────────── */
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#4338ca 100%)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, border: '3px solid rgba(255,255,255,.2)',
          borderTopColor: '#818cf8', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem',
        }} />
        <p style={{ color: '#a5b4fc', fontSize: '.9rem' }}>Loading EduTime…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

/* ── Routes ───────────────────────────────────────────────── */
function AppRoutes() {
  const { isLoggedIn, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <LoginPage />} />

        <Route path="/" element={<AuthGuard><AppShell /></AuthGuard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"        element={<Dashboard />} />
          <Route path="timetable"        element={<TimetablePage />} />
          <Route path="daily-timetable"  element={<DailyTimetablePage />} />
          <Route path="timetable/wizard" element={<PermGuard perm="editTimetable"><WizardPage /></PermGuard>} />
          <Route path="substitutions"    element={<SubstitutionPage />} />

          {/* Master data — requires manageMasterData */}
          <Route path="master">
            <Route path="teachers"     element={<PermGuard perm="manageMasterData"><TeachersPage /></PermGuard>} />
            <Route path="classes"      element={<PermGuard perm="manageMasterData"><ClassesPage /></PermGuard>} />
            <Route path="subjects"     element={<PermGuard perm="manageMasterData"><SubjectsPage /></PermGuard>} />
            <Route path="availability" element={<PermGuard perm="manageMasterData"><TeacherAvailabilityPage /></PermGuard>} />
          </Route>

          {/* Admin only */}
          <Route path="settings" element={<PermGuard perm="manageSettings"><SettingsPage /></PermGuard>} />
          <Route path="admin/users" element={<PermGuard perm="manageUsers"><UserManagementPage /></PermGuard>} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </AuthProvider>
  );
}
