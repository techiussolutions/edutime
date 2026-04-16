-- ============================================================
-- EduTime — Phase 9: Performance fixes
-- 1. Replace slow my_school_id()/my_role() with jwt_school_id()/jwt_role()
--    on all operational tables (zero DB queries per RLS check)
-- 2. Add missing indexes for teacher-based lookups
-- ============================================================

-- ── 1. Missing indexes ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_slots_teacher
  ON public.timetable_slots(school_id, teacher_id);

CREATE INDEX IF NOT EXISTS idx_subs_absent_teacher
  ON public.substitutions(school_id, absent_teacher_id, date);

CREATE INDEX IF NOT EXISTS idx_subs_substitute_teacher
  ON public.substitutions(school_id, substitute_teacher_id, date);

-- ── 2. Drop old slow RLS policies on operational tables ──────

-- school_settings
DROP POLICY IF EXISTS "read_own_school_settings"     ON public.school_settings;
DROP POLICY IF EXISTS "admin_write_school_settings"  ON public.school_settings;

-- subjects
DROP POLICY IF EXISTS "read_own_subjects"            ON public.subjects;
DROP POLICY IF EXISTS "admin_write_subjects"         ON public.subjects;

-- teachers
DROP POLICY IF EXISTS "read_own_teachers"            ON public.teachers;
DROP POLICY IF EXISTS "admin_write_teachers"         ON public.teachers;

-- classes
DROP POLICY IF EXISTS "read_own_classes"             ON public.classes;
DROP POLICY IF EXISTS "admin_write_classes"          ON public.classes;

-- class_subject_assignments
DROP POLICY IF EXISTS "read_own_assignments"         ON public.class_subject_assignments;
DROP POLICY IF EXISTS "admin_write_assignments"      ON public.class_subject_assignments;

-- timetable_slots
DROP POLICY IF EXISTS "read_own_slots"               ON public.timetable_slots;
DROP POLICY IF EXISTS "editor_write_slots"           ON public.timetable_slots;

-- teacher_availability
DROP POLICY IF EXISTS "read_own_availability"        ON public.teacher_availability;
DROP POLICY IF EXISTS "admin_write_availability"     ON public.teacher_availability;

-- absences
DROP POLICY IF EXISTS "read_own_absences"            ON public.absences;
DROP POLICY IF EXISTS "admin_write_absences"         ON public.absences;

-- substitutions
DROP POLICY IF EXISTS "read_own_substitutions"       ON public.substitutions;
DROP POLICY IF EXISTS "write_substitutions"          ON public.substitutions;

-- ── 3. Recreate all policies using jwt_school_id() / jwt_role() ──

-- school_settings
CREATE POLICY "read_own_school_settings" ON public.school_settings FOR SELECT
  USING (school_id = (SELECT public.jwt_school_id()));

CREATE POLICY "admin_write_school_settings" ON public.school_settings FOR ALL
  USING (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  )
  WITH CHECK (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  );

-- subjects
CREATE POLICY "read_own_subjects" ON public.subjects FOR SELECT
  USING (school_id = (SELECT public.jwt_school_id()));

CREATE POLICY "admin_write_subjects" ON public.subjects FOR ALL
  USING (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  )
  WITH CHECK (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  );

-- teachers
CREATE POLICY "read_own_teachers" ON public.teachers FOR SELECT
  USING (school_id = (SELECT public.jwt_school_id()));

CREATE POLICY "admin_write_teachers" ON public.teachers FOR ALL
  USING (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  )
  WITH CHECK (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  );

-- classes
CREATE POLICY "read_own_classes" ON public.classes FOR SELECT
  USING (school_id = (SELECT public.jwt_school_id()));

CREATE POLICY "admin_write_classes" ON public.classes FOR ALL
  USING (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  )
  WITH CHECK (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  );

-- class_subject_assignments
CREATE POLICY "read_own_assignments" ON public.class_subject_assignments FOR SELECT
  USING (school_id = (SELECT public.jwt_school_id()));

CREATE POLICY "admin_write_assignments" ON public.class_subject_assignments FOR ALL
  USING (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  )
  WITH CHECK (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  );

-- timetable_slots
CREATE POLICY "read_own_slots" ON public.timetable_slots FOR SELECT
  USING (school_id = (SELECT public.jwt_school_id()));

CREATE POLICY "editor_write_slots" ON public.timetable_slots FOR ALL
  USING (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  )
  WITH CHECK (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  );

-- teacher_availability
CREATE POLICY "read_own_availability" ON public.teacher_availability FOR SELECT
  USING (school_id = (SELECT public.jwt_school_id()));

CREATE POLICY "admin_write_availability" ON public.teacher_availability FOR ALL
  USING (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  )
  WITH CHECK (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  );

-- absences
CREATE POLICY "read_own_absences" ON public.absences FOR SELECT
  USING (school_id = (SELECT public.jwt_school_id()));

CREATE POLICY "admin_write_absences" ON public.absences FOR ALL
  USING (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  )
  WITH CHECK (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin')
  );

-- substitutions (teachers can also write — mark substitutions)
CREATE POLICY "read_own_substitutions" ON public.substitutions FOR SELECT
  USING (school_id = (SELECT public.jwt_school_id()));

CREATE POLICY "write_substitutions" ON public.substitutions FOR ALL
  USING (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin','teacher')
  )
  WITH CHECK (
    school_id = (SELECT public.jwt_school_id())
    AND (SELECT public.jwt_role()) IN ('admin','super_admin','teacher')
  );
