import { sql } from './_lib/db.js';

export default async function handler(req, res) {
  const db = sql();
  try {
    await db`ALTER TABLE public.timetable_slots ADD COLUMN IF NOT EXISTS alternatives jsonb;`;
    res.status(200).json({ success: true, message: 'Added alternatives column successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
