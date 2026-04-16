import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

// ── Default permission sets by role ────────────────────────────
const ROLE_DEFAULTS = {
  admin:   { viewTimetable: true, editTimetable: true, manageSubstitutions: true, manageMasterData: true, manageSettings: true, manageUsers: true },
  teacher: { viewTimetable: true, editTimetable: false, manageSubstitutions: true, manageMasterData: false, manageSettings: false, manageUsers: false },
  viewer:  { viewTimetable: true, editTimetable: false, manageSubstitutions: false, manageMasterData: false, manageSettings: false, manageUsers: false },
};

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(null);
  const [profile, setProfile]   = useState(null);   // user_profiles row
  const [school, setSchool]     = useState(null);    // schools row
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // ── Fetch profile + school for a given user id ───────────────
  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data: prof, error: profErr } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profErr) throw profErr;
      if (!prof) throw new Error('No user profile found');
      if (!prof.active) throw new Error('Account is deactivated');

      setProfile(prof);

      // Fetch school
      const { data: sch, error: schErr } = await supabase
        .from('schools')
        .select('*')
        .eq('id', prof.school_id)
        .single();

      if (schErr) throw schErr;
      setSchool(sch);

      // Update last_login
      await supabase
        .from('user_profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', userId);

    } catch (err) {
      console.error('[AuthContext] fetchProfile error:', err);
      setError(err.message);
      setProfile(null);
      setSchool(null);
    }
  }, []);

  // ── Listen for auth state changes ────────────────────────────
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        if (s?.user) {
          await fetchProfile(s.user.id);
        } else {
          setProfile(null);
          setSchool(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // ── Sign in ──────────────────────────────────────────────────
  const signIn = async (email, password) => {
    setError(null);
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) {
      setError(authErr.message);
      return { error: authErr };
    }

    // Fetch profile and check active status
    const { data: prof } = await supabase
      .from('user_profiles')
      .select('active')
      .eq('id', data.user.id)
      .single();

    if (prof && !prof.active) {
      await supabase.auth.signOut();
      const deactivatedErr = new Error('Your account has been deactivated. Contact your school admin.');
      setError(deactivatedErr.message);
      return { error: deactivatedErr };
    }

    return { data };
  };

  // ── Sign out ─────────────────────────────────────────────────
  const signOut = async () => {
    setError(null);
    await supabase.auth.signOut();
    setProfile(null);
    setSchool(null);
    setSession(null);
  };

  // ── Admin: Create user ───────────────────────────────────────
  const createUser = async ({ email, password, name, role, permissions }) => {
    const perms = permissions || ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer;

    // Use Supabase's admin invite (via service key) or our own fallback approach
    // Since we don't have service role key on client, we create via signUp + profile insert
    // The admin needs to be logged in, so we use a workaround:
    // 1. Sign up the new user with supabase.auth.signUp (they get auto-confirmed if settings allow)
    // 2. Insert their profile (RLS allows because admin's school_id matches)

    // Save current session
    const { data: { session: currentSession } } = await supabase.auth.getSession();

    // Sign up new user
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role }, // stored in auth.users raw_user_meta_data
      }
    });

    if (signUpErr) return { error: signUpErr };

    const newUserId = signUpData.user?.id;
    if (!newUserId) return { error: new Error('Failed to create user') };

    // Re-authenticate as admin (signUp may have changed the session)
    if (currentSession) {
      await supabase.auth.setSession({
        access_token: currentSession.access_token,
        refresh_token: currentSession.refresh_token,
      });
    }

    // Insert profile
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .insert({
        id: newUserId,
        school_id: profile.school_id,
        name,
        role,
        permissions: perms,
        created_by: session.user.id,
      });

    if (profileErr) return { error: profileErr };

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
      .select('*, schools(code, name)')
      .eq('school_id', profile?.school_id)
      .order('created_at', { ascending: true });
    return { data, error: err };
  };

  // ── Admin: Send password reset email ─────────────────────────
  const resetPassword = async (email) => {
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    return { error: err };
  };

  // ── Helpers ──────────────────────────────────────────────────
  const isAdmin     = profile?.role === 'admin';
  const isTeacher   = profile?.role === 'teacher';
  const isViewer    = profile?.role === 'viewer';
  const isLoggedIn  = !!session && !!profile;
  const can = (perm) => profile?.permissions?.[perm] === true || profile?.role === 'admin';

  const value = {
    session, profile, school, loading, error,
    isAdmin, isTeacher, isViewer, isLoggedIn, can,
    signIn, signOut,
    createUser, updateUser, deleteUser, listUsers, resetPassword,
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
