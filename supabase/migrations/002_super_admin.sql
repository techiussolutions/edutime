-- ============================================================
-- EduTime SaaS — Phase 2: Super Admin
-- ============================================================

-- 1. Modify user_profiles schema
ALTER TABLE public.user_profiles ALTER COLUMN school_id DROP NOT NULL;

-- Drop the old auto-generated check constraint for role (usually named table_column_check)
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('super_admin', 'admin', 'teacher', 'viewer'));


-- 2. Drop existing restrictive policies
DROP POLICY IF EXISTS "users_read_own_school" ON public.schools;
DROP POLICY IF EXISTS "admins_update_own_school" ON public.schools;

DROP POLICY IF EXISTS "users_read_school_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "admins_insert_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "admins_update_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "admins_delete_profiles" ON public.user_profiles;


-- 3. Recreate policies with super_admin bypass

-- SCHOOLS
create policy "users_read_own_school" on public.schools for select
  using (id = public.my_school_id() OR public.my_role() = 'super_admin');

create policy "admins_update_own_school" on public.schools for update
  using ((id = public.my_school_id() AND public.my_role() = 'admin') OR public.my_role() = 'super_admin');

create policy "super_admin_insert_schools" on public.schools for insert
  with check (public.my_role() = 'super_admin');

create policy "super_admin_delete_schools" on public.schools for delete
  using (public.my_role() = 'super_admin');

-- USER PROFILES
create policy "users_read_school_profiles" on public.user_profiles for select
  using (school_id = public.my_school_id() OR public.my_role() = 'super_admin');

create policy "admins_insert_profiles" on public.user_profiles for insert
  with check ((school_id = public.my_school_id() AND public.my_role() = 'admin') OR public.my_role() = 'super_admin');

create policy "admins_update_profiles" on public.user_profiles for update
  using ((school_id = public.my_school_id() AND public.my_role() = 'admin') OR public.my_role() = 'super_admin');

create policy "admins_delete_profiles" on public.user_profiles for delete
  using (((school_id = public.my_school_id() AND public.my_role() = 'admin') OR public.my_role() = 'super_admin') AND id != auth.uid());


-- ============================================================
-- HOW TO USE:
-- Assuming you already created your admin and noted their UUID:
-- UPDATE public.user_profiles 
-- SET role = 'super_admin', school_id = NULL 
-- WHERE id = '<your-uuid>';
-- ============================================================
