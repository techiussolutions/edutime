// ─── SCHOOL CONFIG (default for new school) ─────────────────────────────
export const DEFAULT_SCHOOL = {
  id: 'school_1',
  name: 'Sunrise Public School',
  code: 'SPS2026',
  board: 'CBSE',
  logo: '🏫',
  academicYear: '2025-2026',
  address: 'Bangalore, Karnataka',
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
};

// ─── SUBJECTS ───────────────────────────────────────────────────────────
export const SUBJECTS = [
  { id: 'sub_math',  name: 'Mathematics',        code: 'MATH', gradeGroups: ['secondary', 'senior'] },
  { id: 'sub_sci',   name: 'Science',             code: 'SCI',  gradeGroups: ['middle', 'secondary'] },
  { id: 'sub_phy',   name: 'Physics',             code: 'PHY',  gradeGroups: ['senior'] },
  { id: 'sub_chem',  name: 'Chemistry',           code: 'CHM',  gradeGroups: ['senior'] },
  { id: 'sub_bio',   name: 'Biology',             code: 'BIO',  gradeGroups: ['senior'] },
  { id: 'sub_eng',   name: 'English',             code: 'ENG',  gradeGroups: ['primary', 'middle', 'secondary', 'senior'] },
  { id: 'sub_hin',   name: 'Hindi',               code: 'HIN',  gradeGroups: ['primary', 'middle', 'secondary'] },
  { id: 'sub_sst',   name: 'Social Studies',      code: 'SST',  gradeGroups: ['primary', 'middle', 'secondary'] },
  { id: 'sub_cs',    name: 'Computer Science',    code: 'CS',   gradeGroups: ['secondary', 'senior'] },
  { id: 'sub_pe',    name: 'Physical Education',  code: 'PE',   gradeGroups: ['primary', 'middle', 'secondary', 'senior'] },
  { id: 'sub_art',   name: 'Art & Craft',         code: 'ART',  gradeGroups: ['primary', 'middle'] },
  { id: 'sub_music', name: 'Music',               code: 'MUS',  gradeGroups: ['primary', 'middle'] },
];

// ─── TEACHERS (one subject each) ───────────────────────────────────────────
export const TEACHERS = [
  // Mathematics specialists
  { id: 'st1',  name: 'Amit Kumar',       department: 'Mathematics',    subjects: ['sub_math'],  maxPeriods: 30, phone: '9876541001', email: 'amit@sps.edu',    designation: 'PGT Mathematics',   joining: '2014-06-01' },
  { id: 'st2',  name: 'Vinod Mehta',      department: 'Mathematics',    subjects: ['sub_math'],  maxPeriods: 30, phone: '9876541002', email: 'vinod@sps.edu',   designation: 'TGT Mathematics',   joining: '2017-06-01' },
  // Science specialist
  { id: 'st3',  name: 'Rekha Sharma',     department: 'Science',        subjects: ['sub_sci'],   maxPeriods: 32, phone: '9876541003', email: 'rekha@sps.edu',   designation: 'TGT Science',       joining: '2016-07-01' },
  // English specialists
  { id: 'st4',  name: 'Kavita Rao',       department: 'English',        subjects: ['sub_eng'],   maxPeriods: 30, phone: '9876541004', email: 'kavita@sps.edu',  designation: 'PGT English',       joining: '2015-07-01' },
  { id: 'st5',  name: 'Meena Joshi',      department: 'English',        subjects: ['sub_eng'],   maxPeriods: 28, phone: '9876541005', email: 'meena@sps.edu',   designation: 'TGT English',       joining: '2019-07-01' },
  // Hindi specialist
  { id: 'st6',  name: 'Rakesh Tiwari',    department: 'Hindi',          subjects: ['sub_hin'],   maxPeriods: 30, phone: '9876541006', email: 'rakesh@sps.edu',  designation: 'TGT Hindi',         joining: '2018-06-01' },
  // Social Studies specialist
  { id: 'st7',  name: 'Sunita Pillai',    department: 'Social Science', subjects: ['sub_sst'],   maxPeriods: 30, phone: '9876541007', email: 'sunita@sps.edu',  designation: 'TGT Social Studies',joining: '2016-06-01' },
  // Computer Science specialist
  { id: 'st8',  name: 'Kiran Desai',      department: 'Computer Sci',   subjects: ['sub_cs'],    maxPeriods: 28, phone: '9876541008', email: 'kiran@sps.edu',   designation: 'TGT Computer Sci',  joining: '2020-06-01' },
  // Physical Education specialist
  { id: 'st9',  name: 'Ramesh Nair',      department: 'Sports',         subjects: ['sub_pe'],    maxPeriods: 35, phone: '9876541009', email: 'ramesh@sps.edu',  designation: 'PTI',               joining: '2013-06-01' },
  // Art & Craft specialist
  { id: 'st10', name: 'Leela Bose',       department: 'Arts',           subjects: ['sub_art'],   maxPeriods: 25, phone: '9876541010', email: 'leela@sps.edu',   designation: 'TGT Art',           joining: '2021-06-01' },
  // Music specialist
  { id: 'st11', name: 'Dinesh Kulkarni',  department: 'Arts',           subjects: ['sub_music'], maxPeriods: 25, phone: '9876541011', email: 'dinesh@sps.edu',  designation: 'TGT Music',         joining: '2022-06-01' },
  // Physics specialist (for senior classes)
  { id: 'st12', name: 'Arun Krishnan',    department: 'Physics',        subjects: ['sub_phy'],   maxPeriods: 30, phone: '9876541012', email: 'arun@sps.edu',    designation: 'PGT Physics',       joining: '2015-07-01' },
  // Chemistry specialist
  { id: 'st13', name: 'Seema Agrawal',    department: 'Chemistry',      subjects: ['sub_chem'],  maxPeriods: 28, phone: '9876541013', email: 'seema@sps.edu',   designation: 'PGT Chemistry',     joining: '2017-07-01' },
  // Biology specialist
  { id: 'st14', name: 'Pankaj Verma',     department: 'Biology',        subjects: ['sub_bio'],   maxPeriods: 28, phone: '9876541014', email: 'pankaj@sps.edu',  designation: 'PGT Biology',       joining: '2018-07-01' },
];

