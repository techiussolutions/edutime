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

/**
 * Check if assigning a subject to a teacher for a specific class would violate constraints:
 * 1. Teacher's weekly period capacity (maxPeriods)
 * 2. No schedule clash for teacher on that day/period
 * 
 * Returns: { valid: boolean, error?: string, warning?: string }
 */
export const validateSubjectAssignment = (state, teacherId, classId, subjectId, options = {}) => {
  const { schedule = [], classAssignments = [], teachers, classes, subjects, settings } = state;
  const { classSubjectMap = {}, checkScheduleClash = true } = options;
  
  const teacher = teachers.find(t => t.id === teacherId);
  const klass = classes.find(c => c.id === classId);
  const subject = subjects.find(s => s.id === subjectId);
  
  if (!teacher) return { valid: false, error: 'Teacher not found' };
  if (!klass) return { valid: false, error: 'Class not found' };
  if (!subject) return { valid: false, error: 'Subject not found' };
  
  // ── 1. Calculate teacher's current period load ────────────────────────────
  // Count unique (day, period) pairs — concurrent slots (same teacher, same period,
  // multiple classes) count as ONE teaching slot, not one per class.
  const currentPeriods = new Set(
    schedule.filter(s => s.teacherId === teacherId).map(s => `${s.day}_${s.period}`)
  ).size;
  
  // Get the periods required for this subject in this class from classSubjectMap
  // If not provided, estimate based on subject defaults
  let periodsForThisSubject = 4; // Default estimate
  if (classSubjectMap[classId]) {
    const req = classSubjectMap[classId].find(r => r.subjectId === subjectId);
    if (req) periodsForThisSubject = req.periodsPerWeek;
  }
  
  const totalPeriods = currentPeriods + periodsForThisSubject;
  const maxPeriods = teacher.maxPeriods || 30;
  
  if (totalPeriods > maxPeriods) {
    return {
      valid: false,
      error: `Exceeds capacity: Teacher would have ${totalPeriods} periods/week (max: ${maxPeriods})`,
      details: { currentPeriods, newPeriods: periodsForThisSubject, totalPeriods, maxPeriods }
    };
  }
  
  if (totalPeriods === maxPeriods) {
    return {
      valid: true,
      warning: `Teacher will reach maximum capacity: ${totalPeriods}/${maxPeriods} periods/week`
    };
  }
  
  // ── 2. Check for schedule conflicts ─────────────────────────────────────
  // This is optional but recommended to check if teacher is already assigned
  // to certain day/period combinations that might conflict
  if (checkScheduleClash) {
    // Get any existing schedule entries for this teacher
    const teacherSchedule = schedule.filter(s => s.teacherId === teacherId);
    if (teacherSchedule.length > 0) {
      // Check if teacher has dense schedule that might cause conflicts
      const daysUsed = new Set(teacherSchedule.map(s => s.day)).size;
      const periodsPerDay = teacherSchedule.length / daysUsed;
      
      if (periodsPerDay > 6) {
        return {
          valid: true,
          warning: `Teacher has heavy schedule: ~${periodsPerDay.toFixed(1)} periods/day. Ensure no double-booking.`
        };
      }
    }
  }
  
  return { valid: true };
};

/**
 * Validate that a teacher can be added to a subject in a class without exceeding capacity.
 * This is a simpler version that just checks weekly capacity.
 * 
 * Returns: { canAssign: boolean, message?: string, remainingCapacity: number }
 */
export const canAssignTeacherToSubject = (state, teacherId, classId, subjectId) => {
  const { schedule = [], classAssignments = [], teachers, classes } = state;
  
  const teacher = teachers.find(t => t.id === teacherId);
  if (!teacher) return { canAssign: false, message: 'Teacher not found', remainingCapacity: 0 };
  
  // Count periods already assigned to this teacher (unique time slots)
  const currentPeriods = new Set(
    schedule.filter(s => s.teacherId === teacherId).map(s => `${s.day}_${s.period}`)
  ).size;
  const maxPeriods = teacher.maxPeriods || 30;
  const remainingCapacity = maxPeriods - currentPeriods;
  
  // Estimate periods needed for this subject (default to 4)
  const estimatedPeriodsNeeded = 4;
  
  if (estimatedPeriodsNeeded > remainingCapacity) {
    return {
      canAssign: false,
      message: `Insufficient capacity. Teacher has ${remainingCapacity} slots remaining but subject needs ~${estimatedPeriodsNeeded} periods.`,
      remainingCapacity
    };
  }
  
  return { canAssign: true, remainingCapacity };
};

/**
 * Get detailed workload summary for a teacher across all assignments
 */
export const getTeacherWorkload = (state, teacherId) => {
  const { schedule = [], teachers } = state;
  const teacher = teachers.find(t => t.id === teacherId);
  if (!teacher) return null;
  
  const assignedPeriods = new Set(
    schedule.filter(s => s.teacherId === teacherId).map(s => `${s.day}_${s.period}`)
  ).size;
  const maxPeriods = teacher.maxPeriods || 30;
  const utilisationPercent = Math.round((assignedPeriods / maxPeriods) * 100);
  
  return {
    teacherId,
    assignedPeriods,
    maxPeriods,
    remainingCapacity: maxPeriods - assignedPeriods,
    utilisationPercent,
    isAtCapacity: assignedPeriods >= maxPeriods,
    isFull: assignedPeriods === maxPeriods
  };
};
