import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
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
  const [session, setSession]   = useState(null);
  const [profile, setProfile]   = useState(null);   // user_profiles row
  const [school, setSchool]     = useState(null);    // schools row
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // Flag to suppress auth listener during user creation (prevents redirect on signUp)
  const suppressAuthEvents = React.useRef(false);

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
      // Discard cache older than 5 minutes
      if (Date.now() - ts > 5 * 60 * 1000) { sessionStorage.removeItem(CACHE_KEY); return null; }
      return { prof, sch };
    } catch { return null; }
  };
  const clearCache = () => { try { sessionStorage.removeItem(CACHE_KEY); } catch {} };

  // ── Fetch profile + school — single joined query ──────────────
  const fetchProfile = useCallback(async (userId) => {
    // 1. Paint instantly from cache while real fetch runs in background
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
      await supabase.auth.signOut();
    }
  }, []);


  // ── Listen for auth state changes ────────────────────────────
  useEffect(() => {
    // Safety net: if loading is still true after 3s, force it off
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    // Get initial session on mount
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => {
          clearTimeout(loadingTimeout);
          setLoading(false);
        });
      } else {
        clearTimeout(loadingTimeout);
        setLoading(false);
      }
    }).catch(() => {
      clearTimeout(loadingTimeout);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        // Skip INITIAL_SESSION — already handled by getSession() above
        if (event === 'INITIAL_SESSION') return;
        // Skip events fired during user creation (signUp swaps the session temporarily)
        if (suppressAuthEvents.current) return;

        setSession(s);
        if (s?.user) {
          // Skip if profile is already loaded (signIn handles it directly)
          if (!profile || profile.id !== s.user.id) {
            await fetchProfile(s.user.id);
          }
        } else {
          setProfile(null);
          setSchool(null);
        }
      }
    );

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // ── Sign in ─────────────────────────────────────────────────
  const signIn = async (email, password) => {
    setError(null);
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) {
      setError(authErr.message);
      return { error: authErr };
    }
    // Set session + fetch profile immediately — don't rely on async onAuthStateChange
    setSession(data.session);
    try {
      await fetchProfile(data.user.id);
    } catch (err) {
      // fetchProfile already handles errors internally (sets error, signs out)
      return { error: { message: err.message || 'Failed to load profile' } };
    }
    // Fire last_login update in background — don’t await it during login.
    api.updateProfile(data.user.id, { last_login: new Date().toISOString() }).catch(() => {});
    return { data };
  };

  // ── Sign out ─────────────────────────────────────────────────
  const signOut = async () => {
    clearCache();
    setProfile(null);
    setSchool(null);
    setSession(null);
    setError(null);
    await supabase.auth.signOut();
  };

  // ── Admin: Create user ───────────────────────────────────────
  const createUser = async ({ email, password, name, role, schoolId }) => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();

    const targetSchoolId = profile?.role === 'super_admin'
      ? (schoolId || null)
      : profile?.school_id;

    suppressAuthEvents.current = true;
    let newUserId = null;
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role, school_id: targetSchoolId || '' },
          emailRedirectTo: null,
        },
      });

      if (signUpErr) return { error: signUpErr };

      newUserId = signUpData.user?.id;
      if (!newUserId) {
        return { error: new Error('Failed to create user — this email may already be registered.') };
      }
    } finally {
      if (currentSession) {
        await supabase.auth.setSession({
          access_token:  currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
      }
      suppressAuthEvents.current = false;
    }

    // Create profile in Neon via API
    const perms = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer;
    await api.createUserProfile({
      id: newUserId,
      schoolId: targetSchoolId,
      name,
      role,
      permissions: perms,
      createdBy: session?.user?.id,
    });

    return { data: { id: newUserId, email, name, role } };
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

  // ── Admin: Send password reset email ─────────────────────────
  let _lastResetAt = 0;
  const resetPassword = async (email) => {
    const now = Date.now();
    if (now - _lastResetAt < 60_000) {
      return { error: new Error('Please wait 60 seconds before sending another reset email.') };
    }
    _lastResetAt = now;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/update-password',
    });
    return { error: err };
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

  // List ALL users across ALL schools (super admin only)
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