// ─── CLASSES ─────────────────────────────────────────────────────────────
export const CLASSES = [
  { id: 'c_10A', grade: '10', section: 'A', name: '10th A', gradeGroup: 'secondary', classTeacherId: 'st1' },
  { id: 'c_10B', grade: '10', section: 'B', name: '10th B', gradeGroup: 'secondary', classTeacherId: 'st2' },
  { id: 'c_9A',  grade: '9',  section: 'A', name: '9th A',  gradeGroup: 'secondary', classTeacherId: 'st1' },
  { id: 'c_9B',  grade: '9',  section: 'B', name: '9th B',  gradeGroup: 'secondary', classTeacherId: 'st2' },
  { id: 'c_8A',  grade: '8',  section: 'A', name: '8th A',  gradeGroup: 'middle',    classTeacherId: 'st4' },
  { id: 'c_8B',  grade: '8',  section: 'B', name: '8th B',  gradeGroup: 'middle',    classTeacherId: 'st5' },
];

// ─── CLASS ASSIGNMENTS ───────────────────────────────────────────────────
// Each subject is taught by ONE dedicated single-subject teacher per class.
// Math: Amit (10A, 10B) | Vinod (9A, 9B)
// English: Kavita (10A, 10B) | Meena (9A, 9B, 8A, 8B)
// Science: Rekha (all 6 classes — 24 periods, within her 32/wk cap)
// Hindi, SST: Rakesh / Sunita (all applicable classes)
// CS: Kiran (secondary only) | PE: Ramesh (all) | Art: Leela | Music: Dinesh
export const CLASS_ASSIGNMENTS = [
  // ── 10th A (secondary) ──────────────────────────────────────────────────
  { id: 'ca_10A_math',  classId: 'c_10A', subjectId: 'sub_math', teacherId: 'st1'  }, // Amit
  { id: 'ca_10A_sci',   classId: 'c_10A', subjectId: 'sub_sci',  teacherId: 'st3'  }, // Rekha
  { id: 'ca_10A_eng',   classId: 'c_10A', subjectId: 'sub_eng',  teacherId: 'st4'  }, // Kavita
  { id: 'ca_10A_hin',   classId: 'c_10A', subjectId: 'sub_hin',  teacherId: 'st6'  }, // Rakesh
  { id: 'ca_10A_sst',   classId: 'c_10A', subjectId: 'sub_sst',  teacherId: 'st7'  }, // Sunita
  { id: 'ca_10A_cs',    classId: 'c_10A', subjectId: 'sub_cs',   teacherId: 'st8'  }, // Kiran
  { id: 'ca_10A_pe',    classId: 'c_10A', subjectId: 'sub_pe',   teacherId: 'st9'  }, // Ramesh

  // ── 10th B (secondary) ──────────────────────────────────────────────────
  { id: 'ca_10B_math',  classId: 'c_10B', subjectId: 'sub_math', teacherId: 'st1'  }, // Amit
  { id: 'ca_10B_sci',   classId: 'c_10B', subjectId: 'sub_sci',  teacherId: 'st3'  }, // Rekha
  { id: 'ca_10B_eng',   classId: 'c_10B', subjectId: 'sub_eng',  teacherId: 'st4'  }, // Kavita
  { id: 'ca_10B_hin',   classId: 'c_10B', subjectId: 'sub_hin',  teacherId: 'st6'  }, // Rakesh
  { id: 'ca_10B_sst',   classId: 'c_10B', subjectId: 'sub_sst',  teacherId: 'st7'  }, // Sunita
  { id: 'ca_10B_cs',    classId: 'c_10B', subjectId: 'sub_cs',   teacherId: 'st8'  }, // Kiran
  { id: 'ca_10B_pe',    classId: 'c_10B', subjectId: 'sub_pe',   teacherId: 'st9'  }, // Ramesh

  // ── 9th A (secondary) ───────────────────────────────────────────────────
  { id: 'ca_9A_math',  classId: 'c_9A', subjectId: 'sub_math', teacherId: 'st2'  }, // Vinod
  { id: 'ca_9A_sci',   classId: 'c_9A', subjectId: 'sub_sci',  teacherId: 'st3'  }, // Rekha
  { id: 'ca_9A_eng',   classId: 'c_9A', subjectId: 'sub_eng',  teacherId: 'st5'  }, // Meena
  { id: 'ca_9A_hin',   classId: 'c_9A', subjectId: 'sub_hin',  teacherId: 'st6'  }, // Rakesh
  { id: 'ca_9A_sst',   classId: 'c_9A', subjectId: 'sub_sst',  teacherId: 'st7'  }, // Sunita
  { id: 'ca_9A_cs',    classId: 'c_9A', subjectId: 'sub_cs',   teacherId: 'st8'  }, // Kiran
  { id: 'ca_9A_pe',    classId: 'c_9A', subjectId: 'sub_pe',   teacherId: 'st9'  }, // Ramesh

  // ── 9th B (secondary) ───────────────────────────────────────────────────
  { id: 'ca_9B_math',  classId: 'c_9B', subjectId: 'sub_math', teacherId: 'st2'  }, // Vinod
  { id: 'ca_9B_sci',   classId: 'c_9B', subjectId: 'sub_sci',  teacherId: 'st3'  }, // Rekha
  { id: 'ca_9B_eng',   classId: 'c_9B', subjectId: 'sub_eng',  teacherId: 'st5'  }, // Meena
  { id: 'ca_9B_hin',   classId: 'c_9B', subjectId: 'sub_hin',  teacherId: 'st6'  }, // Rakesh
  { id: 'ca_9B_sst',   classId: 'c_9B', subjectId: 'sub_sst',  teacherId: 'st7'  }, // Sunita
  { id: 'ca_9B_cs',    classId: 'c_9B', subjectId: 'sub_cs',   teacherId: 'st8'  }, // Kiran
  { id: 'ca_9B_pe',    classId: 'c_9B', subjectId: 'sub_pe',   teacherId: 'st9'  }, // Ramesh

  // ── 8th A (middle) ──────────────────────────────────────────────────────
  { id: 'ca_8A_sci',   classId: 'c_8A', subjectId: 'sub_sci',  teacherId: 'st3'  }, // Rekha
  { id: 'ca_8A_eng',   classId: 'c_8A', subjectId: 'sub_eng',  teacherId: 'st5'  }, // Meena
  { id: 'ca_8A_hin',   classId: 'c_8A', subjectId: 'sub_hin',  teacherId: 'st6'  }, // Rakesh
  { id: 'ca_8A_sst',   classId: 'c_8A', subjectId: 'sub_sst',  teacherId: 'st7'  }, // Sunita
  { id: 'ca_8A_pe',    classId: 'c_8A', subjectId: 'sub_pe',   teacherId: 'st9'  }, // Ramesh
  { id: 'ca_8A_art',   classId: 'c_8A', subjectId: 'sub_art',  teacherId: 'st10' }, // Leela
  { id: 'ca_8A_music', classId: 'c_8A', subjectId: 'sub_music',teacherId: 'st11' }, // Dinesh

  // ── 8th B (middle) ──────────────────────────────────────────────────────
  { id: 'ca_8B_sci',   classId: 'c_8B', subjectId: 'sub_sci',  teacherId: 'st3'  }, // Rekha
  { id: 'ca_8B_eng',   classId: 'c_8B', subjectId: 'sub_eng',  teacherId: 'st5'  }, // Meena
  { id: 'ca_8B_hin',   classId: 'c_8B', subjectId: 'sub_hin',  teacherId: 'st6'  }, // Rakesh
  { id: 'ca_8B_sst',   classId: 'c_8B', subjectId: 'sub_sst',  teacherId: 'st7'  }, // Sunita
  { id: 'ca_8B_pe',    classId: 'c_8B', subjectId: 'sub_pe',   teacherId: 'st9'  }, // Ramesh
  { id: 'ca_8B_art',   classId: 'c_8B', subjectId: 'sub_art',  teacherId: 'st10' }, // Leela
  { id: 'ca_8B_music', classId: 'c_8B', subjectId: 'sub_music',teacherId: 'st11' }, // Dinesh
];

// ─── SCHEDULE ────────────────────────────────────────────────────────────
// Empty — use the Auto-Generate Wizard to build a fresh timetable.
export const SCHEDULE = [];


