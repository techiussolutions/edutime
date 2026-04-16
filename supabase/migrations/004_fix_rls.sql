-- ============================================================
-- EduTime SaaS — Phase 4: Fix RLS (Full rebuild)
-- ============================================================

-- 1. Drop functions WITH CASCADE (removes all dependent policies too)
DROP FUNCTION IF EXISTS public.my_school_id() CASCADE;
DROP FUNCTION IF EXISTS public.my_role() CASCADE;

-- 2. Recreate helper functions as SECURITY DEFINER
--    These bypass RLS internally, breaking the circular dependency
CREATE FUNCTION public.my_school_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT school_id FROM public.user_profiles WHERE id = auth.uid();
$$;

CREATE FUNCTION public.my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 3. Recreate ALL schools policies
-- ============================================================
CREATE POLICY "users_read_own_school" ON public.schools FOR SELECT
  USING (id = public.my_school_id() OR public.my_role() = 'super_admin');

CREATE POLICY "admins_update_own_school" ON public.schools FOR UPDATE
  USING (
    (id = public.my_school_id() AND public.my_role() = 'admin')
    OR public.my_role() = 'super_admin'
  );

CREATE POLICY "super_admin_insert_schools" ON public.schools FOR INSERT
  WITH CHECK (public.my_role() = 'super_admin');

CREATE POLICY "super_admin_delete_schools" ON public.schools FOR DELETE
  USING (public.my_role() = 'super_admin');

-- ============================================================
-- 4. Recreate ALL user_profiles policies
-- ============================================================

-- SELECT: always allow self-read; also allow same-school or super_admin
CREATE POLICY "users_read_school_profiles" ON public.user_profiles FOR SELECT
  USING (
    id = auth.uid()
    OR school_id = public.my_school_id()
    OR public.my_role() = 'super_admin'
  );

-- INSERT
CREATE POLICY "admins_insert_profiles" ON public.user_profiles FOR INSERT
  WITH CHECK (
    (school_id = public.my_school_id() AND public.my_role() = 'admin')
    OR public.my_role() = 'super_admin'
  );

-- UPDATE: allow self-update (for last_login etc) + admin + super_admin
CREATE POLICY "admins_update_profiles" ON public.user_profiles FOR UPDATE
  USING (
    id = auth.uid()
    OR (school_id = public.my_school_id() AND public.my_role() = 'admin')
    OR public.my_role() = 'super_admin'
  );

-- DELETE
CREATE POLICY "admins_delete_profiles" ON public.user_profiles FOR DELETE
  USING (
    (
      (school_id = public.my_school_id() AND public.my_role() = 'admin')
      OR public.my_role() = 'super_admin'
    )
    AND id != auth.uid()
  );

-- ============================================================
-- Done. Verify: SELECT public.my_role(); should return your role.
-- ============================================================
