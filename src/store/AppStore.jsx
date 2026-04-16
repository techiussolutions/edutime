import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadSchoolData as apiLoadSchoolData, syncAction } from '../lib/api';
import { DEFAULT_SCHOOL, DEFAULT_SETTINGS } from './initialData';

const AppContext = createContext();

// ── DB SHAPE MAPPERS (from DB row → app shape) ──────────────
const mapTeacherFromDb = (r)  => ({ id: r.id, name: r.name, department: r.department, subjects: r.subjects, maxPeriods: r.max_periods, phone: r.phone, email: r.email, designation: r.designation, joining: r.joining, active: r.active });
const mapClassFromDb  = (r)   => ({ id: r.id, name: r.name, grade: r.grade, section: r.section, gradeGroup: r.grade_group, classTeacherId: r.class_teacher_id });
const mapSubjectFromDb = (r)  => ({ id: r.id, name: r.name, code: r.code, gradeGroups: r.grade_groups });
const mapAssignFromDb = (r)   => ({ id: r.id, classId: r.class_id, subjectId: r.subject_id, teacherId: r.teacher_id });
const mapSlotFromDb   = (r)   => ({ id: r.id, classId: r.class_id, day: r.day, period: r.period, teacherId: r.teacher_id, subjectId: r.subject_id });
const mapAbsenceFromDb = (r)  => ({ id: r.id, teacherId: r.teacher_id, date: r.date, leaveType: r.leave_type, reason: r.reason });
const mapSubFromDb    = (r)   => ({ id: r.id, date: r.date, day: r.day, period: r.period, scheduleId: r.schedule_id, absentTeacherId: r.absent_teacher_id, substituteTeacherId: r.substitute_teacher_id, assignedBy: r.assigned_by });

const mapSettingsFromDb = (r) => ({
  settings: { workingDays: r.working_days, periodsPerDay: r.periods_per_day, periodTimings: r.period_timings, breakPeriods: r.break_periods, maxDefaultPeriods: r.max_default_periods, substitutionPriority: r.substitution_priority, assemblyDay: r.assembly_day, assemblyPeriod: r.assembly_period },
  periodsConfig: r.periods_config || {},
  classPeriodSettings: r.class_period_settings || {},
  lockedSlots: r.locked_slots || [],
});

const mapSettingsToDb = (settings, periodsConfig, classPeriodSettings, lockedSlots) => ({
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
});

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

// ── LOAD ALL DATA VIA API ────────────────────────────────────
async function loadData(schoolId) {
  const data = await apiLoadSchoolData(schoolId);

  if (data.isEmpty) {
    // Seed only default settings for new school (no demo data)
    await syncAction('SEED', schoolId, {
      settings: mapSettingsToDb(DEFAULT_SETTINGS, {}, {}, []),
      teachers: [],
      classes: [],
      subjects: [],
      assignments: [],
    });
    return null; // caller will re-load
  }

  const settingsData = data.settings ? mapSettingsFromDb(data.settings) : {};

  return {
    settings: settingsData.settings || DEFAULT_SETTINGS,
    periodsConfig: settingsData.periodsConfig || {},
    classPeriodSettings: settingsData.classPeriodSettings || {},
    lockedSlots: settingsData.lockedSlots || [],
    teachers: (data.teachers || []).map(mapTeacherFromDb),
    classes: (data.classes || []).map(mapClassFromDb),
    subjects: (data.subjects || []).map(mapSubjectFromDb),
    classAssignments: (data.assignments || []).map(mapAssignFromDb),
    schedule: (data.slots || []).map(mapSlotFromDb),
    teacherAvailability: buildAvailabilityMap(data.availability || []),
    absences: (data.absences || []).map(mapAbsenceFromDb),
    substitutions: (data.substitutions || []).map(mapSubFromDb),
  };
}

