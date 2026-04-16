import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_SCHOOL, DEFAULT_SETTINGS, SUBJECTS, TEACHERS, CLASSES, SCHEDULE, CLASS_ASSIGNMENTS
} from './initialData';

const AppContext = createContext();

// ── DB SHAPE MAPPERS ─────────────────────────────────────────
const mapTeacherToDb  = (t, sid) => ({ id: t.id, school_id: sid, name: t.name, department: t.department || '', subjects: t.subjects || [], max_periods: t.maxPeriods ?? 30, phone: t.phone || '', email: t.email || '', designation: t.designation || '', joining: t.joining || '', active: t.active !== false });
const mapTeacherFromDb = (r)      => ({ id: r.id, name: r.name, department: r.department, subjects: r.subjects, maxPeriods: r.max_periods, phone: r.phone, email: r.email, designation: r.designation, joining: r.joining, active: r.active });
const mapClassToDb    = (c, sid) => ({ id: c.id, school_id: sid, name: c.name, grade: c.grade, section: c.section, grade_group: c.gradeGroup, class_teacher_id: c.classTeacherId || null });
const mapClassFromDb  = (r)      => ({ id: r.id, name: r.name, grade: r.grade, section: r.section, gradeGroup: r.grade_group, classTeacherId: r.class_teacher_id });
const mapSubjectToDb  = (s, sid) => ({ id: s.id, school_id: sid, name: s.name, code: s.code, grade_groups: s.gradeGroups || [] });
const mapSubjectFromDb = (r)     => ({ id: r.id, name: r.name, code: r.code, gradeGroups: r.grade_groups });
const mapAssignToDb   = (a, sid) => ({ id: a.id, school_id: sid, class_id: a.classId, subject_id: a.subjectId, teacher_id: a.teacherId || null });
const mapAssignFromDb = (r)      => ({ id: r.id, classId: r.class_id, subjectId: r.subject_id, teacherId: r.teacher_id });
const mapSlotToDb     = (s, sid) => ({ id: s.id, school_id: sid, class_id: s.classId, day: s.day, period: s.period, teacher_id: s.teacherId || null, subject_id: s.subjectId || null, is_locked: false });
const mapSlotFromDb   = (r)      => ({ id: r.id, classId: r.class_id, day: r.day, period: r.period, teacherId: r.teacher_id, subjectId: r.subject_id });
const mapAbsenceToDb  = (a, sid) => ({ id: a.id, school_id: sid, teacher_id: a.teacherId, date: a.date, leave_type: a.leaveType || 'sick', reason: a.reason || '' });
const mapAbsenceFromDb = (r)     => ({ id: r.id, teacherId: r.teacher_id, date: r.date, leaveType: r.leave_type, reason: r.reason });
const mapSubToDb      = (s, sid) => ({ id: s.id, school_id: sid, date: s.date, day: s.day, period: s.period, schedule_id: s.scheduleId || null, absent_teacher_id: s.absentTeacherId, substitute_teacher_id: s.substituteTeacherId, assigned_by: s.assignedBy || '' });
const mapSubFromDb    = (r)      => ({ id: r.id, date: r.date, day: r.day, period: r.period, scheduleId: r.schedule_id, absentTeacherId: r.absent_teacher_id, substituteTeacherId: r.substitute_teacher_id, assignedBy: r.assigned_by });

const mapSettingsToDb = (sid, settings, periodsConfig, classPeriodSettings, lockedSlots) => ({
  school_id: sid,
  working_days: settings.workingDays,
  periods_per_day: settings.periodsPerDay,
  period_timings: settings.periodTimings,
  break_periods: settings.breakPeriods,
  max_default_periods: settings.maxDefaultPeriods,
  substitution_priority: settings.substitutionPriority,
  assembly_day: settings.assemblyDay,
  assembly_period: settings.assemblyPeriod,
  periods_config: periodsConfig || {},
  class_period_settings: classPeriodSettings || {},
  locked_slots: lockedSlots || [],
  updated_at: new Date().toISOString(),
});
const mapSettingsFromDb = (r) => ({
  settings: { workingDays: r.working_days, periodsPerDay: r.periods_per_day, periodTimings: r.period_timings, breakPeriods: r.break_periods, maxDefaultPeriods: r.max_default_periods, substitutionPriority: r.substitution_priority, assemblyDay: r.assembly_day, assemblyPeriod: r.assembly_period },
  periodsConfig: r.periods_config || {},
  classPeriodSettings: r.class_period_settings || {},
  lockedSlots: r.locked_slots || [],
});

