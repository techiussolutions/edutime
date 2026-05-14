-- ============================================================
-- EduTime Migration 012 — Multi-teacher per Subject
-- Adds teacher_ids text[] to class_subject_assignments.
-- Falls back to teacher_id when teacher_ids is empty (backward compat).
-- ============================================================

alter table public.class_subject_assignments
  add column if not exists teacher_ids text[] not null default '{}';
