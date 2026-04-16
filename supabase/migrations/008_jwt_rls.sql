-- ============================================================
-- EduTime SaaS — Phase 8: Zero-query RLS via JWT claims
-- ============================================================
-- Current problem: every RLS policy check calls my_role() or
-- my_school_id() which each fire a SELECT on user_profiles.
-- Even with (SELECT ...) caching, that's still a DB query per request.
--
-- Fix: read role/school_id directly from the JWT token (in memory,
-- zero DB roundtrips). The JWT is set by Supabase Auth and contains
-- the raw_user_meta_data we set in signUp options.data.
-- ============================================================

-- 1. JWT helper functions (no DB query — reads from in-memory JWT)
CREATE OR REPLACE FUNCTION public.jwt_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'app_metadata'  ->> 'role'
  );
$$;

CREATE OR REPLACE FUNCTION public.jwt_school_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'school_id',
    auth.jwt() -> 'app_metadata'  ->> 'school_id'
  ), '')::uuid;
$$;

-- Keep the old SECURITY DEFINER functions as fallback for admin SQL
-- (they are still useful server-side but no longer used in policies)

-- ============================================================
-- 2. Drop ALL existing policies and recreate with JWT functions
-- ============================================================

-- SCHOOLS
DROP POLICY IF EXISTS "users_read_own_school"      ON public.schools;
DROP POLICY IF EXISTS "admins_update_own_school"   ON public.schools;
DROP POLICY IF EXISTS "super_admin_insert_schools" ON public.schools;
DROP POLICY IF EXISTS "super_admin_delete_schools" ON public.schools;

CREATE POLICY "users_read_own_school" ON public.schools FOR SELECT
  USING (
    id = (SELECT public.jwt_school_id())
    OR (SELECT public.jwt_role()) = 'super_admin'
  );

CREATE POLICY "admins_update_own_school" ON public.schools FOR UPDATE
  USING (
    (id = (SELECT public.jwt_school_id()) AND (SELECT public.jwt_role()) = 'admin')
    OR (SELECT public.jwt_role()) = 'super_admin'
  );

CREATE POLICY "super_admin_insert_schools" ON public.schools FOR INSERT
  WITH CHECK ((SELECT public.jwt_role()) = 'super_admin');

CREATE POLICY "super_admin_delete_schools" ON public.schools FOR DELETE
  USING ((SELECT public.jwt_role()) = 'super_admin');

-- USER PROFILES
DROP POLICY IF EXISTS "users_read_school_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "admins_insert_profiles"     ON public.user_profiles;
DROP POLICY IF EXISTS "admins_update_profiles"     ON public.user_profiles;
DROP POLICY IF EXISTS "admins_delete_profiles"     ON public.user_profiles;
DROP POLICY IF EXISTS "self_update_last_login"     ON public.user_profiles;

CREATE POLICY "users_read_school_profiles" ON public.user_profiles FOR SELECT
  USING (
    id = auth.uid()                                          -- always read own row
    OR school_id = (SELECT public.jwt_school_id())           -- same school
    OR (SELECT public.jwt_role()) = 'super_admin'            -- platform admin
  );

CREATE POLICY "admins_insert_profiles" ON public.user_profiles FOR INSERT
  WITH CHECK (
    (school_id = (SELECT public.jwt_school_id()) AND (SELECT public.jwt_role()) = 'admin')
    OR (SELECT public.jwt_role()) = 'super_admin'
  );

CREATE POLICY "admins_update_profiles" ON public.user_profiles FOR UPDATE
  USING (
    id = auth.uid()                                          -- self update (last_login etc)
    OR (school_id = (SELECT public.jwt_school_id()) AND (SELECT public.jwt_role()) = 'admin')
    OR (SELECT public.jwt_role()) = 'super_admin'
  );

CREATE POLICY "admins_delete_profiles" ON public.user_profiles FOR DELETE
  USING (
    id != auth.uid()
    AND (
      (school_id = (SELECT public.jwt_school_id()) AND (SELECT public.jwt_role()) = 'admin')
      OR (SELECT public.jwt_role()) = 'super_admin'
    )
  );

-- ============================================================
-- 3. Schema fixes (safe to re-run)
-- ============================================================

-- Allow NULL school_id (required for super_admin)
ALTER TABLE public.user_profiles
  ALTER COLUMN school_id DROP NOT NULL;

-- Allow super_admin in role check constraint
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'teacher', 'viewer'));

-- ============================================================
-- 4. Indexes (all idempotent)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_up_school_id   ON public.user_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_up_role        ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_up_active      ON public.user_profiles(active);
CREATE INDEX IF NOT EXISTS idx_up_school_role ON public.user_profiles(school_id, role);
CREATE INDEX IF NOT EXISTS idx_schools_code   ON public.schools(code);

-- ============================================================
-- Verify: SELECT public.jwt_role(); -- should return your role
-- SELECT public.jwt_school_id();    -- should return your school uuid
-- ============================================================
