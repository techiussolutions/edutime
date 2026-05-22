-- Add concurrent flag to subjects table
-- A concurrent subject is taught by one teacher to multiple classes simultaneously.
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS concurrent boolean NOT NULL DEFAULT false;
