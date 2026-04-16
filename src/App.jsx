import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './store/AppStore';

// Only LoginPage and AppShell are eagerly loaded (needed at first render)
import LoginPage from './pages/LoginPage';
import AppShell  from './pages/AppShell';

// Lazy-load all other pages — they're fetched on navigation, not upfront
const Dashboard             = lazy(() => import('./pages/Dashboard'));
const TimetablePage         = lazy(() => import('./pages/TimetablePage'));
const DailyTimetablePage    = lazy(() => import('./pages/DailyTimetablePage'));
const WizardPage            = lazy(() => import('./pages/WizardPage'));
const SubstitutionPage      = lazy(() => import('./pages/SubstitutionPage'));
const SettingsPage          = lazy(() => import('./pages/SettingsPage'));
const TeachersPage          = lazy(() => import('./pages/master/TeachersPage'));
const ClassesPage           = lazy(() => import('./pages/master/ClassesPage'));
const SubjectsPage          = lazy(() => import('./pages/master/SubjectsPage'));
const TeacherAvailabilityPage = lazy(() => import('./pages/master/TeacherAvailabilityPage'));
const UserManagementPage    = lazy(() => import('./pages/admin/UserManagementPage'));
const SchoolsManagementPage = lazy(() => import('./pages/platform/SchoolsManagementPage'));
const PlatformDashboard     = lazy(() => import('./pages/platform/PlatformDashboard'));
const PlatformUsersPage     = lazy(() => import('./pages/platform/PlatformUsersPage'));

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

/* ── Super Admin guard: strictly super admin ──────────────── */
function SuperAdminGuard({ children }) {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
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

/* ── Lightweight page loading fallback (for lazy routes) ───── */
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e0e7ff', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </div>
  );
}

/* ── Routes ───────────────────────────────────────────────── */
function AppRoutes() {
  const { isLoggedIn, loading, isSuperAdmin } = useAuth();
  const home = isSuperAdmin ? '/platform' : '/dashboard';

  if (loading) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={isLoggedIn ? <Navigate to={home} replace /> : <LoginPage />} />

        <Route path="/" element={<AuthGuard><AppShell /></AuthGuard>}>
          <Route index element={<Navigate to={home} replace />} />
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
          
          {/* Platform Admin only */}
          <Route path="platform" element={<SuperAdminGuard><PlatformDashboard /></SuperAdminGuard>} />
          <Route path="platform/schools" element={<SuperAdminGuard><SchoolsManagementPage /></SuperAdminGuard>} />
          <Route path="platform/users"   element={<SuperAdminGuard><PlatformUsersPage /></SuperAdminGuard>} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
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
