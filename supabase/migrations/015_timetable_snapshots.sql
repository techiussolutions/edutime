-- Timetable version snapshots
CREATE TABLE IF NOT EXISTS timetable_snapshots (
  id          text NOT NULL,
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  slots       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, school_id)
);

CREATE INDEX IF NOT EXISTS snapshots_school_id_idx ON timetable_snapshots(school_id);

ALTER TABLE timetable_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_members_snapshots"
  ON timetable_snapshots FOR ALL
  USING (school_id = public.my_school_id());