// Flatten teacherAvailability map { [tid]: { [dayKey]: { [period]: bool } } } → DB rows
const flattenAvailability = (avMap, schoolId) => {
  const rows = [];
  Object.entries(avMap || {}).forEach(([tid, days]) => {
    Object.entries(days || {}).forEach(([dayKey, periods]) => {
      Object.entries(periods || {}).forEach(([period, available]) => {
        rows.push({ id: `av_${tid}_${dayKey}_${period}`, school_id: schoolId, teacher_id: tid, day_key: dayKey, period: Number(period), available });
      });
    });
  });
  return rows;
};
// Rebuild teacherAvailability map from DB rows
const buildAvailabilityMap = (rows) => {
  const map = {};
  rows.forEach(r => {
    if (!map[r.teacher_id]) map[r.teacher_id] = {};
    if (!map[r.teacher_id][r.day_key]) map[r.teacher_id][r.day_key] = {};
    map[r.teacher_id][r.day_key][r.period] = r.available;
  });
  return map;
};

// ── LOAD ALL DATA FROM SUPABASE ──────────────────────────────
async function loadSchoolData(schoolId) {
  const [settRes, tchRes, clsRes, subRes, asgRes, slotRes, avRes, absRes, subsRes] = await Promise.all([
    supabase.from('school_settings').select('*').eq('school_id', schoolId).maybeSingle(),
    supabase.from('teachers').select('*').eq('school_id', schoolId),
    supabase.from('classes').select('*').eq('school_id', schoolId),
    supabase.from('subjects').select('*').eq('school_id', schoolId),
    supabase.from('class_subject_assignments').select('*').eq('school_id', schoolId),
    supabase.from('timetable_slots').select('*').eq('school_id', schoolId),
    supabase.from('teacher_availability').select('*').eq('school_id', schoolId),
    supabase.from('absences').select('*').eq('school_id', schoolId).order('date', { ascending: false }),
    supabase.from('substitutions').select('*').eq('school_id', schoolId).order('date', { ascending: false }),
  ]);

  const isEmpty = !tchRes.data?.length && !clsRes.data?.length && !subRes.data?.length;

  if (isEmpty) {
    // New school — seed from initialData and write to DB
    await seedSchoolData(schoolId);
    return null; // caller will re-load after seeding
  }

  const settingsData = settRes.data ? mapSettingsFromDb(settRes.data) : {};
  const lockedIds = settingsData.lockedSlots || [];

  return {
    settings: settingsData.settings || DEFAULT_SETTINGS,
    periodsConfig: settingsData.periodsConfig || {},
    classPeriodSettings: settingsData.classPeriodSettings || {},
    lockedSlots: lockedIds,
    teachers: (tchRes.data || []).map(mapTeacherFromDb),
    classes: (clsRes.data || []).map(mapClassFromDb),
    subjects: (subRes.data || []).map(mapSubjectFromDb),
    classAssignments: (asgRes.data || []).map(mapAssignFromDb),
    schedule: (slotRes.data || []).map(mapSlotFromDb),
    teacherAvailability: buildAvailabilityMap(avRes.data || []),
    absences: (absRes.data || []).map(mapAbsenceFromDb),
    substitutions: (subsRes.data || []).map(mapSubFromDb),
  };
}

