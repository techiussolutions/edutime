-- ============================================================
-- EduTime — Operational Tables
-- All school-level data: teachers, classes, subjects, schedule,
-- availability, absences, substitutions, settings.
-- Uses text PKs that match the app's internal ID convention so
-- no UUID refactor is required in the front-end.
-- ============================================================

-- ── SCHOOL SETTINGS ───────────────────────────────────────────────────────
-- One row per school; stores the settings JSON (period timings, working days,
-- substitution rules, etc.) previously kept only in localStorage.
create table if not exists public.school_settings (
  school_id      uuid primary key references public.schools(id) on delete cascade,
  working_days   jsonb not null default '{"Mon":true,"Tue":true,"Wed":true,"Thu":true,"Fri":true,"Sat":false}'::jsonb,
  periods_per_day int  not null default 8,
  period_timings jsonb not null default '[]'::jsonb,
  break_periods  int[] not null default '{3,7}',
  max_default_periods int not null default 30,
  substitution_priority text[] not null default '{"same_dept","same_subject","any_free"}',
  assembly_day          text  not null default 'Mon',
  assembly_period       int   not null default 1,
  periods_config        jsonb not null default '{}'::jsonb,
  class_period_settings jsonb not null default '{}'::jsonb,
  locked_slots          text[] not null default '{}',
  updated_at            timestamptz not null default now()
);

-- ── SUBJECTS ──────────────────────────────────────────────────────────────
create table if not exists public.subjects (
  id          text not null,          -- e.g. 'sub_math'
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  code        text not null,
  grade_groups text[] not null default '{}',
  created_at  timestamptz not null default now(),
  primary key (id, school_id)
);

create index if not exists subjects_school_id_idx on public.subjects(school_id);

-- ── TEACHERS ──────────────────────────────────────────────────────────────
create table if not exists public.teachers (
  id           text not null,         -- e.g. 'st1'
  school_id    uuid not null references public.schools(id) on delete cascade,
  name         text not null,
  department   text not null default '',
  subjects     text[] not null default '{}',   -- array of subject ids
  max_periods  int  not null default 30,
  phone        text not null default '',
  email        text not null default '',
  designation  text not null default '',
  joining      text not null default '',       -- ISO date string
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (id, school_id)
);

create index if not exists teachers_school_id_idx on public.teachers(school_id);

-- ── CLASSES ───────────────────────────────────────────────────────────────
create table if not exists public.classes (
  id               text not null,     -- e.g. 'c_10A'
  school_id        uuid not null references public.schools(id) on delete cascade,
  name             text not null,
  grade            text not null,
  section          text not null,
  grade_group      text not null,
  class_teacher_id text,              -- teacher.id within the same school
  created_at       timestamptz not null default now(),
  primary key (id, school_id)
);

create index if not exists classes_school_id_idx on public.classes(school_id);

-- ── CLASS SUBJECT ASSIGNMENTS ─────────────────────────────────────────────
-- Maps which teacher teaches which subject in which class.
create table if not exists public.class_subject_assignments (
  id         text not null,           -- e.g. 'ca_10A_math'
  school_id  uuid not null references public.schools(id) on delete cascade,
  class_id   text not null,
  subject_id text not null,
  teacher_id text,
  created_at timestamptz not null default now(),
  primary key (id, school_id),
  unique (school_id, class_id, subject_id)
);

create index if not exists csa_school_id_idx on public.class_subject_assignments(school_id);

-- ── TIMETABLE SLOTS ───────────────────────────────────────────────────────
-- One row per (class, day, period) slot.
create table if not exists public.timetable_slots (
  id         text not null,           -- e.g. 'sch_c_10A_0_1'
  school_id  uuid not null references public.schools(id) on delete cascade,
  class_id   text not null,
  day        int  not null,           -- 0=Mon … 5=Sat
  period     int  not null,
  teacher_id text,
  subject_id text,
  is_locked  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (id, school_id)
);

create index if not exists slots_school_id_idx on public.timetable_slots(school_id);
create index if not exists slots_class_day_idx on public.timetable_slots(school_id, class_id, day);

-- ── TEACHER AVAILABILITY ──────────────────────────────────────────────────
-- Stores which (day, period) slots a teacher is unavailable.
-- Only rows where available = false need to be stored (absence of row = available).
create table if not exists public.teacher_availability (
  id         text not null,           -- e.g. 'av_st1_Mon_2'
  school_id  uuid not null references public.schools(id) on delete cascade,
  teacher_id text not null,
  day_key    text not null,           -- 'Mon', 'Tue', etc.
  period     int  not null,
  available  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (id, school_id)
);

