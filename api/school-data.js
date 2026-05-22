import { sql } from './_lib/db.js';
import { verifyAuth, cors, unauthorized, badRequest } from './_lib/auth.js';

// GET /api/school-data?schoolId=xxx — load all school data
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await verifyAuth(req);
  if (!auth) return unauthorized(res);

  const db = sql();

  // Super admins may query any school via query param; everyone else is locked to their own school
  const schoolId = auth.role === 'super_admin'
    ? (req.query.schoolId || auth.schoolId)
    : auth.schoolId;
  if (!schoolId) return badRequest(res, 'schoolId required');

  // Parallel fetch all tables
  const [schoolProfile, settings, teachers, classes, subjects, assignments, slots, availability, absences, substitutions, snapshots] = await Promise.all([
    db`SELECT id, name, code, board, academic_year, address, logo FROM schools WHERE id = ${schoolId} LIMIT 1`,
    db`SELECT * FROM school_settings WHERE school_id = ${schoolId} LIMIT 1`,
    db`SELECT id, name, department, subjects, max_periods, phone, email, designation, joining, active FROM teachers WHERE school_id = ${schoolId}`,
    db`SELECT id, name, grade, section, class_teacher_id FROM classes WHERE school_id = ${schoolId}`,
    db`SELECT id, name, code, applicable_classes, concurrent FROM subjects WHERE school_id = ${schoolId}`,
    db`SELECT id, class_id, subject_id, teacher_id, teacher_ids FROM class_subject_assignments WHERE school_id = ${schoolId}`,
    db`SELECT id, class_id, day, period, teacher_id, subject_id, is_locked, alternatives FROM timetable_slots WHERE school_id = ${schoolId}`,
    db`SELECT teacher_id, day_key, period, available FROM teacher_availability WHERE school_id = ${schoolId}`,
    db`SELECT id, teacher_id, date, leave_type, reason FROM absences WHERE school_id = ${schoolId} ORDER BY date DESC LIMIT 500`,
    db`SELECT id, date, day, period, schedule_id, absent_teacher_id, substitute_teacher_id, assigned_by FROM substitutions WHERE school_id = ${schoolId} ORDER BY date DESC LIMIT 500`,
    db`SELECT id, name, description, slots, created_by, created_at FROM timetable_snapshots WHERE school_id = ${schoolId} ORDER BY created_at DESC`.catch(() => []),
  ]);

  return res.json({
    schoolProfile: schoolProfile[0] || null,
    settings: settings[0] || null,
    teachers,
    classes,
    subjects,
    assignments,
    slots,
    availability,
    absences,
    substitutions,
    snapshots,
    isEmpty: !teachers.length && !classes.length && !subjects.length,
  });
}
