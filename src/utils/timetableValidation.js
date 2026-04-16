export const validateTimetableSchedule = (state, schedule) => {
  const { teacherAvailability = {} } = state;
  const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const conflicts = [];
  
  // A conflict occurs if:
  // 1. Same teacher is assigned to two different classes at the same time
  // 2. Teacher is assigned to a slot where they are unavailable
  
  const map = new Map();
  
  schedule.forEach(entry => {
    // 1. Check for double-booking
    const key = `${entry.day}-${entry.period}-${entry.teacherId}`;
    if (map.has(key)) {
      const existing = map.get(key);
      conflicts.push({
        type: 'collision',
        teacherId: entry.teacherId,
        day: entry.day,
        period: entry.period,
        class1: existing.classId,
        class2: entry.classId
      });
    } else {
      map.set(key, entry);
    }

    // 2. Check for availability override
    const dayKey = dayKeys[entry.day];
    if (teacherAvailability?.[entry.teacherId]?.[dayKey]?.[entry.period] === false) {
      conflicts.push({
        type: 'availability',
        teacherId: entry.teacherId,
        day: entry.day,
        period: entry.period,
        message: 'Teacher marked as unavailable in settings'
      });
    }
  });

  return conflicts;
};

// Check if a specific assignment is valid before making it
export const isValidAssignment = (state, schedule, teacherId, day, period) => {
  const { teacherAvailability = {} } = state;
  const dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayKey = dayKeys[day];

  // Check availability
  if (teacherAvailability?.[teacherId]?.[dayKey]?.[period] === false) return false;
  
  // Check busy status
  return !schedule.some(s => s.teacherId === teacherId && s.day === day && s.period === period);
};
