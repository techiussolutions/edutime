-- ============================================================
-- EduTime SaaS — Phase 3: Feature Flags + Global User Access
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add feature_flags column to schools table
ALTER TABLE public.schools 
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{
    "timetable": true,
    "substitutions": true,
    "masterData": true,
    "wizard": true,
    "dailyTimetable": true,
    "reports": false
  }'::jsonb;

-- 2. Add subscription_tier column (for future billing)
ALTER TABLE public.schools 
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free'
  CHECK (subscription_tier IN ('free', 'pro', 'enterprise'));

-- 3. Add status column
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'suspended', 'trial'));

-- 4. Allow super_admin to read all user profiles (already in place from 002)
-- Super admin can now list ALL users across all schools
-- The existing "users_read_school_profiles" policy combined with super_admin bypass handles this

-- 5. Update self_update_last_login policy to not conflict with admin update policy
DROP POLICY IF EXISTS "self_update_last_login" ON public.user_profiles;
CREATE POLICY "self_update_last_login" ON public.user_profiles FOR UPDATE
  USING (id = auth.uid() OR public.my_role() = 'super_admin' OR (school_id = public.my_school_id() AND public.my_role() = 'admin'));

-- ============================================================
-- VERIFY: Check these commands after running
-- SELECT * FROM public.schools;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'schools';
-- ============================================================
