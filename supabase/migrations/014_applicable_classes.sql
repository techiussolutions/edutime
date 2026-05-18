-- 1. Add applicable_classes column to subjects
ALTER TABLE subjects
ADD COLUMN applicable_classes text[] DEFAULT '{}';

-- 2. Drop grade_groups from subjects
ALTER TABLE subjects
DROP COLUMN IF EXISTS grade_groups;

-- 3. Drop grade_group from classes
ALTER TABLE classes
DROP COLUMN IF EXISTS grade_group;
