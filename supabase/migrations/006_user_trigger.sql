-- ============================================================
-- EduTime SaaS — Phase 6: Auto-create user_profiles via trigger
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Create the trigger function (SECURITY DEFINER = bypasses RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  school_uuid uuid;
  user_role   text;
  user_perms  jsonb;
BEGIN
  -- Safely parse school_id from metadata (blank/null → NULL uuid)
  BEGIN
    school_uuid := NULLIF(trim(NEW.raw_user_meta_data->>'school_id'), '')::uuid;
  EXCEPTION WHEN others THEN
    school_uuid := NULL;
  END;

  -- Role from metadata, default to 'viewer'
  user_role := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'role'), ''), 'viewer');

  -- Default permissions based on role
  user_perms := CASE user_role
    WHEN 'super_admin' THEN '{"viewTimetable":true,"editTimetable":true,"manageSubstitutions":true,"manageMasterData":true,"manageSettings":true,"manageUsers":true}'
    WHEN 'admin'       THEN '{"viewTimetable":true,"editTimetable":true,"manageSubstitutions":true,"manageMasterData":true,"manageSettings":true,"manageUsers":true}'
    WHEN 'teacher'     THEN '{"viewTimetable":true,"editTimetable":false,"manageSubstitutions":true,"manageMasterData":false,"manageSettings":false,"manageUsers":false}'
    ELSE                    '{"viewTimetable":true,"editTimetable":false,"manageSubstitutions":false,"manageMasterData":false,"manageSettings":false,"manageUsers":false}'
  END::jsonb;

  -- Insert profile (ON CONFLICT DO NOTHING prevents duplicate errors)
  INSERT INTO public.user_profiles (id, name, role, school_id, permissions, active)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
      split_part(NEW.email, '@', 1)   -- fallback to email prefix
    ),
    user_role,
    school_uuid,
    user_perms,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2. Attach trigger to auth.users — fires immediately after every new signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Done. Test: create a user via the app and check user_profiles
-- ============================================================
