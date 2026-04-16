import { sql } from './_lib/db.js';
import { verifyAuth, cors, unauthorized, badRequest } from './_lib/auth.js';

// GET /api/school-data?schoolId=xxx — load all school data
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return unauthorized(res);

  const db = sql();
  const schoolId = req.query.schoolId || auth.schoolId;
  if (!schoolId) return badRequest(res, 'schoolId required');

  // Parallel fetch all 9 tables
  const [settings, teachers, classes, subjects, assignments, slots, availability, absences, substitutions] = await Promise.all([
    db`SELECT * FROM school_settings WHERE school_id = ${schoolId} LIMIT 1`,
    db`SELECT id, name, department, subjects, max_periods, phone, email, designation, joining, active FROM teachers WHERE school_id = ${schoolId}`,
    db`SELECT id, name, grade, section, grade_group, class_teacher_id FROM classes WHERE school_id = ${schoolId}`,
    db`SELECT id, name, code, grade_groups FROM subjects WHERE school_id = ${schoolId}`,
    db`SELECT id, class_id, subject_id, teacher_id FROM class_subject_assignments WHERE school_id = ${schoolId}`,
    db`SELECT id, class_id, day, period, teacher_id, subject_id, is_locked FROM timetable_slots WHERE school_id = ${schoolId}`,
    db`SELECT teacher_id, day_key, period, available FROM teacher_availability WHERE school_id = ${schoolId}`,
    db`SELECT id, teacher_id, date, leave_type, reason FROM absences WHERE school_id = ${schoolId} ORDER BY date DESC LIMIT 500`,
    db`SELECT id, date, day, period, schedule_id, absent_teacher_id, substitute_teacher_id, assigned_by FROM substitutions WHERE school_id = ${schoolId} ORDER BY date DESC LIMIT 500`,
  ]);

  return res.json({
    settings: settings[0] || null,
    teachers,
    classes,
    subjects,
    assignments,
    slots,
    availability,
    absences,
    substitutions,
    isEmpty: !teachers.length && !classes.length && !subjects.length,
  });
}
