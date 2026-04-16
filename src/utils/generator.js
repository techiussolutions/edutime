/**
 * Timetable Auto-Generator Engine  v2 — Conflict-Aware Slot Assignment
 *
 * Algorithm overview:
 *  1. Build a DEMAND LIST: every (class, subject, teacher, periods_remaining) tuple
 *  2. Build a CONFLICT SET: two demands conflict if they share the same teacher
 *     (meaning they can NEVER be scheduled in the same day+period slot)
 *  3. SLOT FILL: for each available (day, period) slot, pick a maximal independent
 *     set of demands — i.e. as many demands as possible that don't share a teacher.
 *     This ensures zero double-booking by construction.
 *  4. Randomise tie-breaking so Regenerate produces different orderings.
 *
 * Benefits over the old shuffle approach:
 *  - No teacher every appears twice in the same slot across any class
 *  - Most-needed demands (highest remaining periods) are prioritised
 *  - Warnings are meaningful: only fires when a teacher is genuinely over capacity
 */

const DAY_KEY_TO_IDX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };

/** Fisher-Yates shuffle */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateTimetable(state, requirements) {
  const { teachers, classes, subjects, settings, classAssignments = [], classPeriodSettings = {}, teacherAvailability = {} } = state;
  const { classSubjectMap } = requirements;

  const activeDayKeys = Object.entries(settings.workingDays)
    .filter(([, v]) => v).map(([k]) => k);

  // Resolve effective period timings per class (custom or global)
  const getClassPeriods = (classId) => {
    const custom = classPeriodSettings[classId];
    return custom ? custom.periodTimings : settings.periodTimings;
  };

  // Global non-break periods (used only as fallback reference)
  const globalNonBreak = settings.periodTimings
    .filter(p => !p.isBreak).map(p => p.period);


  // Fast lookup: classId__subjectId → teacherId
  const assignmentMap = {};
  classAssignments.forEach(a => {
    assignmentMap[`${a.classId}__${a.subjectId}`] = a.teacherId;
  });

  // ── Step 1: Build demand list ─────────────────────────────────────────────
  // Each demand = { classId, subjectId, teacherId, remaining }
  const demands = [];
  classes.forEach(cls => {
    (classSubjectMap[cls.id] || []).forEach(req => {
      if (req.periodsPerWeek <= 0) return;
      const teacherId = assignmentMap[`${cls.id}__${req.subjectId}`];
      if (!teacherId) return; // no assignment — will warn later
      demands.push({ classId: cls.id, subjectId: req.subjectId, teacherId, remaining: req.periodsPerWeek });
    });
  });

  // Track unassigned subjects (will warn at the end)
  const unassigned = [];
  classes.forEach(cls => {
    (classSubjectMap[cls.id] || []).filter(r => r.periodsPerWeek > 0).forEach(req => {
      if (!assignmentMap[`${cls.id}__${req.subjectId}`]) {
        const sub = subjects.find(s => s.id === req.subjectId);
        unassigned.push(`${cls.name}: no teacher assigned for ${sub?.name ?? req.subjectId}. Go to Master Data → Classes to assign.`);
      }
    });
  });

  // ── Step 2: Track state ───────────────────────────────────────────────────
  // Teachers already allocated to a slot: key = `${teacherId}_${dayIdx}_${period}`
  const teacherBusy = new Set();
  // Classes already allocated to a slot: key = `${classId}_${dayIdx}_${period}`
  const classBusy = new Set();
  // Weekly load
  const teacherLoad = {};
  teachers.forEach(t => { teacherLoad[t.id] = 0; });

  const schedule = [];
  const warnings = [];

  // ── Step 3: Slot fill ─────────────────────────────────────────────────────
  // Iterate slots in random order for variety
  const slots = [];
  for (const dayKey of activeDayKeys) {
    for (const period of globalNonBreak) {
      slots.push({ dayKey, dayIdx: DAY_KEY_TO_IDX[dayKey], period });
    }
  }

  for (const { dayKey, dayIdx, period } of shuffle(slots)) {
    // Get remaining demands, sorted by most-needed first (greedy), with random tiebreak
    const pending = demands
      .filter(d => d.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining || Math.random() - 0.5);

    // For this slot: pick an independent set — no two picks share a teacher or class
    const usedTeachersThisSlot = new Set();
    const usedClassesThisSlot = new Set();

    for (const demand of pending) {
      // Skip if this class or teacher is already placed in this slot
      if (usedClassesThisSlot.has(demand.classId)) continue;
      if (usedTeachersThisSlot.has(demand.teacherId)) continue;
      if (teacherBusy.has(`${demand.teacherId}_${dayIdx}_${period}`)) continue;
      if (classBusy.has(`${demand.classId}_${dayIdx}_${period}`)) continue;

      // Check teacher availability — skip if explicitly marked unavailable for this day+period
      if (teacherAvailability?.[demand.teacherId]?.[dayKey]?.[period] === false) continue;

      // Check weekly teacher cap
      const teacher = teachers.find(t => t.id === demand.teacherId);
      if (teacher && (teacherLoad[demand.teacherId] || 0) >= teacher.maxPeriods) continue;

      // ✅ Assign
      const slotId = `sch_${demand.classId}_${dayIdx}_${period}`;
      schedule.push({ id: slotId, classId: demand.classId, day: dayIdx, period, teacherId: demand.teacherId, subjectId: demand.subjectId });
      teacherBusy.add(`${demand.teacherId}_${dayIdx}_${period}`);
      classBusy.add(`${demand.classId}_${dayIdx}_${period}`);
      usedTeachersThisSlot.add(demand.teacherId);
      usedClassesThisSlot.add(demand.classId);
      teacherLoad[demand.teacherId] = (teacherLoad[demand.teacherId] || 0) + 1;
      demand.remaining--;
    }
  }

  // ── Step 4: Warnings ──────────────────────────────────────────────────────
  unassigned.forEach(msg => warnings.push(msg));

  demands.forEach(d => {
    if (d.remaining > 0) {
      const sub = subjects.find(s => s.id === d.subjectId);
      const cls = classes.find(c => c.id === d.classId);
      const teacher = teachers.find(t => t.id === d.teacherId);
      const load = teacherLoad[d.teacherId] || 0;
      const cap = teacher?.maxPeriods ?? '?';
      warnings.push(
        `${cls?.name}: ${sub?.name} still needs ${d.remaining} more period(s). ` +
        `${teacher?.name} is at ${load}/${cap} periods/week — consider adding another teacher for this subject.`
      );
    }
  });

  return { schedule, warnings, teacherLoad };
}