// ── SYNC ONE ACTION TO NEON VIA API ──────────────────────────
async function syncActionToNeon(action, schoolId) {
  // Settings are handled via debounced effect, not per-action
  if (['UPDATE_SETTINGS', 'UPDATE_PERIOD', 'ADD_PERIOD', 'REMOVE_PERIOD',
       'SET_PERIODS_CONFIG', 'SET_CLASS_PERIOD_SETTINGS', 'UPDATE_SCHOOL'].includes(action.type)) {
    return;
  }
  await syncAction(action.type, schoolId, action.payload);
}

// ── INITIAL STATE ────────────────────────────────────────────
const DEFAULT_STATE = {
  school: DEFAULT_SCHOOL,
  settings: DEFAULT_SETTINGS,
  teachers: [],
  classes: [],
  subjects: [],
  schedule: [],
  classAssignments: [],
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

    // Hydrate from Neon — replaces all operational data, keeps school info
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
    case 'ADD_PERIOD': {
      const timings = [...state.settings.periodTimings];
      const insertIdx = action.payload?.afterIndex ?? timings.length; // default: append
      const refPeriod = timings[insertIdx - 1]; // period before insertion point
      const newStart = refPeriod ? refPeriod.end : '14:00';
      const [hh, mm] = newStart.split(':').map(Number);
      const endTotal = hh * 60 + mm + 45;
      const newEnd = `${String(Math.floor(endTotal / 60) % 24).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
      const newEntry = {
        period: 0, // placeholder, renumbered below
        start: newStart,
        end: newEnd,
        label: 'New Period',
        isBreak: false,
      };
      timings.splice(insertIdx, 0, newEntry);
      // Renumber all periods sequentially
      const renumbered = timings.map((t, i) => ({ ...t, period: i + 1 }));
      next = {
        ...state,
        settings: {
          ...state.settings,
          periodsPerDay: renumbered.length,
          periodTimings: renumbered,
        }
      };
      break;
    }
    case 'REMOVE_PERIOD': {
      const filtered = state.settings.periodTimings.filter(p => p.period !== action.payload);
      const renumbered = filtered.map((t, i) => ({ ...t, period: i + 1 }));
      next = {
        ...state,
        settings: {
          ...state.settings,
          periodsPerDay: Math.max(1, renumbered.length),
          periodTimings: renumbered,
        }
      };
      break;
    }
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

  // ── Load data from Neon via API when school changes ──────
  useEffect(() => {
    if (!schoolId || schoolId === prevSchoolId.current) return;
    prevSchoolId.current = schoolId;
    setDbLoaded(false);

    (async () => {
      try {
        let data = await loadData(schoolId);
        if (!data) {
          // Was seeded; load again
          data = await loadData(schoolId);
        }
        if (data) {
          dispatch({ type: 'HYDRATE', payload: data });
          localStorage.setItem('edutime_state', JSON.stringify({ ...state, ...data }));
        }
      } catch (err) {
        console.error('[AppStore] Failed to load school data:', err);
      } finally {
        setDbLoaded(true);
      }
    })();
  }, [schoolId]);

  // ── Debounced sync of settings/config to Neon ────────────
  useEffect(() => {
    if (!schoolId || !dbLoaded) return;
    clearTimeout(settingsSyncTimer.current);
    settingsSyncTimer.current = setTimeout(() => {
      syncAction('SYNC_SETTINGS', schoolId,
        mapSettingsToDb(state.settings, state.periodsConfig, state.classPeriodSettings, state.lockedSlots)
      ).catch(err => {
        console.error('[AppStore] Settings sync failed:', err.message);
      });
    }, 800);
    return () => clearTimeout(settingsSyncTimer.current);
  }, [schoolId, dbLoaded, state.settings, state.periodsConfig, state.classPeriodSettings, state.lockedSlots]);

  // ── Wrapped dispatch: local + Neon API ────────────────────
  const dbDispatch = useCallback((action) => {
    dispatch(action);
    if (schoolId && dbLoaded) {
      syncActionToNeon(action, schoolId).catch(err =>
        console.error('[AppStore] Neon sync failed for', action.type, err)
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
