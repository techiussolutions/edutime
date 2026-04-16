// ─── SCHOOL CONFIG (default for new school) ─────────────────────────────
export const DEFAULT_SCHOOL = {
  id: '',
  name: '',
  code: '',
  board: 'CBSE',
  logo: '🏫',
  academicYear: '2025-2026',
  address: '',
};

export const DEFAULT_SETTINGS = {
  workingDays: { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: false },
  periodsPerDay: 8,
  periodTimings: [
    { period: 1, start: '08:00', end: '08:45', label: 'Period 1' },
    { period: 2, start: '08:45', end: '09:30', label: 'Period 2' },
    { period: 3, start: '09:30', end: '09:45', label: 'Break',   isBreak: true  },
    { period: 4, start: '09:45', end: '10:30', label: 'Period 3' },
    { period: 5, start: '10:30', end: '11:15', label: 'Period 4' },
    { period: 6, start: '11:15', end: '12:00', label: 'Period 5' },
    { period: 7, start: '12:00', end: '12:30', label: 'Lunch',   isBreak: true  },
    { period: 8, start: '12:30', end: '13:15', label: 'Period 6' },
  ],
  breakPeriods: [3, 7],  // 1-indexed period numbers that are breaks
  maxDefaultPeriods: 30, // teacher max periods/week default
  substitutionPriority: ['same_dept', 'same_subject', 'any_free'],
  assemblyDay: 'Mon',
  assemblyPeriod: 1,
  setupSkipped: false,
};


