-- ============================================================
-- EduTime Migration 011 — OR Subject Groups (per-class)
-- Adds:
--   school_settings.class_or_groups  jsonb
--     Shape: { "[classId]": [ { "label": "Language II", "subjectIds": ["sub_mal","sub_hin"] } ] }
-- ============================================================

alter table public.school_settings
  add column if not exists class_or_groups jsonb not null default '{}'::jsonb;
