/* Substitution recommendation engine */

/**
 * Returns ranked list of available substitute teachers for a given
 * day + period slot, sorted by score (higher = better match).
 */
export function getSuggestedSubstitutes(state, day, period, absentTeacherId) {
  const { teachers, schedule, substitutions, settings } = state;
  const absentTeacher = teachers.find(t => t.id === absentTeacherId);
  if (!absentTeacher) return [];

  const today = new Date().toISOString().split('T')[0];

  // Who is already scheduled in the normal timetable for this day+period?
  const busySet = new Set(
    schedule.filter(s => s.day === day && s.period === period).map(s => s.teacherId)
  );
  // Remove absent teacher from busy set (they ARE absent)
  busySet.delete(absentTeacherId);

  // Who is already assigned as substitute today for this period?
  substitutions
    .filter(s => s.date === today && s.day === day && s.period === period)
    .forEach(s => busySet.add(s.substituteTeacherId));

  // Who else is absent today?
  const absentToday = new Set(
    state.absences.filter(a => a.date === today).map(a => a.teacherId)
  );
  absentToday.add(absentTeacherId);

  // Calculate how many subs each teacher has done this week
  const weekStart = getWeekStart(today);
  const subCount = {};
  substitutions
    .filter(s => s.date >= weekStart && s.date <= today)
    .forEach(s => {
      subCount[s.substituteTeacherId] = (subCount[s.substituteTeacherId] || 0) + 1;
    });

  const { teacherAvailability = {} } = state;
  const dayKey = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()];

  // Free teachers — must be NOT busy, NOT absent, and AVAILABLE in settings
  const freeTeachers = teachers.filter(t => {
    if (busySet.has(t.id)) return false;
    if (absentToday.has(t.id)) return false;
    // Respect teacher availability (explicit false = not available)
    if (teacherAvailability?.[t.id]?.[dayKey]?.[period] === false) return false;
    return true;
  });

  // Score each free teacher per substitution priority rules
  const priority = settings.substitutionPriority || ['same_dept', 'same_subject', 'any_free'];

  const scored = freeTeachers.map(t => {
    let score = 0;
    const reasons = [];

    if (priority.includes('same_dept') && t.department === absentTeacher.department) {
      score += 30; reasons.push('Same dept');
    }
    
    // Find what subject was being taught in this slot
    const slot = state.schedule.find(s => s.day === day && s.period === period &&
      state.classes.some(c => state.schedule.find(sc => sc.id === s.id && sc.classId === c.id)));
    
    if (priority.includes('same_subject') && slot && t.subjects.includes(slot.subjectId)) {
      score += 20; reasons.push('Qualified subject');
    }

    // Workload balance: subtract for high substitution count this week
    const wLoad = subCount[t.id] || 0;
    score -= wLoad * 5;
    if (wLoad > 0) reasons.push(`${wLoad} subs this week`);

    return { teacher: t, score, reasons };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Check if assigning `teacherId` to (day, period) creates a conflict.
 * Returns false if safe, or the conflicting schedule entry if not.
 */
export function checkConflict(state, teacherId, day, period, excludeId = null) {
  const { schedule, teacherAvailability = {} } = state;
  const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayKey = dayKeys[day];

  // 1. Check if teacher is marked unavailable in settings
  if (teacherAvailability?.[teacherId]?.[dayKey]?.[period] === false) {
    return { type: 'availability', message: 'Teacher is marked as unavailable in settings for this slot' };
  }

  // 2. Check if teacher is busy elsewhere
  const busy = schedule.find(s =>
    s.teacherId === teacherId &&
    s.day === day &&
    s.period === period &&
    s.id !== excludeId
  );

  return busy || null;
}

/**
 * Scan entire schedule and return all conflicts.
 */
export function detectAllConflicts(schedule) {
  const map = {};
  const conflicts = [];
  schedule.forEach(entry => {
    const key = `${entry.day}_${entry.period}_${entry.teacherId}`;
    if (map[key]) {
      conflicts.push({ a: map[key], b: entry });
    } else {
      map[key] = entry;
    }
  });
  return conflicts;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}
