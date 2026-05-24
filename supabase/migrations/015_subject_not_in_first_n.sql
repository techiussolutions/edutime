-- Add not_in_first_n column to subjects table
ALTER TABLE subjects
ADD COLUMN IF NOT EXISTS not_in_first_n integer NOT NULL DEFAULT 0;
