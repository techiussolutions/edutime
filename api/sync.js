import { sql } from './_lib/db.js';
import { verifyAuth, cors, unauthorized, badRequest } from './_lib/auth.js';

// POST /api/sync — sync mutations to Neon
// Body: { action: string, schoolId: string, payload: any }
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyAuth(req);
  if (!auth) return unauthorized(res);

  const { action, schoolId, payload } = req.body;
  if (!action || !schoolId) return badRequest(res, 'action and schoolId required');

  const db = sql();

  try {
    switch (action) {
      // ── Teachers ────────────────────────────────────────
      case 'ADD_TEACHER':
      case 'UPDATE_TEACHER': {
        const t = payload;
        await db`
          INSERT INTO teachers (id, school_id, name, department, subjects, max_periods, phone, email, designation, joining, active)
          VALUES (${t.id}, ${schoolId}, ${t.name}, ${t.department || ''}, ${t.subjects || []}, ${t.maxPeriods ?? 30}, ${t.phone || ''}, ${t.email || ''}, ${t.designation || ''}, ${t.joining || ''}, ${t.active !== false})
          ON CONFLICT (id, school_id) DO UPDATE SET
            name = EXCLUDED.name, department = EXCLUDED.department, subjects = EXCLUDED.subjects,
            max_periods = EXCLUDED.max_periods, phone = EXCLUDED.phone, email = EXCLUDED.email,
            designation = EXCLUDED.designation, joining = EXCLUDED.joining, active = EXCLUDED.active
        `;
        break;
      }
      case 'DELETE_TEACHER':
        await db`DELETE FROM teachers WHERE id = ${payload} AND school_id = ${schoolId}`;
        break;

      // ── Classes ─────────────────────────────────────────
      case 'ADD_CLASS':
      case 'UPDATE_CLASS': {
        const c = payload;
        await db`
          INSERT INTO classes (id, school_id, name, grade, section, grade_group, class_teacher_id)
          VALUES (${c.id}, ${schoolId}, ${c.name}, ${c.grade}, ${c.section}, ${c.gradeGroup}, ${c.classTeacherId || null})
          ON CONFLICT (id, school_id) DO UPDATE SET
            name = EXCLUDED.name, grade = EXCLUDED.grade, section = EXCLUDED.section,
            grade_group = EXCLUDED.grade_group, class_teacher_id = EXCLUDED.class_teacher_id
        `;
        break;
      }
      case 'DELETE_CLASS':
        await db`DELETE FROM classes WHERE id = ${payload} AND school_id = ${schoolId}`;
        await db`DELETE FROM class_subject_assignments WHERE class_id = ${payload} AND school_id = ${schoolId}`;
        break;

      // ── Subjects ────────────────────────────────────────
      case 'ADD_SUBJECT':
      case 'UPDATE_SUBJECT': {
        const s = payload;
        await db`
          INSERT INTO subjects (id, school_id, name, code, grade_groups)
          VALUES (${s.id}, ${schoolId}, ${s.name}, ${s.code}, ${s.gradeGroups || []})
          ON CONFLICT (id, school_id) DO UPDATE SET
            name = EXCLUDED.name, code = EXCLUDED.code, grade_groups = EXCLUDED.grade_groups
        `;
        break;
      }
      case 'DELETE_SUBJECT':
        await db`DELETE FROM subjects WHERE id = ${payload} AND school_id = ${schoolId}`;
        break;

      // ── Assignments ─────────────────────────────────────
      case 'SET_CLASS_ASSIGNMENTS': {
        const { classId, assignments } = payload;
        await db`DELETE FROM class_subject_assignments WHERE class_id = ${classId} AND school_id = ${schoolId}`;
        const rows = assignments.filter(a => a.teacherId).map((a, i) => ({
          id: `ca_${classId}_${a.subjectId}_${i}`,
          school_id: schoolId,
          class_id: classId,
          subject_id: a.subjectId,
          teacher_id: a.teacherId,
        }));
        if (rows.length) {
          for (const r of rows) {
            await db`
              INSERT INTO class_subject_assignments (id, school_id, class_id, subject_id, teacher_id)
              VALUES (${r.id}, ${r.school_id}, ${r.class_id}, ${r.subject_id}, ${r.teacher_id})
              ON CONFLICT (id, school_id) DO UPDATE SET
                class_id = EXCLUDED.class_id, subject_id = EXCLUDED.subject_id, teacher_id = EXCLUDED.teacher_id
            `;
          }
        }
        break;
      }

      // ── Timetable slots ─────────────────────────────────
      case 'ASSIGN_SLOT': {
        const { classId, day, period, teacherId, subjectId } = payload;
        const slotId = `sch_${classId}_${day}_${period}`;
        await db`
          INSERT INTO timetable_slots (id, school_id, class_id, day, period, teacher_id, subject_id, is_locked)
          VALUES (${slotId}, ${schoolId}, ${classId}, ${day}, ${period}, ${teacherId || null}, ${subjectId || null}, false)
          ON CONFLICT (id, school_id) DO UPDATE SET
            teacher_id = EXCLUDED.teacher_id, subject_id = EXCLUDED.subject_id
        `;
        break;
      }
      case 'CLEAR_SLOT':
        await db`DELETE FROM timetable_slots WHERE id = ${payload} AND school_id = ${schoolId}`;
        break;
      case 'BULK_SET_SCHEDULE': {
        await db`DELETE FROM timetable_slots WHERE school_id = ${schoolId} AND is_locked = false`;
        if (payload?.length) {
          for (const s of payload) {
            const slotId = s.id || `sch_${s.classId}_${s.day}_${s.period}`;
            await db`
              INSERT INTO timetable_slots (id, school_id, class_id, day, period, teacher_id, subject_id, is_locked)
              VALUES (${slotId}, ${schoolId}, ${s.classId}, ${s.day}, ${s.period}, ${s.teacherId || null}, ${s.subjectId || null}, false)
              ON CONFLICT (id, school_id) DO UPDATE SET
                teacher_id = EXCLUDED.teacher_id, subject_id = EXCLUDED.subject_id
            `;
          }
        }
        break;
      }
      case 'LOCK_SLOT':
        await db`UPDATE timetable_slots SET is_locked = true WHERE id = ${payload} AND school_id = ${schoolId}`;
        break;
      case 'UNLOCK_SLOT':
        await db`UPDATE timetable_slots SET is_locked = false WHERE id = ${payload} AND school_id = ${schoolId}`;
        break;
      case 'UNLOCK_ALL_SLOTS':
        await db`UPDATE timetable_slots SET is_locked = false WHERE school_id = ${schoolId}`;
        break;

      // ── Teacher availability ────────────────────────────
      case 'SET_TEACHER_AVAILABILITY': {
        const { teacherId, availability } = payload;
        await db`DELETE FROM teacher_availability WHERE teacher_id = ${teacherId} AND school_id = ${schoolId}`;
        if (availability) {
          for (const [dayKey, periods] of Object.entries(availability)) {
            for (const [period, avail] of Object.entries(periods)) {
              const avId = `av_${teacherId}_${dayKey}_${period}`;
              await db`
                INSERT INTO teacher_availability (id, school_id, teacher_id, day_key, period, available)
                VALUES (${avId}, ${schoolId}, ${teacherId}, ${dayKey}, ${parseInt(period)}, ${!!avail})
              `;
            }
          }
        }
        break;
      }

      // ── Absences ────────────────────────────────────────
      case 'MARK_ABSENT': {
        const a = payload;
        await db`
          INSERT INTO absences (id, school_id, teacher_id, date, leave_type, reason)
          VALUES (${a.id}, ${schoolId}, ${a.teacherId}, ${a.date}, ${a.leaveType || 'sick'}, ${a.reason || ''})
          ON CONFLICT (id, school_id) DO UPDATE SET
            teacher_id = EXCLUDED.teacher_id, date = EXCLUDED.date, leave_type = EXCLUDED.leave_type, reason = EXCLUDED.reason
        `;
        break;
      }
      case 'REMOVE_ABSENCE':
        await db`DELETE FROM absences WHERE id = ${payload} AND school_id = ${schoolId}`;
        break;

      // ── Substitutions ───────────────────────────────────
      case 'ASSIGN_SUBSTITUTE': {
        const s = payload;
        await db`
          INSERT INTO substitutions (id, school_id, date, day, period, schedule_id, absent_teacher_id, substitute_teacher_id, assigned_by)
          VALUES (${s.id}, ${schoolId}, ${s.date}, ${s.day}, ${s.period}, ${s.scheduleId || null}, ${s.absentTeacherId}, ${s.substituteTeacherId}, ${s.assignedBy || ''})
          ON CONFLICT (id, school_id) DO UPDATE SET
            date = EXCLUDED.date, day = EXCLUDED.day, period = EXCLUDED.period,
            schedule_id = EXCLUDED.schedule_id, absent_teacher_id = EXCLUDED.absent_teacher_id,
            substitute_teacher_id = EXCLUDED.substitute_teacher_id, assigned_by = EXCLUDED.assigned_by
        `;
        break;
      }
      case 'REMOVE_SUBSTITUTE':
        await db`DELETE FROM substitutions WHERE id = ${payload} AND school_id = ${schoolId}`;
        break;

      // ── Settings (upsert) ──────────────────────────────
      case 'SYNC_SETTINGS': {
        const s = payload;
        await db`
          INSERT INTO school_settings (school_id, working_days, periods_per_day, period_timings, break_periods, max_default_periods, substitution_priority, assembly_day, assembly_period, periods_config, class_period_settings, locked_slots, setup_skipped, updated_at)
          VALUES (${schoolId}, ${JSON.stringify(s.working_days)}::jsonb, ${s.periods_per_day}, ${JSON.stringify(s.period_timings)}::jsonb, ${s.break_periods}, ${s.max_default_periods}, ${s.substitution_priority}, ${s.assembly_day}, ${s.assembly_period}, ${JSON.stringify(s.periods_config)}::jsonb, ${JSON.stringify(s.class_period_settings)}::jsonb, ${s.locked_slots}, ${s.setup_skipped || false}, ${new Date().toISOString()})
          ON CONFLICT (school_id) DO UPDATE SET
            working_days = EXCLUDED.working_days, periods_per_day = EXCLUDED.periods_per_day,
            period_timings = EXCLUDED.period_timings, break_periods = EXCLUDED.break_periods,
            max_default_periods = EXCLUDED.max_default_periods, substitution_priority = EXCLUDED.substitution_priority,
            assembly_day = EXCLUDED.assembly_day, assembly_period = EXCLUDED.assembly_period,
            periods_config = EXCLUDED.periods_config, class_period_settings = EXCLUDED.class_period_settings,
            locked_slots = EXCLUDED.locked_slots, setup_skipped = EXCLUDED.setup_skipped, updated_at = EXCLUDED.updated_at
        `;
        break;
      }

      // ── Seed initial data ──────────────────────────────
      case 'SEED': {
        const { settings, teachers, classes, subjects, assignments } = payload;
        if (settings) {
          await db`
            INSERT INTO school_settings (school_id, working_days, periods_per_day, period_timings, break_periods, max_default_periods, substitution_priority, assembly_day, assembly_period, periods_config, class_period_settings, locked_slots, setup_skipped, updated_at)
            VALUES (${schoolId}, ${JSON.stringify(settings.working_days)}::jsonb, ${settings.periods_per_day}, ${JSON.stringify(settings.period_timings)}::jsonb, ${settings.break_periods}, ${settings.max_default_periods}, ${settings.substitution_priority}, ${settings.assembly_day}, ${settings.assembly_period}, ${JSON.stringify(settings.periods_config || {})}::jsonb, ${JSON.stringify(settings.class_period_settings || {})}::jsonb, ${settings.locked_slots || []}, ${settings.setup_skipped || false}, ${new Date().toISOString()})
            ON CONFLICT (school_id) DO NOTHING
          `;
        }
        for (const t of (teachers || [])) {
          await db`
            INSERT INTO teachers (id, school_id, name, department, subjects, max_periods, phone, email, designation, joining, active)
            VALUES (${t.id}, ${schoolId}, ${t.name}, ${t.department || ''}, ${t.subjects || []}, ${t.max_periods ?? 30}, ${t.phone || ''}, ${t.email || ''}, ${t.designation || ''}, ${t.joining || ''}, ${t.active !== false})
            ON CONFLICT (id, school_id) DO NOTHING
          `;
        }
        for (const c of (classes || [])) {
          await db`
            INSERT INTO classes (id, school_id, name, grade, section, grade_group, class_teacher_id)
            VALUES (${c.id}, ${schoolId}, ${c.name}, ${c.grade}, ${c.section}, ${c.grade_group}, ${c.class_teacher_id || null})
            ON CONFLICT (id, school_id) DO NOTHING
          `;
        }
        for (const s of (subjects || [])) {
          await db`
            INSERT INTO subjects (id, school_id, name, code, grade_groups)
            VALUES (${s.id}, ${schoolId}, ${s.name}, ${s.code}, ${s.grade_groups || []})
            ON CONFLICT (id, school_id) DO NOTHING
          `;
        }
        for (const a of (assignments || [])) {
          await db`
            INSERT INTO class_subject_assignments (id, school_id, class_id, subject_id, teacher_id)
            VALUES (${a.id}, ${schoolId}, ${a.class_id}, ${a.subject_id}, ${a.teacher_id || null})
            ON CONFLICT (id, school_id) DO NOTHING
          `;
        }
        break;
      }

      default:
        return badRequest(res, `Unknown action: ${action}`);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[sync] Error:', action, err.message);
    return res.status(500).json({ error: err.message });
  }
}
