export const subjects = [
  { id: 'sub_1', name: 'Mathematics', code: 'MATH' },
  { id: 'sub_2', name: 'Science', code: 'SCI' },
  { id: 'sub_3', name: 'English', code: 'ENG' },
  { id: 'sub_4', name: 'Social Studies', code: 'SST' },
  { id: 'sub_5', name: 'Hindi', code: 'HIN' },
  { id: 'sub_6', name: 'Physical Education', code: 'PE' },
  { id: 'sub_7', name: 'Computer Science', code: 'CS' },
];

export const teachers = [
  { id: 't_1', name: 'Sharma Sir', subjects: ['sub_1', 'sub_2'], maxPeriodsPerWeek: 30, department: 'Science' },
  { id: 't_2', name: 'Verma Madam', subjects: ['sub_3', 'sub_4'], maxPeriodsPerWeek: 30, department: 'Arts' },
  { id: 't_3', name: 'Gupta Sir', subjects: ['sub_1', 'sub_7'], maxPeriodsPerWeek: 25, department: 'Science' },
  { id: 't_4', name: 'Singh Madam', subjects: ['sub_2', 'sub_5'], maxPeriodsPerWeek: 25, department: 'Language' },
  { id: 't_5', name: 'Rao Sir', subjects: ['sub_6'], maxPeriodsPerWeek: 35, department: 'Sports' },
  { id: 't_6', name: 'Patil Madam', subjects: ['sub_4', 'sub_5'], maxPeriodsPerWeek: 25, department: 'Language' },
];

export const classes = [
  { id: 'c_10A', name: '10th A', section: 'A', grade: '10' },
  { id: 'c_10B', name: '10th B', section: 'B', grade: '10' },
  { id: 'c_9A', name: '9th A', section: 'A', grade: '9' },
  { id: 'c_9B', name: '9th B', section: 'B', grade: '9' },
];

export const schoolConfig = {
  periodsPerDay: 8,
  daysPerWeek: 5, // Monday to Friday
};

// Initial state for absences and substitutions
export const initialAbsences = [];
export const initialSubstitutions = [];

// Helper to generate a dummy schedule
export const generateDummySchedule = () => {
  const schedule = [];
  classes.forEach(cls => {
    for (let day = 0; day < schoolConfig.daysPerWeek; day++) {
      for (let period = 1; period <= schoolConfig.periodsPerDay; period++) {
        // Just assign random teachers for the mock
        const teacher = teachers[Math.floor(Math.random() * teachers.length)];
        const subjectId = teacher.subjects[Math.floor(Math.random() * teacher.subjects.length)];
        
        schedule.push({
          id: `sch_${cls.id}_${day}_${period}`,
          classId: cls.id,
          day, // 0 = Mon, 4 = Fri
          period, 
          teacherId: teacher.id,
          subjectId: subjectId
        });
      }
    }
  });
  return schedule;
};

export const initialSchedule = generateDummySchedule();