create index if not exists availability_school_teacher_idx on public.teacher_availability(school_id, teacher_id);

-- ── ABSENCES ──────────────────────────────────────────────────────────────
create table if not exists public.absences (
  id          text not null,          -- e.g. 'abs_uuid'
  school_id   uuid not null references public.schools(id) on delete cascade,
  teacher_id  text not null,
  date        text not null,          -- ISO date string 'YYYY-MM-DD'
  leave_type  text not null default 'sick',
  reason      text not null default '',
  created_at  timestamptz not null default now(),
  primary key (id, school_id)
);

create index if not exists absences_school_date_idx on public.absences(school_id, date);
create index if not exists absences_teacher_idx on public.absences(school_id, teacher_id);

-- ── SUBSTITUTIONS ─────────────────────────────────────────────────────────
create table if not exists public.substitutions (
  id                    text not null,
  school_id             uuid not null references public.schools(id) on delete cascade,
  date                  text not null,          -- 'YYYY-MM-DD'
  day                   int  not null,          -- 0=Mon…5=Sat
  period                int  not null,
  schedule_id           text,                   -- timetable_slots.id
  absent_teacher_id     text not null,
  substitute_teacher_id text not null,
  assigned_by           text not null default '',
  created_at            timestamptz not null default now(),
  primary key (id, school_id),
  unique (school_id, date, schedule_id)
);

create index if not exists subs_school_date_idx on public.substitutions(school_id, date);

-- ============================================================
-- ROW LEVEL SECURITY
-- All tables: users can only read/write rows for their own school.
-- Admins can write; teachers/viewers can only read.
-- ============================================================

alter table public.school_settings         enable row level security;
alter table public.subjects                enable row level security;
alter table public.teachers                enable row level security;
alter table public.classes                 enable row level security;
alter table public.class_subject_assignments enable row level security;
alter table public.timetable_slots         enable row level security;
alter table public.teacher_availability    enable row level security;
alter table public.absences               enable row level security;
alter table public.substitutions          enable row level security;

-- ── school_settings ──────────────────────────────────────────
create policy "read_own_school_settings"
  on public.school_settings for select
  using (school_id = public.my_school_id());

create policy "admin_write_school_settings"
  on public.school_settings for all
  using (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'))
  with check (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'));

-- ── subjects ─────────────────────────────────────────────────
create policy "read_own_subjects"
  on public.subjects for select
  using (school_id = public.my_school_id());

create policy "admin_write_subjects"
  on public.subjects for all
  using (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'))
  with check (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'));

-- ── teachers ─────────────────────────────────────────────────
create policy "read_own_teachers"
  on public.teachers for select
  using (school_id = public.my_school_id());

create policy "admin_write_teachers"
  on public.teachers for all
  using (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'))
  with check (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'));

-- ── classes ──────────────────────────────────────────────────
create policy "read_own_classes"
  on public.classes for select
  using (school_id = public.my_school_id());

create policy "admin_write_classes"
  on public.classes for all
  using (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'))
  with check (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'));

-- ── class_subject_assignments ────────────────────────────────
create policy "read_own_assignments"
  on public.class_subject_assignments for select
  using (school_id = public.my_school_id());

create policy "admin_write_assignments"
  on public.class_subject_assignments for all
  using (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'))
  with check (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'));

-- ── timetable_slots ──────────────────────────────────────────
create policy "read_own_slots"
  on public.timetable_slots for select
  using (school_id = public.my_school_id());

create policy "editor_write_slots"
  on public.timetable_slots for all
  using (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'))
  with check (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'));

-- ── teacher_availability ─────────────────────────────────────
create policy "read_own_availability"
  on public.teacher_availability for select
  using (school_id = public.my_school_id());

create policy "admin_write_availability"
  on public.teacher_availability for all
  using (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'))
  with check (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'));

-- ── absences ─────────────────────────────────────────────────
create policy "read_own_absences"
  on public.absences for select
  using (school_id = public.my_school_id());

create policy "admin_write_absences"
  on public.absences for all
  using (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'))
  with check (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin'));

-- ── substitutions ────────────────────────────────────────────
create policy "read_own_substitutions"
  on public.substitutions for select
  using (school_id = public.my_school_id());

create policy "write_substitutions"
  on public.substitutions for all
  using (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin','teacher'))
  with check (school_id = public.my_school_id() and public.my_role() in ('admin','super_admin','teacher'));
