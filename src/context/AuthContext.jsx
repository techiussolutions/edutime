import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as api from '../lib/api';

const AuthContext = createContext(null);

// ── Default permission sets by role ────────────────────────────
const ROLE_DEFAULTS = {
  super_admin: { viewTimetable: true, editTimetable: true, manageSubstitutions: true, manageMasterData: true, manageSettings: true, manageUsers: true },
  admin:       { viewTimetable: true, editTimetable: true, manageSubstitutions: true, manageMasterData: true, manageSettings: true, manageUsers: true },
  teacher:     { viewTimetable: true, editTimetable: false, manageSubstitutions: true, manageMasterData: false, manageSettings: false, manageUsers: false },
  viewer:      { viewTimetable: true, editTimetable: false, manageSubstitutions: false, manageMasterData: false, manageSettings: false, manageUsers: false },
};

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(null);   // { user: { id, email } } or null
  const [profile, setProfile]   = useState(null);   // user_profiles row
  const [school, setSchool]     = useState(null);    // schools row
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // ── Profile cache helpers (sessionStorage = clears on tab close) ──────────
  const CACHE_KEY = 'edu_profile_cache';
  const saveCache = (prof, sch) => {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ prof, sch, ts: Date.now() })); } catch {}
  };
  const loadCache = () => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { prof, sch, ts } = JSON.parse(raw);
      if (Date.now() - ts > 5 * 60 * 1000) { sessionStorage.removeItem(CACHE_KEY); return null; }
      return { prof, sch };
    } catch { return null; }
  };
  const clearCache = () => { try { sessionStorage.removeItem(CACHE_KEY); } catch {} };

  // ── Fetch profile + school ────────────────────────────────────
  const fetchProfile = useCallback(async (userId) => {
    const cached = loadCache();
    if (cached?.prof?.id === userId) {
      setProfile(cached.prof);
      setSchool(cached.sch);
    }

    try {
      const { profile: prof, school: sch } = await api.fetchProfile(userId);

      if (!prof) throw new Error('No user profile found.');
      if (!prof.active) throw new Error('Your account has been deactivated. Contact your administrator.');

      setProfile(prof);
      setSchool(sch ?? null);
      setError(null);
      saveCache(prof, sch ?? null);
    } catch (err) {
      console.error('[AuthContext] fetchProfile fatal:', err.message);
      setError(err.message);
      setProfile(null);
      setSchool(null);
      clearCache();
      api.authSignOut();
      setSession(null);
    }
  }, []);

  // ── Restore session on mount ─────────────────────────────────
  useEffect(() => {
    const loadingTimeout = setTimeout(() => setLoading(false), 3000);

    const token = api.getToken();
    if (!token) {
      clearTimeout(loadingTimeout);
      setLoading(false);
      return;
    }

    api.authMe().then(({ user }) => {
      setSession({ user: { id: user.id, email: user.email } });
      return fetchProfile(user.id);
    }).catch(() => {
      api.authSignOut();
      setSession(null);
    }).finally(() => {
      clearTimeout(loadingTimeout);
      setLoading(false);
    });

    return () => clearTimeout(loadingTimeout);
  }, [fetchProfile]);

  // ── Sign in ─────────────────────────────────────────────────
  const signIn = async (email, password) => {
    setError(null);
    try {
      const { user } = await api.authSignIn(email, password);
      setSession({ user: { id: user.id, email: user.email } });
      await fetchProfile(user.id);
      return { data: { user } };
    } catch (err) {
      setError(err.message);
      return { error: { message: err.message } };
    }
  };

  // ── Sign out ─────────────────────────────────────────────────
  const signOut = async () => {
    clearCache();
    api.authSignOut();
    setProfile(null);
    setSchool(null);
    setSession(null);
    setError(null);
  };

  // ── Admin: Create user ───────────────────────────────────────
  const createUser = async ({ email, password, name, role, schoolId }) => {
    const targetSchoolId = profile?.role === 'super_admin'
      ? (schoolId || null)
      : profile?.school_id;

    try {
      const perms = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer;
      const { user } = await api.authSignUp({
        email,
        password,
        name,
        role,
        schoolId: targetSchoolId,
        permissions: perms,
        createdBy: profile?.id,
      });

      return { data: { id: user.id, email: user.email, name: user.name, role: user.role } };
    } catch (err) {
      return { error: err };
    }
  };

  // ── Admin: Update user profile ───────────────────────────────
  const updateUser = async (userId, updates) => {
    try {
      await api.updateProfile(userId, updates);
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  };

  // ── Admin: Delete user profile ───────────────────────────────
  const deleteUser = async (userId) => {
    try {
      await api.deleteProfile(userId);
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  };

  // ── Admin: List all users in the school ──────────────────────
  const listUsers = async () => {
    try {
      const { data } = await api.listUsers(profile?.school_id);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  // ── Reset password (not available without email provider) ────
  const resetPassword = async () => {
    return { error: new Error('Password reset is not available. Contact your administrator.') };
  };

  // ── Super Admin Platform Management ──────────────────────────
  const listAllSchools = async () => {
    try {
      const { data } = await api.listSchools();
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  const createTenantSchool = async (schoolData) => {
    try {
      const { data } = await api.createSchool(schoolData);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  const updateSchool = async (schoolId, updates) => {
    try {
      await api.updateSchool(schoolId, updates);
      return { error: null };
    } catch (err) {
      return { error: err };
    }
  };

  const listAllUsers = async (page = 0, pageSize = 50) => {
    try {
      const { data, count } = await api.listAllUsers(page, pageSize);
      return { data, error: null, count };
    } catch (err) {
      return { data: null, error: err, count: 0 };
    }
  };

  // ── Helpers ──────────────────────────────────────────────────
  const isSuperAdmin= profile?.role === 'super_admin';
  const isAdmin     = profile?.role === 'admin' || isSuperAdmin;
  const isTeacher   = profile?.role === 'teacher';
  const isViewer    = profile?.role === 'viewer';
  const isLoggedIn  = !!session && !!profile;
  const can = (perm) => isSuperAdmin || profile?.permissions?.[perm] === true || profile?.role === 'admin';

  const value = {
    session, profile, school, loading, error,
    isSuperAdmin, isAdmin, isTeacher, isViewer, isLoggedIn, can,
    signIn, signOut,
    createUser, updateUser, deleteUser, listUsers, resetPassword,
    listAllSchools, createTenantSchool, updateSchool, listAllUsers,
    ROLE_DEFAULTS,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
