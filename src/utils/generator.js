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
  const { teachers, classes, subjects, settings, classAssignments = [], classPeriodSettings = {}, teacherAvailability = {}, classOrGroups = {} } = state;
  const { classSubjectMap, selectedClassIds } = requirements;

  const targetClasses = selectedClassIds
    ? classes.filter(c => selectedClassIds.includes(c.id))
    : classes;

  const activeDayKeys = Object.entries(settings.workingDays)
    .filter(([, v]) => v).map(([k]) => k);

  const getClassPeriods = (classId) => {
    const custom = classPeriodSettings[classId];
    return custom ? custom.periodTimings : settings.periodTimings;
  };

  const globalNonBreak = settings.periodTimings
    .filter(p => !p.isBreak).map(p => p.period);

  // Build a lookup of subject concurrency flags
  const subjectMap = {};
  subjects.forEach(s => { subjectMap[s.id] = s; });

  // Fast lookup: classId__subjectId → teacherIds[]
  const assignmentMap = {};
  classAssignments.forEach(a => {
    const ids = a.teacherIds?.length ? a.teacherIds : (a.teacherId ? [a.teacherId] : []);
    if (ids.length) assignmentMap[`${a.classId}__${a.subjectId}`] = ids;
  });


  // ── OR Group index (per-class config) ────────────────────────────────────
  // Built from classOrGroups: { classId: [{label, subjectIds, syncClassIds}] }
  // Key: `${classId}__${label}` → [{subjectId, teacherIds}]
  const orGroupIndex = {};
  // Also build a reverse map: subjectId → label (within a classId)
  // so we can tag demands with their group membership.
  const subjectOrGroupLabel = {}; // `${classId}__${subjectId}` → label
  // Cross-class OR sync: `${classId}__${label}` → [syncClassId, ...]
  const syncGroupMap = {};

  targetClasses.forEach(cls => {
    const groups = classOrGroups[cls.id] || [];
    groups.forEach(grp => {
      if (!grp.label || grp.subjectIds.length < 2) return;
      const key = `${cls.id}__${grp.label}`;
      orGroupIndex[key] = grp.subjectIds.map(sid => {
        const teacherIds = assignmentMap[`${cls.id}__${sid}`] || [];
        return { subjectId: sid, teacherIds };
      }).filter(x => x.teacherIds.length > 0);
      grp.subjectIds.forEach(sid => {
        subjectOrGroupLabel[`${cls.id}__${sid}`] = grp.label;
      });
      if (grp.syncClassIds?.length > 0) {
        syncGroupMap[key] = grp.syncClassIds;
      }
    });
  });


  // ── Step 1: Build demand list ─────────────────────────────────────────────
  // OR-group siblings share the same slot — only the FIRST sibling in a group
  // is added as a demand (it drags its siblings along when scheduled).
  const orGroupLeaders = new Set();
  const demands = [];
  targetClasses.forEach(cls => {
    (classSubjectMap[cls.id] || []).forEach(req => {
      if (req.periodsPerWeek <= 0) return;
      // If the entry has a specific teacherId (per-teacher split), use only that teacher.
      // Otherwise fall back to the full pool from classAssignments.
      const teacherIds = req.teacherId
        ? [req.teacherId]
        : assignmentMap[`${cls.id}__${req.subjectId}`];
      if (!teacherIds?.length) return;
      const orGroup = subjectOrGroupLabel[`${cls.id}__${req.subjectId}`] || '';
      if (orGroup) {
        const key = `${cls.id}__${orGroup}`;
        if (orGroupLeaders.has(key)) return;
        orGroupLeaders.add(key);
      }
      // Compute a strict per-day budget: evenly distribute periodsPerWeek across
      // active days. minPerDay goes to every day; the remainder (extras) goes to
      // randomly chosen days. This guarantees no day is skipped when P >= D.
      const minPerDay = Math.floor(req.periodsPerWeek / activeDayKeys.length);
      const extras    = req.periodsPerWeek % activeDayKeys.length;
      const shuffledDayIdxs = shuffle(activeDayKeys.map(k => DAY_KEY_TO_IDX[k]));
      const dayBudget = {};
      shuffledDayIdxs.forEach((dayIdx, i) => {
        dayBudget[dayIdx] = minPerDay + (i < extras ? 1 : 0);
      });
      const concurrent = !!(subjectMap[req.subjectId]?.concurrent);
      demands.push({ classId: cls.id, subjectId: req.subjectId, teacherIds,
        remaining: req.periodsPerWeek, orGroup, dayBudget, dayCount: {}, concurrent });
    });
  });



  // Track unassigned subjects
  const unassigned = [];
  targetClasses.forEach(cls => {
    (classSubjectMap[cls.id] || []).filter(r => r.periodsPerWeek > 0).forEach(req => {
      const hasTeacher = req.teacherId
        ? teachers.some(t => t.id === req.teacherId)
        : assignmentMap[`${cls.id}__${req.subjectId}`]?.length > 0;
      if (!hasTeacher) {
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

  // If generating for selected classes only, pre-fill busy maps from existing schedule
  // for non-selected classes so we don't double-book teachers
  if (selectedClassIds) {
    const existingSchedule = state.schedule || [];
    existingSchedule.forEach(slot => {
      if (!selectedClassIds.includes(slot.classId)) {
        teacherBusy.add(`${slot.teacherId}_${slot.day}_${slot.period}`);
        classBusy.add(`${slot.classId}_${slot.day}_${slot.period}`);
        if (teacherLoad[slot.teacherId] !== undefined) {
          teacherLoad[slot.teacherId]++;
        }
      }
    });
  }

  // ── Pre-fill locked slots: carry them into the new schedule unchanged ─────
  // For every locked slot belonging to a target class, add it to the output,
  // mark teacher + class busy, and decrement the corresponding demand so
  // the generator doesn't try to place that period again.
  const lockedSlotIds = new Set(state.lockedSlots || []);
  const schedule = [];
  if (lockedSlotIds.size > 0) {
    (state.schedule || []).forEach(slot => {
      if (!lockedSlotIds.has(slot.id)) return;
      if (!targetClasses.some(c => c.id === slot.classId)) return;
      schedule.push({ ...slot }); // carry forward as-is
      teacherBusy.add(`${slot.teacherId}_${slot.day}_${slot.period}`);
      classBusy.add(`${slot.classId}_${slot.day}_${slot.period}`);
      teacherLoad[slot.teacherId] = (teacherLoad[slot.teacherId] || 0) + 1;
      // Reduce the matching demand so we don't over-assign this subject
      const demand = demands.find(d => d.classId === slot.classId && d.subjectId === slot.subjectId);
      if (demand) {
        demand.remaining = Math.max(0, demand.remaining - 1);
        demand.dayCount[slot.day] = (demand.dayCount[slot.day] || 0) + 1;
      }
    });
  }

  const warnings = [];

  // ── Step 3: Slot fill ─────────────────────────────────────────────────────
  // Build slots in ROUND-ROBIN day order: visit one slot per day before revisiting
  // any day. This guarantees subjects are spread across days before doubling up.
  // Periods within each day are shuffled for variety.
  const slotsByDay = {};
  for (const dayKey of activeDayKeys) {
    const dayIdx = DAY_KEY_TO_IDX[dayKey];
    slotsByDay[dayKey] = shuffle(globalNonBreak.map(period => ({ dayKey, dayIdx, period })));
  }
  const maxRounds = Math.max(...activeDayKeys.map(d => slotsByDay[d].length));
  const slots = [];
  for (let round = 0; round < maxRounds; round++) {
    for (const dayKey of shuffle([...activeDayKeys])) {
      if (round < slotsByDay[dayKey].length) slots.push(slotsByDay[dayKey][round]);
    }
  }

  for (const { dayKey, dayIdx, period } of slots) {
    // Get remaining demands, sorted by most-needed first (greedy), with random tiebreak.
    // Demands that have hit their per-day cap for this day are excluded.
    const pending = demands
      .filter(d => d.remaining > 0 && (d.dayCount[dayIdx] || 0) < (d.dayBudget[dayIdx] ?? 0))
      .sort((a, b) => b.remaining - a.remaining || Math.random() - 0.5);

    // For this slot: pick an independent set — no two picks share a teacher or class
    const usedTeachersThisSlot = new Set();
    const usedClassesThisSlot = new Set();

    for (const demand of pending) {
      if (usedClassesThisSlot.has(demand.classId)) continue;
      if (classBusy.has(`${demand.classId}_${dayIdx}_${period}`)) continue;
      // Skip this slot if the period is blocked for this class
      if ((classPeriodSettings[demand.classId]?.blockedPeriods || []).includes(period)) continue;

      // Pick the best available teacher from the pool.
      // Concurrent subjects skip the teacher-busy check — the same teacher
      // can teach multiple classes simultaneously for this subject.
      const freeTeachers = demand.teacherIds.filter(tid =>
        (demand.concurrent || !teacherBusy.has(`${tid}_${dayIdx}_${period}`)) &&
        (demand.concurrent || !usedTeachersThisSlot.has(tid)) &&
        teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
      );
      if (!freeTeachers.length) continue;

      // Pick lowest-loaded free teacher
      const chosenTeacherId = freeTeachers.reduce((best, tid) =>
        (teacherLoad[tid] || 0) < (teacherLoad[best] || 0) ? tid : best
      );

      // Check weekly teacher cap
      const teacher = teachers.find(t => t.id === chosenTeacherId);
      if (teacher && (teacherLoad[chosenTeacherId] || 0) >= teacher.maxPeriods) continue;

      // ── Resolve OR-group siblings ───────────────────────────────────────
      let alternatives = null;
      if (demand.orGroup) {
        const key = `${demand.classId}__${demand.orGroup}`;
        const siblings = orGroupIndex[key] || [];
        const allSiblingAlts = siblings.map(sib => {
          // Pick a free teacher from each sibling's pool
          const freeSibTeachers = (sib.teacherIds || []).filter(tid =>
            !teacherBusy.has(`${tid}_${dayIdx}_${period}`) &&
            !usedTeachersThisSlot.has(tid) &&
            teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
          );
          const chosen = freeSibTeachers.length
            ? freeSibTeachers.reduce((best, tid) =>
                (teacherLoad[tid] || 0) < (teacherLoad[best] || 0) ? tid : best
              )
            : null;
          return { subjectId: sib.subjectId, teacherId: chosen, free: !!chosen };
        });
        const allFree = allSiblingAlts.every(s => s.free);
        if (!allFree) continue;
        alternatives = allSiblingAlts.map(({ subjectId, teacherId }) => ({ subjectId, teacherId }));
      }

      // ✅ Assign
      const slotId = `sch_${demand.classId}_${dayIdx}_${period}`;
      schedule.push({
        id: slotId,
        classId: demand.classId, day: dayIdx, period,
        teacherId: chosenTeacherId, subjectId: demand.subjectId,
        alternatives,
      });
      teacherBusy.add(`${chosenTeacherId}_${dayIdx}_${period}`);
      classBusy.add(`${demand.classId}_${dayIdx}_${period}`);
      usedTeachersThisSlot.add(chosenTeacherId);
      usedClassesThisSlot.add(demand.classId);
      teacherLoad[chosenTeacherId] = (teacherLoad[chosenTeacherId] || 0) + 1;
      demand.remaining--;
      demand.dayCount[dayIdx] = (demand.dayCount[dayIdx] || 0) + 1;

      // Mark sibling teachers busy
      if (demand.orGroup && alternatives) {
        for (const sib of alternatives) {
          if (sib.teacherId === chosenTeacherId) continue;
          teacherBusy.add(`${sib.teacherId}_${dayIdx}_${period}`);
          usedTeachersThisSlot.add(sib.teacherId);
          teacherLoad[sib.teacherId] = (teacherLoad[sib.teacherId] || 0) + 1;
          const sibDemand = demands.find(
            d => d.classId === demand.classId && d.subjectId === sib.subjectId
          );
          if (sibDemand) sibDemand.remaining--;
        }

        // ── Cross-class OR sync: place the same OR group slot in sibling classes ──
        const syncClsIds = syncGroupMap[`${demand.classId}__${demand.orGroup}`] || [];
        for (const syncCid of syncClsIds) {
          if (classBusy.has(`${syncCid}_${dayIdx}_${period}`)) continue;
          if (usedClassesThisSlot.has(syncCid)) continue;
          if ((classPeriodSettings[syncCid]?.blockedPeriods || []).includes(period)) continue;

          // Find the OR leader demand for the synced class
          let syncLeaderDemand = demands.find(d => d.classId === syncCid && d.orGroup === demand.orGroup && d.remaining > 0);

          const syncGroupKey = `${syncCid}__${demand.orGroup}`;
          // Use synced class's own OR group definition; fall back to source class's subjects
          // with the synced class's teacher assignments (when OR group was auto-propagated)
          let syncSiblings = orGroupIndex[syncGroupKey];
          if (!syncSiblings?.length) {
            const sourceSiblings = orGroupIndex[`${demand.classId}__${demand.orGroup}`] || [];
            syncSiblings = sourceSiblings.map(s => ({
              subjectId: s.subjectId,
              teacherIds: assignmentMap[`${syncCid}__${s.subjectId}`] || [],
            })).filter(s => s.teacherIds.length > 0);
          }
          if (!syncSiblings?.length) continue;

          // If no OR-group leader demand, fall back to any demand for the first matched subject
          if (!syncLeaderDemand) {
            for (const sib of syncSiblings) {
              syncLeaderDemand = demands.find(d => d.classId === syncCid && d.subjectId === sib.subjectId && d.remaining > 0);
              if (syncLeaderDemand) break;
            }
          }
          if (!syncLeaderDemand) continue;

          // Resolve free teachers for all subjects in the synced class's OR group
          const syncAlts = syncSiblings.map(sib => {
            const freeSibTeachers = (sib.teacherIds || []).filter(tid =>
              !teacherBusy.has(`${tid}_${dayIdx}_${period}`) &&
              !usedTeachersThisSlot.has(tid) &&
              teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
            );
            const chosen = freeSibTeachers.length
              ? freeSibTeachers.reduce((best, tid) =>
                  (teacherLoad[tid] || 0) < (teacherLoad[best] || 0) ? tid : best)
              : null;
            return { subjectId: sib.subjectId, teacherId: chosen, free: !!chosen };
          });
          if (!syncAlts.every(s => s.free)) continue;

          // Use the leader's subject/teacher from syncAlts
          const leaderAlt = syncAlts.find(s => s.subjectId === syncLeaderDemand.subjectId) || syncAlts[0];
          const leaderTeacherObj = teachers.find(t => t.id === leaderAlt.teacherId);
          if (leaderTeacherObj && (teacherLoad[leaderAlt.teacherId] || 0) >= leaderTeacherObj.maxPeriods) continue;

          // ✅ Assign the synced class slot
          schedule.push({
            id: `sch_${syncCid}_${dayIdx}_${period}`,
            classId: syncCid, day: dayIdx, period,
            teacherId: leaderAlt.teacherId, subjectId: leaderAlt.subjectId,
            alternatives: syncAlts.map(({ subjectId, teacherId }) => ({ subjectId, teacherId })),
          });
          teacherBusy.add(`${leaderAlt.teacherId}_${dayIdx}_${period}`);
          classBusy.add(`${syncCid}_${dayIdx}_${period}`);
          usedTeachersThisSlot.add(leaderAlt.teacherId);
          usedClassesThisSlot.add(syncCid);
          teacherLoad[leaderAlt.teacherId] = (teacherLoad[leaderAlt.teacherId] || 0) + 1;
          syncLeaderDemand.remaining--;
          syncLeaderDemand.dayCount[dayIdx] = (syncLeaderDemand.dayCount[dayIdx] || 0) + 1;

          // Mark other sibling teachers busy and decrement their demands
          for (const syncSib of syncAlts) {
            if (syncSib.subjectId === leaderAlt.subjectId) continue;
            if (syncSib.teacherId === leaderAlt.teacherId) continue;
            teacherBusy.add(`${syncSib.teacherId}_${dayIdx}_${period}`);
            usedTeachersThisSlot.add(syncSib.teacherId);
            teacherLoad[syncSib.teacherId] = (teacherLoad[syncSib.teacherId] || 0) + 1;
            const syncSibDemand = demands.find(d => d.classId === syncCid && d.subjectId === syncSib.subjectId);
            if (syncSibDemand) syncSibDemand.remaining--;
          }
        }
      }
    }
  }

  // ── Step 3b: Relaxed pass — fill any still-unfilled demands ignoring dayBudget ──
  // Runs only when the main pass left demands unfilled (e.g. all budgeted-day slots
  // were claimed by other subjects first). Iterates the same slot list; classBusy
  // prevents double-booking, so this only touches genuinely empty class slots.
  if (demands.some(d => d.remaining > 0)) {
    for (const { dayKey, dayIdx, period } of slots) {
      const pending2 = demands
        .filter(d => d.remaining > 0)   // no dayBudget restriction
        .sort((a, b) => b.remaining - a.remaining || Math.random() - 0.5);
      if (!pending2.length) break;

      const usedTeachersThisSlot = new Set();
      const usedClassesThisSlot = new Set();

      for (const demand of pending2) {
        if (usedClassesThisSlot.has(demand.classId)) continue;
        if (classBusy.has(`${demand.classId}_${dayIdx}_${period}`)) continue;
        if ((classPeriodSettings[demand.classId]?.blockedPeriods || []).includes(period)) continue;

        const freeTeachers = demand.teacherIds.filter(tid =>
          (demand.concurrent || !teacherBusy.has(`${tid}_${dayIdx}_${period}`)) &&
          (demand.concurrent || !usedTeachersThisSlot.has(tid)) &&
          teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
        );
        if (!freeTeachers.length) continue;

        const chosenTeacherId = freeTeachers.reduce((best, tid) =>
          (teacherLoad[tid] || 0) < (teacherLoad[best] || 0) ? tid : best
        );
        const teacher = teachers.find(t => t.id === chosenTeacherId);
        if (teacher && (teacherLoad[chosenTeacherId] || 0) >= teacher.maxPeriods) continue;

        // Resolve OR-group siblings
        let alternatives = null;
        if (demand.orGroup) {
          const key = `${demand.classId}__${demand.orGroup}`;
          const siblings = orGroupIndex[key] || [];
          const allSiblingAlts = siblings.map(sib => {
            const freeSibTeachers = (sib.teacherIds || []).filter(tid =>
              !teacherBusy.has(`${tid}_${dayIdx}_${period}`) &&
              !usedTeachersThisSlot.has(tid) &&
              teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
            );
            const chosen = freeSibTeachers.length
              ? freeSibTeachers.reduce((best, tid) =>
                  (teacherLoad[tid] || 0) < (teacherLoad[best] || 0) ? tid : best)
              : null;
            return { subjectId: sib.subjectId, teacherId: chosen, free: !!chosen };
          });
          if (!allSiblingAlts.every(s => s.free)) continue;
          alternatives = allSiblingAlts.map(({ subjectId, teacherId }) => ({ subjectId, teacherId }));
        }

        const slotId = `sch_${demand.classId}_${dayIdx}_${period}`;
        schedule.push({
          id: slotId,
          classId: demand.classId, day: dayIdx, period,
          teacherId: chosenTeacherId, subjectId: demand.subjectId,
          alternatives,
        });
        teacherBusy.add(`${chosenTeacherId}_${dayIdx}_${period}`);
        classBusy.add(`${demand.classId}_${dayIdx}_${period}`);
        usedTeachersThisSlot.add(chosenTeacherId);
        usedClassesThisSlot.add(demand.classId);
        teacherLoad[chosenTeacherId] = (teacherLoad[chosenTeacherId] || 0) + 1;
        demand.remaining--;
        demand.dayCount[dayIdx] = (demand.dayCount[dayIdx] || 0) + 1;

        if (demand.orGroup && alternatives) {
          for (const sib of alternatives) {
            if (sib.teacherId === chosenTeacherId) continue;
            teacherBusy.add(`${sib.teacherId}_${dayIdx}_${period}`);
            usedTeachersThisSlot.add(sib.teacherId);
            teacherLoad[sib.teacherId] = (teacherLoad[sib.teacherId] || 0) + 1;
            const sibDemand = demands.find(
              d => d.classId === demand.classId && d.subjectId === sib.subjectId
            );
            if (sibDemand) sibDemand.remaining--;
          }

          // ── Cross-class OR sync (relaxed pass) ──
          const syncClsIds = syncGroupMap[`${demand.classId}__${demand.orGroup}`] || [];
          for (const syncCid of syncClsIds) {
            if (classBusy.has(`${syncCid}_${dayIdx}_${period}`)) continue;
            if (usedClassesThisSlot.has(syncCid)) continue;
            if ((classPeriodSettings[syncCid]?.blockedPeriods || []).includes(period)) continue;

            let syncLeaderDemand = demands.find(d => d.classId === syncCid && d.orGroup === demand.orGroup && d.remaining > 0);

            // Use synced class's own OR group; fall back to source class's subjects with synced class's teacher assignments
            let syncSiblings = orGroupIndex[`${syncCid}__${demand.orGroup}`];
            if (!syncSiblings?.length) {
              const sourceSiblings = orGroupIndex[`${demand.classId}__${demand.orGroup}`] || [];
              syncSiblings = sourceSiblings.map(s => ({
                subjectId: s.subjectId,
                teacherIds: assignmentMap[`${syncCid}__${s.subjectId}`] || [],
              })).filter(s => s.teacherIds.length > 0);
            }
            if (!syncSiblings?.length) continue;

            if (!syncLeaderDemand) {
              for (const sib of syncSiblings) {
                syncLeaderDemand = demands.find(d => d.classId === syncCid && d.subjectId === sib.subjectId && d.remaining > 0);
                if (syncLeaderDemand) break;
              }
            }
            if (!syncLeaderDemand) continue;

            const syncAlts = syncSiblings.map(sib => {
              const freeSibTeachers = (sib.teacherIds || []).filter(tid =>
                !teacherBusy.has(`${tid}_${dayIdx}_${period}`) &&
                !usedTeachersThisSlot.has(tid) &&
                teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
              );
              const chosen = freeSibTeachers.length
                ? freeSibTeachers.reduce((best, tid) =>
                    (teacherLoad[tid] || 0) < (teacherLoad[best] || 0) ? tid : best)
                : null;
              return { subjectId: sib.subjectId, teacherId: chosen, free: !!chosen };
            });
            if (!syncAlts.every(s => s.free)) continue;

            const leaderAlt = syncAlts.find(s => s.subjectId === syncLeaderDemand.subjectId) || syncAlts[0];
            const leaderTeacherObj = teachers.find(t => t.id === leaderAlt.teacherId);
            if (leaderTeacherObj && (teacherLoad[leaderAlt.teacherId] || 0) >= leaderTeacherObj.maxPeriods) continue;

            schedule.push({
              id: `sch_${syncCid}_${dayIdx}_${period}`,
              classId: syncCid, day: dayIdx, period,
              teacherId: leaderAlt.teacherId, subjectId: leaderAlt.subjectId,
              alternatives: syncAlts.map(({ subjectId, teacherId }) => ({ subjectId, teacherId })),
            });
            teacherBusy.add(`${leaderAlt.teacherId}_${dayIdx}_${period}`);
            classBusy.add(`${syncCid}_${dayIdx}_${period}`);
            usedTeachersThisSlot.add(leaderAlt.teacherId);
            usedClassesThisSlot.add(syncCid);
            teacherLoad[leaderAlt.teacherId] = (teacherLoad[leaderAlt.teacherId] || 0) + 1;
            syncLeaderDemand.remaining--;
            syncLeaderDemand.dayCount[dayIdx] = (syncLeaderDemand.dayCount[dayIdx] || 0) + 1;

            for (const syncSib of syncAlts) {
              if (syncSib.subjectId === leaderAlt.subjectId) continue;
              if (syncSib.teacherId === leaderAlt.teacherId) continue;
              teacherBusy.add(`${syncSib.teacherId}_${dayIdx}_${period}`);
              usedTeachersThisSlot.add(syncSib.teacherId);
              teacherLoad[syncSib.teacherId] = (teacherLoad[syncSib.teacherId] || 0) + 1;
              const syncSibDemand = demands.find(d => d.classId === syncCid && d.subjectId === syncSib.subjectId);
              if (syncSibDemand) syncSibDemand.remaining--;
            }
          }
        }
      }
    }
  }

  // ── Step 4: Warnings ──────────────────────────────────────────────────────
  unassigned.forEach(msg => warnings.push(msg));

  demands.forEach(d => {
    if (d.remaining > 0) {
      const sub = subjects.find(s => s.id === d.subjectId);
      const cls = classes.find(c => c.id === d.classId);
      // demands now carry teacherIds[] — show the primary (first) teacher
      const primaryTid = d.teacherIds?.[0];
      const teacher = teachers.find(t => t.id === primaryTid);
      const load = teacherLoad[primaryTid] || 0;
      const cap = teacher?.maxPeriods ?? '?';
      const extraCount = (d.teacherIds?.length || 1) - 1;
      warnings.push(
        `${cls?.name}: ${sub?.name} still needs ${d.remaining} more period(s). ` +
        `${teacher?.name ?? primaryTid}${extraCount > 0 ? ` (+${extraCount} co-teacher${extraCount > 1 ? 's' : ''})` : ''} ` +
        `is at ${load}/${cap} periods/week — consider adding another teacher for this subject.`
      );
    }
  });


  return { schedule, warnings, teacherLoad };
}

/**
 * Returns default subject requirements per class, using classAssignments.
 * For subjects with multiple teachers, one entry per teacher is created so
 * each teacher's period allocation can be configured independently.
 */
export function getDefaultRequirements(classes, subjects, activeDayCount, classAssignments = []) {
  const classSubjectMap = {};
  classes.forEach(cls => {
    const entries = [];
    const assignments = classAssignments.filter(a => a.classId === cls.id);
    assignments.forEach(a => {
      const sub = subjects.find(s => s.id === a.subjectId);
      if (!sub) return;
      const defaultPeriods =
        sub.code === 'MATH' || sub.code === 'ENG' ? 5
        : sub.code === 'PE' || sub.code === 'ART' || sub.code === 'MUS' ? 2
        : 4;
      const teacherIds = a.teacherIds?.length ? a.teacherIds : (a.teacherId ? [a.teacherId] : []);
      if (teacherIds.length > 1) {
        // Split evenly across teachers, remainder goes to the first
        const perTeacher = Math.floor(defaultPeriods / teacherIds.length);
        const remainder  = defaultPeriods % teacherIds.length;
        teacherIds.forEach((tid, i) => {
          entries.push({ subjectId: sub.id, teacherId: tid, periodsPerWeek: perTeacher + (i === 0 ? remainder : 0) });
        });
      } else {
        // Single teacher — no teacherId key needed (backward-compatible)
        entries.push({ subjectId: sub.id, periodsPerWeek: defaultPeriods });
      }
    });
    classSubjectMap[cls.id] = entries;
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
export function analyzeStaffing(state, classSubjectMap, selectedClassIds) {
  const { teachers, classes, subjects, classAssignments = [] } = state;

  const targetClasses = selectedClassIds
    ? classes.filter(c => selectedClassIds.includes(c.id))
    : classes;

  // Per subject — collect all demands and assigned teachers
  const subjectData = {};
  subjects.forEach(sub => { subjectData[sub.id] = { totalPeriods: 0, teacherPeriods: {}, teacherClasses: {} }; });

  // Cross-subject total load per teacher
  const teacherTotalPeriods = {};

  targetClasses.forEach(cls => {
    (classSubjectMap[cls.id] || []).forEach(req => {
      if (req.periodsPerWeek <= 0) return;
      const sd = subjectData[req.subjectId];
      if (!sd) return;
      sd.totalPeriods += req.periodsPerWeek;

      // Support teacherIds[] (multi-teacher) and legacy teacherId
      const assignment = classAssignments.find(a => a.classId === cls.id && a.subjectId === req.subjectId);
      if (assignment) {
        const tids = assignment.teacherIds?.length ? assignment.teacherIds : (assignment.teacherId ? [assignment.teacherId] : []);
        tids.forEach(tid => {
          const share = req.periodsPerWeek / tids.length;
          sd.teacherPeriods[tid] = (sd.teacherPeriods[tid] || 0) + share;
          teacherTotalPeriods[tid] = (teacherTotalPeriods[tid] || 0) + share;
          if (!sd.teacherClasses[tid]) sd.teacherClasses[tid] = [];
          if (!sd.teacherClasses[tid].includes(cls.name)) sd.teacherClasses[tid].push(cls.name);
        });
      }
    });
  });

  const avgMaxPeriods = teachers.length > 0
    ? teachers.reduce((s, t) => s + t.maxPeriods, 0) / teachers.length
    : 30;

  const subjectResult = subjects
    .filter(sub => subjectData[sub.id]?.totalPeriods > 0)
    .map(sub => {
      const sd = subjectData[sub.id];
      const teacherList = Object.entries(sd.teacherPeriods).map(([tid, periods]) => {
        const t = teachers.find(t => t.id === tid);
        const totalLoad = teacherTotalPeriods[tid] || 0;
        const overloaded = totalLoad > (t?.maxPeriods ?? 30);
        return {
          teacherId: tid,
          teacherName: t?.name ?? tid,
          classCount: sd.teacherClasses[tid]?.length ?? 0,
          classes: sd.teacherClasses[tid] ?? [],
          periodsAssigned: Math.round(periods * 10) / 10,
          totalLoad,
          maxPeriods: t?.maxPeriods ?? 30,
          status: overloaded ? 'critical' : totalLoad > (t?.maxPeriods ?? 30) * 0.8 ? 'warn' : 'ok',
        };
      });

      const recommended = Math.ceil(sd.totalPeriods / (avgMaxPeriods * 0.6));
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

  const teacherSummary = teachers
    .filter(t => teacherTotalPeriods[t.id] > 0)
    .map(t => {
      const totalLoad = teacherTotalPeriods[t.id] || 0;
      const overloaded = totalLoad > t.maxPeriods;
      const subjectBreakdown = subjectResult
        .filter(s => s.teachers.some(st => st.teacherId === t.id))
        .map(s => {
          const st = s.teachers.find(st => st.teacherId === t.id);
          return { subjectName: s.subjectName, subjectCode: s.subjectCode, periods: st.periodsAssigned, classes: st.classes };
        });
      return {
        teacherId: t.id,
        teacherName: t.name,
        totalLoad,
        maxPeriods: t.maxPeriods,
        remaining: t.maxPeriods - totalLoad,
        utilisationPct: Math.min(100, Math.round((totalLoad / t.maxPeriods) * 100)),
        status: overloaded ? 'critical' : totalLoad > t.maxPeriods * 0.8 ? 'warn' : 'ok',
        subjectBreakdown,
      };
    })
    .sort((a, b) => b.utilisationPct - a.utilisationPct);

  return { bySubject: subjectResult, byTeacher: teacherSummary };
}

/**
 * Merges any subjects present in classAssignments but missing from the
 * given map (e.g. subjects added after the previous timetable run).
 * New entries get periodsPerWeek = 0 so the user can set them explicitly.
 */
export function mergeNewSubjects(map, clsList, assignments) {
  const merged = {};
  clsList.forEach(cls => {
    const existing = map[cls.id] || [];
    // Build a set of "subjectId__teacherId" keys already present
    const existingKeys = new Set(existing.map(r => r.teacherId ? `${r.subjectId}__${r.teacherId}` : r.subjectId));

    const clsAssignments = assignments.filter(a => a.classId === cls.id && a.subjectId);
    const newEntries = [];
    clsAssignments.forEach(a => {
      const teacherIds = a.teacherIds?.length ? a.teacherIds : (a.teacherId ? [a.teacherId] : []);
      if (teacherIds.length > 1) {
        teacherIds.forEach(tid => {
          const key = `${a.subjectId}__${tid}`;
          if (!existingKeys.has(key)) {
            newEntries.push({ subjectId: a.subjectId, teacherId: tid, periodsPerWeek: 0 });
          }
        });
      } else {
        if (!existingKeys.has(a.subjectId)) {
          newEntries.push({ subjectId: a.subjectId, periodsPerWeek: 0 });
        }
      }
    });
    merged[cls.id] = newEntries.length > 0 ? [...existing, ...newEntries] : existing;
  });
  return merged;
}