// ── SEED INITIAL DATA FOR A NEW SCHOOL ──────────────────────
async function seedSchoolData(schoolId) {
  const settingsRow = mapSettingsToDb(schoolId, DEFAULT_SETTINGS, {}, {}, []);
  const teacherRows = TEACHERS.map(t => mapTeacherToDb(t, schoolId));
  const classRows   = CLASSES.map(c => mapClassToDb(c, schoolId));
  const subjectRows = SUBJECTS.map(s => mapSubjectToDb(s, schoolId));
  const assignRows  = CLASS_ASSIGNMENTS.map(a => mapAssignToDb(a, schoolId));

  await Promise.all([
    supabase.from('school_settings').upsert(settingsRow),
    supabase.from('teachers').upsert(teacherRows),
    supabase.from('classes').upsert(classRows),
    supabase.from('subjects').upsert(subjectRows),
    supabase.from('class_subject_assignments').upsert(assignRows),
  ]);
}

// ── SYNC ONE ACTION TO SUPABASE ──────────────────────────────
async function syncActionToSupabase(action, schoolId) {
  switch (action.type) {
    case 'ADD_TEACHER':
    case 'UPDATE_TEACHER':
      await supabase.from('teachers').upsert(mapTeacherToDb(action.payload, schoolId));
      break;
    case 'DELETE_TEACHER':
      await supabase.from('teachers').delete().eq('id', action.payload).eq('school_id', schoolId);
      break;
    case 'ADD_CLASS':
    case 'UPDATE_CLASS':
      await supabase.from('classes').upsert(mapClassToDb(action.payload, schoolId));
      break;
    case 'DELETE_CLASS':
      await supabase.from('classes').delete().eq('id', action.payload).eq('school_id', schoolId);
      await supabase.from('class_subject_assignments').delete().eq('class_id', action.payload).eq('school_id', schoolId);
      break;
    case 'ADD_SUBJECT':
    case 'UPDATE_SUBJECT':
      await supabase.from('subjects').upsert(mapSubjectToDb(action.payload, schoolId));
      break;
    case 'DELETE_SUBJECT':
      await supabase.from('subjects').delete().eq('id', action.payload).eq('school_id', schoolId);
      break;
    case 'SET_CLASS_ASSIGNMENTS': {
      const { classId, assignments } = action.payload;
      await supabase.from('class_subject_assignments').delete().eq('class_id', classId).eq('school_id', schoolId);
      const rows = assignments.filter(a => a.teacherId).map((a, i) => mapAssignToDb({ id: `ca_${classId}_${a.subjectId}_${i}`, classId, subjectId: a.subjectId, teacherId: a.teacherId }, schoolId));
      if (rows.length) await supabase.from('class_subject_assignments').upsert(rows);
      break;
    }
    case 'ASSIGN_SLOT': {
      const { classId, day, period, teacherId, subjectId } = action.payload;
      const slotId = `sch_${classId}_${day}_${period}`;
      await supabase.from('timetable_slots').upsert(mapSlotToDb({ id: slotId, classId, day, period, teacherId, subjectId }, schoolId));
      break;
    }
    case 'CLEAR_SLOT':
      await supabase.from('timetable_slots').delete().eq('id', action.payload).eq('school_id', schoolId);
      break;
    case 'BULK_SET_SCHEDULE': {
      // Delete unlocked slots, re-insert
      await supabase.from('timetable_slots').delete().eq('school_id', schoolId).eq('is_locked', false);
      const rows = (action.payload || []).map(s => mapSlotToDb(s, schoolId));
      if (rows.length) await supabase.from('timetable_slots').upsert(rows);
      break;
    }
    case 'LOCK_SLOT':
      await supabase.from('timetable_slots').update({ is_locked: true }).eq('id', action.payload).eq('school_id', schoolId);
      break;
    case 'UNLOCK_SLOT':
      await supabase.from('timetable_slots').update({ is_locked: false }).eq('id', action.payload).eq('school_id', schoolId);
      break;
    case 'UNLOCK_ALL_SLOTS':
      await supabase.from('timetable_slots').update({ is_locked: false }).eq('school_id', schoolId);
      break;
    case 'SET_TEACHER_AVAILABILITY': {
      const { teacherId, availability } = action.payload;
      // Delete existing rows for this teacher, then re-insert
      await supabase.from('teacher_availability').delete().eq('teacher_id', teacherId).eq('school_id', schoolId);
      if (availability) {
        const rows = flattenAvailability({ [teacherId]: availability }, schoolId);
        if (rows.length) await supabase.from('teacher_availability').upsert(rows);
      }
      break;
    }
    case 'MARK_ABSENT':
      await supabase.from('absences').upsert(mapAbsenceToDb(action.payload, schoolId));
      break;
    case 'REMOVE_ABSENCE':
      await supabase.from('absences').delete().eq('id', action.payload).eq('school_id', schoolId);
      break;
    case 'ASSIGN_SUBSTITUTE':
      await supabase.from('substitutions').upsert(mapSubToDb(action.payload, schoolId));
      break;
    case 'REMOVE_SUBSTITUTE':
      await supabase.from('substitutions').delete().eq('id', action.payload).eq('school_id', schoolId);
      break;
    default:
      break; // Settings changes handled via debounced effect
  }
}

// ── INITIAL STATE ────────────────────────────────────────────
const DEFAULT_STATE = {
  school: DEFAULT_SCHOOL,
  settings: DEFAULT_SETTINGS,
  teachers: TEACHERS,
  classes: CLASSES,
  subjects: SUBJECTS,
  schedule: SCHEDULE,
  classAssignments: CLASS_ASSIGNMENTS,
  periodsConfig: {},
  classPeriodSettings: {},
  lockedSlots: [],
  absences: [],
  substitutions: [],
  notifications: [],
  teacherAvailability: {},
};

const buildInitial = () => {
  const saved = localStorage.getItem('edutime_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_STATE, ...parsed };
    } catch {}
  }
  return DEFAULT_STATE;
};

// ── REDUCER ─────────────────────────────────────────────────
function reducer(state, action) {
  let next;
  switch (action.type) {

    // Hydrate from Supabase — replaces all operational data, keeps school info
    case 'HYDRATE':
      next = { ...state, ...action.payload };
      break;

    // Settings
    case 'UPDATE_SETTINGS':
      next = { ...state, settings: { ...state.settings, ...action.payload } };
      break;
    case 'UPDATE_PERIOD':
      next = {
        ...state,
        settings: {
          ...state.settings,
          periodTimings: state.settings.periodTimings.map(p =>
            p.period === action.payload.period ? { ...p, ...action.payload } : p
          )
        }
      };
      break;
    case 'ADD_PERIOD':
      next = {
        ...state,
        settings: {
          ...state.settings,
          periodsPerDay: state.settings.periodsPerDay + 1,
          periodTimings: [
            ...state.settings.periodTimings,
            {
              period: state.settings.periodsPerDay + 1,
              start: '14:00',
              end: '14:45',
              label: `Period ${state.settings.periodsPerDay + 1}`,
              isBreak: false
            }
          ]
        }
      };
      break;
    case 'REMOVE_PERIOD':
      next = {
        ...state,
        settings: {
          ...state.settings,
          periodsPerDay: Math.max(1, state.settings.periodsPerDay - 1),
          periodTimings: state.settings.periodTimings.filter(p => p.period !== action.payload)
        }
      };
      break;
    case 'UPDATE_SCHOOL':
      next = { ...state, school: { ...state.school, ...action.payload } };
      break;

    // Master data – Teachers
    case 'ADD_TEACHER':
      next = { ...state, teachers: [...state.teachers, action.payload] };
      break;
    case 'UPDATE_TEACHER':
      next = { ...state, teachers: state.teachers.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t) };
      break;
    case 'DELETE_TEACHER':
      next = { ...state, teachers: state.teachers.filter(t => t.id !== action.payload) };
      break;

    // Master data – Classes
    case 'ADD_CLASS':
      next = { ...state, classes: [...state.classes, action.payload] };
      break;
    case 'UPDATE_CLASS':
      next = { ...state, classes: state.classes.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c) };
      break;
    case 'DELETE_CLASS':
      next = {
        ...state,
        classes: state.classes.filter(c => c.id !== action.payload),
        classAssignments: state.classAssignments.filter(a => a.classId !== action.payload),
        periodsConfig: Object.fromEntries(Object.entries(state.periodsConfig || {}).filter(([k]) => k !== action.payload)),
        classPeriodSettings: Object.fromEntries(Object.entries(state.classPeriodSettings || {}).filter(([k]) => k !== action.payload)),
      };
      break;
    // Class subject-teacher assignments
    case 'SET_CLASS_ASSIGNMENTS': {
      // action.payload = { classId, assignments: [{ subjectId, teacherId }] }
      const { classId, assignments } = action.payload;
      const kept = state.classAssignments.filter(a => a.classId !== classId);
      const newOnes = assignments
        .filter(a => a.teacherId) // skip unassigned
        .map((a, i) => ({ id: `ca_${classId}_${a.subjectId}_${i}`, classId, subjectId: a.subjectId, teacherId: a.teacherId }));
      next = { ...state, classAssignments: [...kept, ...newOnes] };
      break;
    }

    // Wizard periods-per-week config persistence
    case 'SET_PERIODS_CONFIG':
      // action.payload = { [classId]: [{ subjectId, periodsPerWeek }] } (full map)
      next = { ...state, periodsConfig: action.payload };
      break;

    // Per-class period schedule override
    case 'SET_CLASS_PERIOD_SETTINGS': {
      // action.payload = { classId, periodTimings }  (periodTimings=null means reset to default)
      const { classId: cid, periodTimings } = action.payload;
      const updated = { ...(state.classPeriodSettings || {}) };
      if (!periodTimings) {
        delete updated[cid];
      } else {
        updated[cid] = { periodTimings };
      }
      next = { ...state, classPeriodSettings: updated };
      break;
    }
    case 'ADD_SUBJECT':
      next = { ...state, subjects: [...state.subjects, action.payload] };
      break;
    case 'UPDATE_SUBJECT':
      next = { ...state, subjects: state.subjects.map(s => s.id === action.payload.id ? { ...s, ...action.payload } : s) };
      break;
    case 'DELETE_SUBJECT':
      next = { ...state, subjects: state.subjects.filter(s => s.id !== action.payload) };
      break;

    // Schedule
    case 'ASSIGN_SLOT':
      const { classId, day, period, teacherId, subjectId } = action.payload;
      const slotId = `sch_${classId}_${day}_${period}`;
      const existing = state.schedule.find(s => s.id === slotId);
      if (existing) {
        next = { ...state, schedule: state.schedule.map(s => s.id === slotId ? { ...s, teacherId, subjectId } : s) };
      } else {
        next = { ...state, schedule: [...state.schedule, { id: slotId, classId, day, period, teacherId, subjectId }] };
      }
      break;
    case 'CLEAR_SLOT':
      next = { ...state, schedule: state.schedule.filter(s => s.id !== action.payload) };
      break;
    case 'BULK_SET_SCHEDULE':
      // Merge: keep locked slots from existing schedule, replace unlocked ones
      next = {
        ...state,
        schedule: [
          ...state.schedule.filter(s => state.lockedSlots.includes(s.id)),
          ...action.payload.filter(s => !state.lockedSlots.includes(s.id)),
        ]
      };
      break;
    case 'LOCK_SLOT':
      next = { ...state, lockedSlots: state.lockedSlots.includes(action.payload) ? state.lockedSlots : [...state.lockedSlots, action.payload] };
      break;
    case 'UNLOCK_SLOT':
      next = { ...state, lockedSlots: state.lockedSlots.filter(id => id !== action.payload) };
      break;
    case 'UNLOCK_ALL_SLOTS':
      next = { ...state, lockedSlots: [] };
      break;

    // Teacher Availability
    case 'SET_TEACHER_AVAILABILITY': {
      // action.payload = { teacherId, availability: { [dayKey]: { [period]: boolean } } }
      // Pass availability=null to reset to fully available
      const { teacherId: tid, availability } = action.payload;
      const avMap = { ...(state.teacherAvailability || {}) };
      if (!availability) {
        delete avMap[tid];
      } else {
        avMap[tid] = availability;
      }
      next = { ...state, teacherAvailability: avMap };
      break;
    }

    // Absences
    case 'MARK_ABSENT':
      next = { ...state, absences: [...state.absences, action.payload] };
      break;
    case 'REMOVE_ABSENCE':
      next = { ...state, absences: state.absences.filter(a => a.id !== action.payload) };
      break;

    // Substitutions
    case 'ASSIGN_SUBSTITUTE': {
      const filtered = state.substitutions.filter(s =>
        !(s.date === action.payload.date && s.scheduleId === action.payload.scheduleId)
      );
      next = { ...state, substitutions: [...filtered, action.payload] };
      break;
    }
    case 'REMOVE_SUBSTITUTE':
      next = { ...state, substitutions: state.substitutions.filter(s => s.id !== action.payload) };
      break;

    default:
      return state;
  }
  // Persist to localStorage
  localStorage.setItem('edutime_state', JSON.stringify(next));
  return next;
}

// ── PROVIDER ─────────────────────────────────────────────────
export function AppProvider({ children }) {
  const { school: authSchool } = useAuth();
  const schoolId = authSchool?.id ?? null;

  const [state, dispatch] = useReducer(reducer, null, buildInitial);
  const [dbLoaded, setDbLoaded] = useState(false);
  const settingsSyncTimer = useRef(null);
  const prevSchoolId = useRef(null);

  // ── Load data from Supabase when school changes ──────────
  useEffect(() => {
    if (!schoolId || schoolId === prevSchoolId.current) return;
    prevSchoolId.current = schoolId;
    setDbLoaded(false);

    (async () => {
      try {
        let data = await loadSchoolData(schoolId);
        if (!data) {
          // Was seeded; load again
          data = await loadSchoolData(schoolId);
        }
        if (data) {
          dispatch({ type: 'HYDRATE', payload: data });
          // Refresh localStorage cache with DB data
          localStorage.setItem('edutime_state', JSON.stringify({ ...state, ...data }));
        }
      } catch (err) {
        console.error('[AppStore] Failed to load school data from Supabase:', err);
        // Falls back to localStorage/initialData already in state
      } finally {
        setDbLoaded(true);
      }
    })();
  }, [schoolId]);

  // ── Debounced sync of settings/config to Supabase ────────
  useEffect(() => {
    if (!schoolId || !dbLoaded) return;
    clearTimeout(settingsSyncTimer.current);
    settingsSyncTimer.current = setTimeout(() => {
      supabase.from('school_settings').upsert(
        mapSettingsToDb(schoolId, state.settings, state.periodsConfig, state.classPeriodSettings, state.lockedSlots)
      ).then(({ error }) => {
        if (error) console.error('[AppStore] Settings sync failed:', error.message);
      });
    }, 800);
    return () => clearTimeout(settingsSyncTimer.current);
  }, [schoolId, dbLoaded, state.settings, state.periodsConfig, state.classPeriodSettings, state.lockedSlots]);

  // ── Wrapped dispatch: local + Supabase ────────────────────
  const dbDispatch = useCallback((action) => {
    dispatch(action);
    if (schoolId && dbLoaded) {
      syncActionToSupabase(action, schoolId).catch(err =>
        console.error('[AppStore] Supabase sync failed for', action.type, err)
      );
    }
  }, [schoolId, dbLoaded]);

  return (
    <AppContext.Provider value={{ state, dispatch: dbDispatch, dbLoaded }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }
