-- ============================================================
-- EduTime SaaS — Initial Schema
-- Run this in your Supabase project: SQL Editor → New query
-- ============================================================

-- 1. SCHOOLS (tenants)
create table if not exists public.schools (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  board         text not null default 'CBSE',
  academic_year text not null default '2025-2026',
  address       text not null default '',
  logo          text not null default '🏫',
  created_at    timestamptz not null default now()
);

-- 2. USER PROFILES (extends auth.users)
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,
  role        text not null default 'teacher' check (role in ('admin','teacher','viewer')),
  active      boolean not null default true,
  permissions jsonb not null default '{
    "viewTimetable": true,
    "editTimetable": false,
    "manageSubstitutions": false,
    "manageMasterData": false,
    "manageSettings": false,
    "manageUsers": false
  }'::jsonb,
  created_by  uuid references auth.users(id),
  last_login  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists user_profiles_school_id_idx on public.user_profiles(school_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.schools enable row level security;
alter table public.user_profiles enable row level security;

-- Helper: get the current user's school_id
create or replace function public.my_school_id()
returns uuid language sql security definer stable as $$
  select school_id from public.user_profiles where id = auth.uid();
$$;

-- Helper: get the current user's role
create or replace function public.my_role()
returns text language sql security definer stable as $$
  select role from public.user_profiles where id = auth.uid();
$$;

-- Schools: users can read their own school
create policy "users_read_own_school"
  on public.schools for select
  using (id = public.my_school_id());

-- Schools: admins can update their own school
create policy "admins_update_own_school"
  on public.schools for update
  using (id = public.my_school_id() and public.my_role() = 'admin');

-- User profiles: users can read all profiles in their school
create policy "users_read_school_profiles"
  on public.user_profiles for select
  using (school_id = public.my_school_id());

-- User profiles: admins can insert new users in their school
create policy "admins_insert_profiles"
  on public.user_profiles for insert
  with check (school_id = public.my_school_id() and public.my_role() = 'admin');

-- User profiles: admins can update profiles in their school
create policy "admins_update_profiles"
  on public.user_profiles for update
  using (school_id = public.my_school_id() and public.my_role() = 'admin');

-- User profiles: admins can delete profiles in their school (except themselves)
create policy "admins_delete_profiles"
  on public.user_profiles for delete
  using (school_id = public.my_school_id() and public.my_role() = 'admin' and id != auth.uid());

-- Each user can update their own last_login
create policy "self_update_last_login"
  on public.user_profiles for update
  using (id = auth.uid());

-- ============================================================
-- No seed data — schools and users are created via the platform admin UI.
-- Super Admin account must be bootstrapped via 002_super_admin.sql
-- ============================================================
