-- ============================================================
-- EduTime SaaS — Phase 5: RLS Performance Optimisation
-- ============================================================
-- The slowness is caused by my_role() and my_school_id() being
-- evaluated ONCE PER ROW in RLS policies.
-- Wrapping in (SELECT ...) makes Postgres evaluate them ONCE
-- per query and cache the result — a massive speedup.
-- ============================================================

-- 1. Drop all existing policies that use the slow pattern
DROP POLICY IF EXISTS "users_read_own_school"        ON public.schools;
DROP POLICY IF EXISTS "admins_update_own_school"     ON public.schools;
DROP POLICY IF EXISTS "super_admin_insert_schools"   ON public.schools;
DROP POLICY IF EXISTS "super_admin_delete_schools"   ON public.schools;

DROP POLICY IF EXISTS "users_read_school_profiles"   ON public.user_profiles;
DROP POLICY IF EXISTS "admins_insert_profiles"       ON public.user_profiles;
DROP POLICY IF EXISTS "admins_update_profiles"       ON public.user_profiles;
DROP POLICY IF EXISTS "admins_delete_profiles"       ON public.user_profiles;

-- 2. Recreate policies with (SELECT my_role()) — evaluated once per query
-- SCHOOLS
CREATE POLICY "users_read_own_school" ON public.schools FOR SELECT
  USING (
    id = (SELECT public.my_school_id())
    OR (SELECT public.my_role()) = 'super_admin'
  );

CREATE POLICY "admins_update_own_school" ON public.schools FOR UPDATE
  USING (
    (id = (SELECT public.my_school_id()) AND (SELECT public.my_role()) = 'admin')
    OR (SELECT public.my_role()) = 'super_admin'
  );

CREATE POLICY "super_admin_insert_schools" ON public.schools FOR INSERT
  WITH CHECK ((SELECT public.my_role()) = 'super_admin');

CREATE POLICY "super_admin_delete_schools" ON public.schools FOR DELETE
  USING ((SELECT public.my_role()) = 'super_admin');

-- USER PROFILES
CREATE POLICY "users_read_school_profiles" ON public.user_profiles FOR SELECT
  USING (
    id = auth.uid()
    OR school_id = (SELECT public.my_school_id())
    OR (SELECT public.my_role()) = 'super_admin'
  );

CREATE POLICY "admins_insert_profiles" ON public.user_profiles FOR INSERT
  WITH CHECK (
    (school_id = (SELECT public.my_school_id()) AND (SELECT public.my_role()) = 'admin')
    OR (SELECT public.my_role()) = 'super_admin'
  );

CREATE POLICY "admins_update_profiles" ON public.user_profiles FOR UPDATE
  USING (
    id = auth.uid()
    OR (school_id = (SELECT public.my_school_id()) AND (SELECT public.my_role()) = 'admin')
    OR (SELECT public.my_role()) = 'super_admin'
  );

CREATE POLICY "admins_delete_profiles" ON public.user_profiles FOR DELETE
  USING (
    id != auth.uid()
    AND (
      (school_id = (SELECT public.my_school_id()) AND (SELECT public.my_role()) = 'admin')
      OR (SELECT public.my_role()) = 'super_admin'
    )
  );

-- 3. Add indexes to speed up the lookups used in RLS checks
CREATE INDEX IF NOT EXISTS idx_user_profiles_school_id ON public.user_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role      ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_schools_id              ON public.schools(id);

-- ============================================================
-- Verify: run a query and check it's fast
-- SELECT COUNT(*) FROM public.user_profiles;
-- ============================================================
