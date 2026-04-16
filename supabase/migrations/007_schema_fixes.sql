-- ============================================================
-- EduTime SaaS — Phase 7: Schema fixes + index audit
-- ============================================================

-- 1. Fix user_profiles.school_id — must be nullable for super_admin
ALTER TABLE public.user_profiles
  ALTER COLUMN school_id DROP NOT NULL;

-- 2. Fix role CHECK constraint — add super_admin
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'teacher', 'viewer'));

-- 3. Ensure all needed indexes exist (idempotent)
CREATE INDEX IF NOT EXISTS idx_user_profiles_school_id  ON public.user_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role        ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_active      ON public.user_profiles(active);
CREATE INDEX IF NOT EXISTS idx_user_profiles_school_role ON public.user_profiles(school_id, role);

-- 4. Index on schools for fast lookup by code (already unique but explicit index helps planner)
CREATE INDEX IF NOT EXISTS idx_schools_code ON public.schools(code);

-- ============================================================
-- Verify: run EXPLAIN ANALYZE on a typical query
-- EXPLAIN ANALYZE SELECT * FROM public.user_profiles WHERE school_id = '<uuid>';
-- ============================================================
