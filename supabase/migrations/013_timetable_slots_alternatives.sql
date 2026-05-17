-- ============================================================
-- EduTime Migration 013 — Timetable Slots Alternatives
-- Adds:
--   timetable_slots.alternatives  jsonb
--     Shape: [{ "subjectId": "...", "teacherId": "..." }]
-- ============================================================

alter table public.timetable_slots
  add column if not exists alternatives jsonb;
