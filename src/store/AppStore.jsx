import React, { createContext, useContext, useReducer, useEffect } from 'react';
import {
  DEFAULT_SCHOOL, DEFAULT_SETTINGS, SUBJECTS, TEACHERS, CLASSES, SCHEDULE, CLASS_ASSIGNMENTS
} from './initialData';

const AppContext = createContext();

// ── INITIAL STATE ────────────────────────────────────────────
const DEFAULT_STATE = {
  school: DEFAULT_SCHOOL,
  settings: DEFAULT_SETTINGS,
  teachers: TEACHERS,
  classes: CLASSES,
  subjects: SUBJECTS,
  schedule: SCHEDULE,
  classAssignments: CLASS_ASSIGNMENTS,
  periodsConfig: {},          // { [classId]: [{ subjectId, periodsPerWeek }] } — wizard persistence
  classPeriodSettings: {},    // { [classId]: { periodTimings: [...] } }  — null/absent = use school default
  lockedSlots: [],     // array of slot IDs (e.g. "sch_c_10A_0_1") that cannot be overwritten by generator
  absences: [],        // { id, teacherId, date, leaveType, reason }
  substitutions: [],   // { id, date, day, period, scheduleId, absentTeacherId, substituteTeacherId, assignedBy, timestamp }
  notifications: [],
  teacherAvailability: {}, // { [teacherId]: { [dayKey]: { [period]: boolean } } } — false = not available
};

const buildInitial = () => {
  const saved = localStorage.getItem('edutime_state');
  if (saved) {
    try {
      // Merge saved state with defaults so any new fields added after initial save are always present
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
  const [state, dispatch] = useReducer(reducer, null, buildInitial);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }
