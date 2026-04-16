-- ============================================================
-- EduTime — Neon PostgreSQL Schema
-- Run this in your Neon SQL Editor (or via psql)
-- No RLS — auth is handled at the API layer
-- ============================================================

-- 1. SCHOOLS (tenants)
CREATE TABLE IF NOT EXISTS schools (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  board         text NOT NULL DEFAULT 'CBSE',
  academic_year text NOT NULL DEFAULT '2025-2026',
  address       text NOT NULL DEFAULT '',
  logo          text NOT NULL DEFAULT '🏫',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. USER PROFILES (linked to Supabase Auth user IDs)
CREATE TABLE IF NOT EXISTS user_profiles (
  id          uuid PRIMARY KEY,       -- matches Supabase auth.users.id
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  role        text NOT NULL DEFAULT 'teacher' CHECK (role IN ('super_admin','admin','teacher','viewer')),
  active      boolean NOT NULL DEFAULT true,
  permissions jsonb NOT NULL DEFAULT '{
    "viewTimetable": true,
    "editTimetable": false,
    "manageSubstitutions": false,
    "manageMasterData": false,
    "manageSettings": false,
    "manageUsers": false
  }'::jsonb,
  created_by  uuid,
  last_login  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_profiles_school_id_idx ON user_profiles(school_id);

-- 3. SCHOOL SETTINGS
CREATE TABLE IF NOT EXISTS school_settings (
  school_id             uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  working_days          jsonb NOT NULL DEFAULT '{"Mon":true,"Tue":true,"Wed":true,"Thu":true,"Fri":true,"Sat":false}'::jsonb,
  periods_per_day       int NOT NULL DEFAULT 8,
  period_timings        jsonb NOT NULL DEFAULT '[]'::jsonb,
  break_periods         int[] NOT NULL DEFAULT '{3,7}',
  max_default_periods   int NOT NULL DEFAULT 30,
  substitution_priority text[] NOT NULL DEFAULT '{"same_dept","same_subject","any_free"}',
  assembly_day          text NOT NULL DEFAULT 'Mon',
  assembly_period       int NOT NULL DEFAULT 1,
  periods_config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  class_period_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_slots          text[] NOT NULL DEFAULT '{}',
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 4. SUBJECTS
CREATE TABLE IF NOT EXISTS subjects (
  id          text NOT NULL,
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text NOT NULL,
  grade_groups text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, school_id)
);

CREATE INDEX IF NOT EXISTS subjects_school_id_idx ON subjects(school_id);

-- 5. TEACHERS
CREATE TABLE IF NOT EXISTS teachers (
  id           text NOT NULL,
  school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name         text NOT NULL,
  department   text NOT NULL DEFAULT '',
  subjects     text[] NOT NULL DEFAULT '{}',
  max_periods  int NOT NULL DEFAULT 30,
  phone        text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  designation  text NOT NULL DEFAULT '',
  joining      text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, school_id)
);

CREATE INDEX IF NOT EXISTS teachers_school_id_idx ON teachers(school_id);

-- 6. CLASSES
CREATE TABLE IF NOT EXISTS classes (
  id               text NOT NULL,
  school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name             text NOT NULL,
  grade            text NOT NULL,
  section          text NOT NULL,
  grade_group      text NOT NULL,
  class_teacher_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, school_id)
);

CREATE INDEX IF NOT EXISTS classes_school_id_idx ON classes(school_id);

-- 7. CLASS SUBJECT ASSIGNMENTS
CREATE TABLE IF NOT EXISTS class_subject_assignments (
  id         text NOT NULL,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   text NOT NULL,
  subject_id text NOT NULL,
  teacher_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, school_id),
  UNIQUE (school_id, class_id, subject_id)
);

CREATE INDEX IF NOT EXISTS csa_school_id_idx ON class_subject_assignments(school_id);

-- 8. TIMETABLE SLOTS
CREATE TABLE IF NOT EXISTS timetable_slots (
  id         text NOT NULL,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id   text NOT NULL,
  day        int NOT NULL,
  period     int NOT NULL,
  teacher_id text,
  subject_id text,
  is_locked  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, school_id)
);

CREATE INDEX IF NOT EXISTS slots_school_id_idx ON timetable_slots(school_id);
CREATE INDEX IF NOT EXISTS slots_class_day_idx ON timetable_slots(school_id, class_id, day);
CREATE INDEX IF NOT EXISTS idx_slots_teacher ON timetable_slots(school_id, teacher_id);

-- 9. TEACHER AVAILABILITY
CREATE TABLE IF NOT EXISTS teacher_availability (
  id         text NOT NULL,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id text NOT NULL,
  day_key    text NOT NULL,
  period     int NOT NULL,
  available  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, school_id)
);

CREATE INDEX IF NOT EXISTS availability_school_teacher_idx ON teacher_availability(school_id, teacher_id);

-- 10. ABSENCES
CREATE TABLE IF NOT EXISTS absences (
  id          text NOT NULL,
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id  text NOT NULL,
  date        text NOT NULL,
  leave_type  text NOT NULL DEFAULT 'sick',
  reason      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, school_id)
);

CREATE INDEX IF NOT EXISTS absences_school_date_idx ON absences(school_id, date);
CREATE INDEX IF NOT EXISTS absences_teacher_idx ON absences(school_id, teacher_id);

-- 11. SUBSTITUTIONS
CREATE TABLE IF NOT EXISTS substitutions (
  id                    text NOT NULL,
  school_id             uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  date                  text NOT NULL,
  day                   int NOT NULL,
  period                int NOT NULL,
  schedule_id           text,
  absent_teacher_id     text NOT NULL,
  substitute_teacher_id text NOT NULL,
  assigned_by           text NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, school_id),
  UNIQUE (school_id, date, schedule_id)
);

CREATE INDEX IF NOT EXISTS subs_school_date_idx ON substitutions(school_id, date);
CREATE INDEX IF NOT EXISTS idx_subs_absent_teacher ON substitutions(school_id, absent_teacher_id, date);
CREATE INDEX IF NOT EXISTS idx_subs_substitute_teacher ON substitutions(school_id, substitute_teacher_id, date);
