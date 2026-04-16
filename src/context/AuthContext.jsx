import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
      // 2. ONE query — joins school inline, no second round-trip
      const { data: prof, error: profErr } = await supabase
        .from('user_profiles')
        .select('id, name, role, school_id, active, permissions, last_login, schools(id, code, name, board, academic_year, address, logo)')
        .eq('id', userId)
        .single();

      if (profErr) {
        if (profErr.code === 'PGRST116') {
          throw new Error('No user profile found. Contact your administrator.');
        }
        // Other DB/RLS error — keep session alive, use cached data if available
        console.error('[AuthContext] Profile fetch error:', profErr.message);
        return;
      }

      if (!prof) throw new Error('No user profile found.');
      if (!prof.active) throw new Error('Your account has been deactivated. Contact your administrator.');

      // Separate the joined school from the profile object
      const { schools: sch, ...profileData } = prof;
      setProfile(profileData);
      setSchool(sch ?? null);
      setError(null);

      // 3. Update cache
      saveCache(profileData, sch ?? null);

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
    // Safety net: if loading is still true after 8s, force it off
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 8000);

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
          await fetchProfile(s.user.id);
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
    // onAuthStateChange fires next and calls fetchProfile, which checks active status.
    // Fire last_login update in background — don’t await it during login.
    supabase.from('user_profiles')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.user.id)
      .then(() => {});
    return { data };
  };

  // ── Sign out ─────────────────────────────────────────────────
  const signOut = async () => {
    // Clear cache + local state immediately so AuthGuard redirects right away
    clearCache();
    setProfile(null);
    setSchool(null);
    setSession(null);
    setError(null);
    await supabase.auth.signOut();
  };

  // ── Admin: Create user ───────────────────────────────────────
  // The DB trigger `on_auth_user_created` (006_user_trigger.sql) creates
  // the user_profiles row automatically using the metadata passed here.
  const createUser = async ({ email, password, name, role, schoolId }) => {
    // Save admin session before signUp replaces it
    const { data: { session: currentSession } } = await supabase.auth.getSession();

    const targetSchoolId = profile?.role === 'super_admin'
      ? (schoolId || null)
      : profile?.school_id;

    // Suppress auth listener so signUp's session swap doesn't redirect admin to /login
    suppressAuthEvents.current = true;
    let newUserId = null;
    try {
      // Pass profile data as metadata — the DB trigger reads these fields
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
      // Always restore admin session and re-enable listener
      if (currentSession) {
        await supabase.auth.setSession({
          access_token:  currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
      }
      suppressAuthEvents.current = false;
    }

    // Update permissions + created_by that the trigger can't infer
    const perms = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer;
    await supabase
      .from('user_profiles')
      .update({ permissions: perms, created_by: session?.user?.id })
      .eq('id', newUserId);

    return { data: { id: newUserId, email, name, role } };
  };


  // ── Admin: Update user profile ───────────────────────────────
  const updateUser = async (userId, updates) => {
    const { error: err } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId);
    return { error: err };
  };

  // ── Admin: Delete user profile ───────────────────────────────
  const deleteUser = async (userId) => {
    const { error: err } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId);
    return { error: err };
  };

  // ── Admin: List all users in the school ──────────────────────
  const listUsers = async () => {
    const { data, error: err } = await supabase
      .from('user_profiles')
      .select('id, name, role, active, email:id, permissions, created_at, schools(code, name)')
      .eq('school_id', profile?.school_id)
      .order('created_at', { ascending: true });
    return { data, error: err };
  };

  // ── Admin: Send password reset email (debounced — 60s cooldown) ───────────
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
    const { data, error: err } = await supabase.from('schools').select('*').order('name');
    return { data, error: err };
  };

  const createTenantSchool = async (schoolData) => {
    const { data, error: err } = await supabase.from('schools').insert(schoolData).select().single();
    return { data, error: err };
  };

  const updateSchool = async (schoolId, updates) => {
    const { error: err } = await supabase.from('schools').update(updates).eq('id', schoolId);
    return { error: err };
  };

  // List ALL users across ALL schools (super admin only)
  const listAllUsers = async (page = 0, pageSize = 50) => {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error: err, count } = await supabase
      .from('user_profiles')
      .select('id, name, role, active, school_id, permissions, created_at, schools(code, name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    return { data, error: err, count };
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
