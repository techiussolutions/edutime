import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function run() {
  console.log("Running migration...");
  try {
    await sql`ALTER TABLE public.timetable_slots ADD COLUMN IF NOT EXISTS alternatives jsonb;`;
    console.log("Success! Added alternatives column to timetable_slots.");
  } catch(e) {
    console.error("Migration failed", e);
  }
}
run();
