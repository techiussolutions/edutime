-- Add setup_skipped column to school_settings
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS setup_skipped boolean NOT NULL DEFAULT false;
