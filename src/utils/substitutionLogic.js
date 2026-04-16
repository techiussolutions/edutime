// Map DAY INDEX → DAY KEY (matches the workingDays keys in settings)
const DAY_IDX_TO_KEY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const suggestSubstitutes = (state, day, period, absentTeacherId, classId) => {
  const { teachers, schedule, substitutions, teacherAvailability = {} } = state;
  const absentTeacher = teachers.find(t => t.id === absentTeacherId);
  if (!absentTeacher) return [];

  // Find teachers who are already busy in the normal schedule for this day and period
  const busyTeacherIdsSet = new Set(
    schedule
      .filter(s => s.day === day && s.period === period)
      .map(s => s.teacherId)
  );

  // Exclude the absent teacher from the busy list because they are absent!
  busyTeacherIdsSet.delete(absentTeacherId);

  // Add teachers who are already assigned as substitutes for this day and period
  substitutions.filter(s => s.day === day && s.period === period).forEach(s => {
    busyTeacherIdsSet.add(s.substituteTeacherId);
  });

  // Calculate workload per teacher (how many classes do they teach today normally + substitutions today)
  // Just a simple heuristic.
  const getDailyLoad = (tId) => {
    const normalClasses = schedule.filter(s => s.day === day && s.teacherId === tId).length;
    const subsClasses = substitutions.filter(s => s.date === Date.now().toString().split('T')[0] && s.substituteTeacherId === tId).length; // Rough mock using today
    return normalClasses + subsClasses;
  };

  // Convert numeric day index to day key (e.g. 0 → 'Mon') for availability lookup
  const dayKey = DAY_IDX_TO_KEY[day];

  // Find free teachers — also skip any teacher who is marked unavailable for this day+period
  let freeTeachers = teachers.filter(t => {
    if (busyTeacherIdsSet.has(t.id) || t.id === absentTeacherId) return false;
    // Respect teacher availability (explicit false = not available)
    if (teacherAvailability?.[t.id]?.[dayKey]?.[period] === false) return false;
    return true;
  });

  // Score them
  const scoredTeachers = freeTeachers.map(t => {
    let score = 0;
    
    // Priority 1: Same Department
    if (t.department === absentTeacher.department) {
      score += 10;
    }

    // Priority 2: Workload (Less busy teachers preferred)
    const load = getDailyLoad(t.id);
    score -= load;

    return { teacher: t, score, load };
  });

  // Sort by highest score first
  scoredTeachers.sort((a, b) => b.score - a.score);

  return scoredTeachers;
};