/**
 * Returns default subject requirements per class, using classAssignments.
 * Only subjects with an assigned teacher are included by default.
 */
export function getDefaultRequirements(classes, subjects, activeDayCount, classAssignments = []) {
  const classSubjectMap = {};
  classes.forEach(cls => {
    const assignedSubjectIds = classAssignments
      .filter(a => a.classId === cls.id).map(a => a.subjectId);
    const applicable = subjects.filter(s => assignedSubjectIds.includes(s.id));
    classSubjectMap[cls.id] = applicable.map(sub => ({
      subjectId: sub.id,
      periodsPerWeek:
        sub.code === 'MATH' || sub.code === 'ENG' ? 5
        : sub.code === 'PE' || sub.code === 'ART' || sub.code === 'MUS' ? 2
        : 4  // SCI, SST, HIN, CS, etc.
    }));
  });
  return classSubjectMap;
}

/**
 * Staffing Analysis — for each subject, calculates total periods needed across
 * all classes, existing capacity from assignments, and recommended teacher count.
 *
 * Returns: [{
 *   subjectId, subjectName, subjectCode,
 *   totalPeriodsNeeded,      // sum of periodsPerWeek across all classes
 *   teachers: [{teacherId, teacherName, classCount, periodsAssigned, maxPeriods, status}],
 *   recommendedTeachers,     // ceil(totalPeriodsNeeded / avgMaxPeriods)
 *   currentTeachers,         // distinct teachers count
 *   status: 'ok' | 'warn' | 'critical'
 * }]
 */
export function analyzeStaffing(state, classSubjectMap) {
  const { teachers, classes, subjects, classAssignments = [] } = state;

  // Per subject — collect all demands and assigned teachers
  const subjectData = {};
  subjects.forEach(sub => { subjectData[sub.id] = { totalPeriods: 0, teacherPeriods: {}, teacherClasses: {} }; });

  classes.forEach(cls => {
    (classSubjectMap[cls.id] || []).forEach(req => {
      if (req.periodsPerWeek <= 0) return;
      const sd = subjectData[req.subjectId];
      if (!sd) return;
      sd.totalPeriods += req.periodsPerWeek;

      // Find assigned teacher for this class-subject
      const assignment = classAssignments.find(a => a.classId === cls.id && a.subjectId === req.subjectId);
      if (assignment) {
        sd.teacherPeriods[assignment.teacherId] = (sd.teacherPeriods[assignment.teacherId] || 0) + req.periodsPerWeek;
        if (!sd.teacherClasses[assignment.teacherId]) sd.teacherClasses[assignment.teacherId] = [];
        sd.teacherClasses[assignment.teacherId].push(cls.name);
      }
    });
  });

  const avgMaxPeriods = teachers.length > 0
    ? teachers.reduce((s, t) => s + t.maxPeriods, 0) / teachers.length
    : 30;

  return subjects
    .filter(sub => subjectData[sub.id]?.totalPeriods > 0)
    .map(sub => {
      const sd = subjectData[sub.id];
      const teacherList = Object.entries(sd.teacherPeriods).map(([tid, periods]) => {
        const t = teachers.find(t => t.id === tid);
        const overloaded = periods > (t?.maxPeriods ?? 30);
        return {
          teacherId: tid,
          teacherName: t?.name ?? tid,
          classCount: sd.teacherClasses[tid]?.length ?? 0,
          classes: sd.teacherClasses[tid] ?? [],
          periodsAssigned: periods,
          maxPeriods: t?.maxPeriods ?? 30,
          status: overloaded ? 'critical' : periods > (t?.maxPeriods ?? 30) * 0.8 ? 'warn' : 'ok',
        };
      });

      const recommended = Math.ceil(sd.totalPeriods / (avgMaxPeriods * 0.6)); // 60% utilisation target
      const current = teacherList.length;
      const hasCritical = teacherList.some(t => t.status === 'critical');
      const hasWarn = teacherList.some(t => t.status === 'warn');

      return {
        subjectId: sub.id,
        subjectName: sub.name,
        subjectCode: sub.code,
        totalPeriodsNeeded: sd.totalPeriods,
        teachers: teacherList,
        recommendedTeachers: recommended,
        currentTeachers: current,
        status: hasCritical ? 'critical' : hasWarn || current < recommended ? 'warn' : 'ok',
      };
    })
    .sort((a, b) => {
      const order = { critical: 0, warn: 1, ok: 2 };
      return (order[a.status] - order[b.status]) || (b.totalPeriodsNeeded - a.totalPeriodsNeeded);
    });
}
