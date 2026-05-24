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
  const { classSubjectMap, selectedClassIds, contextSchedule } = requirements;

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
  // Auto-detect cross-class OR sync: if multiple target classes have OR groups
  // with the same label, sync them automatically (no need to set syncClassIds explicitly).
  {
    const labelCls = {};
    targetClasses.forEach(cls => {
      (classOrGroups[cls.id] || []).forEach(grp => {
        if (!grp.label || grp.subjectIds.length < 2) return;
        if (!labelCls[grp.label]) labelCls[grp.label] = [];
        labelCls[grp.label].push(cls.id);
      });
    });
    Object.entries(labelCls).forEach(([label, cids]) => {
      if (cids.length < 2) return;
      cids.forEach(cid => {
        const k = `${cid}__${label}`;
        if (!syncGroupMap[k]) syncGroupMap[k] = cids.filter(c => c !== cid);
      });
    });
  }


  // ── Step 1: Build demand list ─────────────────────────────────────────────
  // OR-group siblings share the same slot — only the FIRST sibling in a group
  // is added as a demand (it drags its siblings along when scheduled).

  // Pre-scan: collect (classId__subjectId) pairs that have at least one VALID
  // per-teacher entry (teacher still in current assignment). These take precedence
  // over any no-teacherId entry for the same pair, preventing double-counting.
  const perTeacherSubjectKeys = new Set(); // `${classId}__${subjectId}`
  targetClasses.forEach(cls => {
    (classSubjectMap[cls.id] || []).forEach(req => {
      if (!req.teacherId || req.periodsPerWeek <= 0) return;
      const validIds = assignmentMap[`${cls.id}__${req.subjectId}`] || [];
      if (validIds.includes(req.teacherId)) perTeacherSubjectKeys.add(`${cls.id}__${req.subjectId}`);
    });
  });

  const orGroupLeaders = new Set();
  const noTeacherSeenKeys = new Set(); // deduplicate no-teacherId entries per (classId, subjectId)
  const demands = [];
  targetClasses.forEach(cls => {
    (classSubjectMap[cls.id] || []).forEach(req => {
      if (req.periodsPerWeek <= 0) return;
      // Drop stale per-teacher entries whose teacher is no longer assigned
      if (req.teacherId) {
        const validIds = assignmentMap[`${cls.id}__${req.subjectId}`] || [];
        if (!validIds.includes(req.teacherId)) return;
      }
      // Drop no-teacherId entries when valid per-teacher entries already cover this subject
      if (!req.teacherId && perTeacherSubjectKeys.has(`${cls.id}__${req.subjectId}`)) return;
      // Drop duplicate no-teacherId entries for the same (classId, subjectId)
      if (!req.teacherId) {
        const k = `${cls.id}__${req.subjectId}`;
        if (noTeacherSeenKeys.has(k)) return;
        noTeacherSeenKeys.add(k);
      }
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
      // Distribute dayBudget only across days where this teacher pool is available.
      // A teacher available only on Wednesday gets all their budget on Wednesday;
      // unrestricted teachers get budget spread evenly as before.
      const availableDays = activeDayKeys.filter(dk =>
        teacherIds.some(tid => {
          const avMap = teacherAvailability?.[tid] || {};
          return settings.periodTimings.filter(p => !p.isBreak)
            .some(p => avMap[dk]?.[p.period] !== false);
        })
      );
      const daysForBudget = availableDays.length > 0 ? availableDays : activeDayKeys;
      const minPerDay = Math.floor(req.periodsPerWeek / daysForBudget.length);
      const extras    = req.periodsPerWeek % daysForBudget.length;
      const shuffledDayIdxs = shuffle(daysForBudget.map(k => DAY_KEY_TO_IDX[k]));
      const dayBudget = {};
      shuffledDayIdxs.forEach((dayIdx, i) => {
        dayBudget[dayIdx] = minPerDay + (i < extras ? 1 : 0);
      });
      // Count total slots where this teacher pool is available (used for MRV priority).
      // Demands with fewer available slots are scheduled before unconstrained ones.
      const availableSlotCount = activeDayKeys.reduce((sum, dk) => {
        const avail = settings.periodTimings.filter(p => !p.isBreak).filter(p =>
          teacherIds.some(tid => teacherAvailability?.[tid]?.[dk]?.[p.period] !== false)
        ).length;
        return sum + avail;
      }, 0);
      const concurrent = !!(subjectMap[req.subjectId]?.concurrent);
      const notInFirstN = subjectMap[req.subjectId]?.notInFirstN || 0;
      demands.push({ classId: cls.id, subjectId: req.subjectId, teacherIds,
        remaining: req.periodsPerWeek, orGroup, dayBudget, dayCount: {}, concurrent,
        availableSlotCount, availDays: daysForBudget, notInFirstN });
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
  // For concurrent subjects, the same teacher covers multiple classes in ONE slot.
  // Track counted (teacher, day, period) keys so teacherLoad increments only once per slot.
  const concurrentLoadCounted = new Set();

  // ── Concurrent sibling map ──────────────────────────────────────────────────
  // Concurrent subject + same teacher → ALL those class demands must share the EXACT same slot.
  // Map: "subjectId__teacherId" → demand[]
  const concurrentSibMap = {};
  demands.forEach(d => {
    if (!d.concurrent) return;
    d.teacherIds.forEach(tid => {
      const k = `${d.subjectId}__${tid}`;
      if (!concurrentSibMap[k]) concurrentSibMap[k] = [];
      if (!concurrentSibMap[k].find(x => x.classId === d.classId)) concurrentSibMap[k].push(d);
    });
  });
  // Returns true only when every concurrent sibling class is free at (dIdx, p)
  const concSibsFree = (demand, tid, dIdx, p) => {
    if (!demand.concurrent) return true;
    return (concurrentSibMap[`${demand.subjectId}__${tid}`] || []).every(
      s => s.classId === demand.classId || !classBusy.has(`${s.classId}_${dIdx}_${p}`)
    );
  };
  // Place all concurrent sibling classes into the same slot
  const placeConcurrentSibs = (demand, tid, dIdx, p) => {
    if (!demand.concurrent) return;
    for (const sib of (concurrentSibMap[`${demand.subjectId}__${tid}`] || [])) {
      if (sib.classId === demand.classId || sib.remaining <= 0) continue;
      if (classBusy.has(`${sib.classId}_${dIdx}_${p}`)) continue;
      if ((classPeriodSettings[sib.classId]?.blockedPeriods || []).includes(p)) continue;
      schedule.push({ id: `sch_${sib.classId}_${dIdx}_${p}`, classId: sib.classId, day: dIdx, period: p, teacherId: tid, subjectId: sib.subjectId });
      classBusy.add(`${sib.classId}_${dIdx}_${p}`);
      sib.remaining--;
      sib.dayCount[dIdx] = (sib.dayCount[dIdx] || 0) + 1;
    }
  };

  // Daily load per teacher: { tid: { dayIdx: count } } — used to spread periods
  const teacherDayLoad = {};
  teachers.forEach(t => { teacherDayLoad[t.id] = {}; });

  // Compute total periods needed per teacher across all demands
  const teacherTotalDemand = {};
  demands.forEach(d => {
    d.teacherIds.forEach(tid => { teacherTotalDemand[tid] = (teacherTotalDemand[tid] || 0) + d.remaining; });
  });
  // Per-teacher daily limit = ceil(total periods / available days) — soft cap for spread
  const teacherDailyLimit = {};
  teachers.forEach(t => {
    const total = teacherTotalDemand[t.id] || 0;
    if (total === 0) { teacherDailyLimit[t.id] = 1; return; }
    const avDays = activeDayKeys.filter(dk =>
      settings.periodTimings.filter(p => !p.isBreak)
        .some(p => teacherAvailability?.[t.id]?.[dk]?.[p.period] !== false)
    );
    teacherDailyLimit[t.id] = Math.ceil(total / Math.max(1, avDays.length || activeDayKeys.length));
  });

  // Pick best teacher: prefer those below daily limit → lowest day load → lowest total load
  const pickBestTeacher = (pool, dIdx) => {
    const below = pool.filter(tid => (teacherDayLoad[tid]?.[dIdx] || 0) < (teacherDailyLimit[tid] || Infinity));
    const src = below.length > 0 ? below : pool;
    return src.reduce((best, tid) => {
      const db = teacherDayLoad[tid]?.[dIdx] || 0, da = teacherDayLoad[best]?.[dIdx] || 0;
      if (db !== da) return db < da ? tid : best;
      return (teacherLoad[tid] || 0) < (teacherLoad[best] || 0) ? tid : best;
    });
  };
  const bumpDayLoad = (tid, dIdx) => {
    if (!teacherDayLoad[tid]) teacherDayLoad[tid] = {};
    teacherDayLoad[tid][dIdx] = (teacherDayLoad[tid][dIdx] || 0) + 1;
  };

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
      bumpDayLoad(slot.teacherId, slot.day);
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

  // ── Step 3a: PRIORITY PRE-PASS — schedule constrained teachers first ────────
  // Teachers with limited availability (only 1 day, only 2 days, etc.) are placed
  // completely BEFORE unconstrained teachers compete for those slots.
  // Ordered: fewest available slots first → 1-day teachers → 2-day → ... → all-day.
  // Unconstrained teachers (availableSlotCount === totalPossibleSlots) are skipped
  // here and handled by the normal round-robin pass below.
  {
    const totalPossibleSlots = activeDayKeys.length * globalNonBreak.length;
    const constrainedDemands = demands
      .filter(d => d.availableSlotCount < totalPossibleSlots)
      .sort((a, b) => a.availableSlotCount - b.availableSlotCount || b.remaining - a.remaining);

    for (const demand of constrainedDemands) {
      if (demand.remaining <= 0) continue;
      // Skip cross-class synced OR groups — the main pass handles sync logic
      if (demand.orGroup && syncGroupMap[`${demand.classId}__${demand.orGroup}`]?.length > 0) continue;

      // Build a round-robin slot list using ONLY this demand's available days.
      const preDaySlots = {};
      for (const dk of demand.availDays) {
        const di = DAY_KEY_TO_IDX[dk];
        preDaySlots[dk] = shuffle(globalNonBreak.map(p => ({ dayKey: dk, dayIdx: di, period: p })));
      }
      const preMax = demand.availDays.length > 0
        ? Math.max(...demand.availDays.map(dk => preDaySlots[dk].length))
        : 0;
      const preSlots = [];
      for (let r = 0; r < preMax; r++) {
        for (const dk of shuffle([...demand.availDays])) {
          if (r < preDaySlots[dk].length) preSlots.push(preDaySlots[dk][r]);
        }
      }

      for (const { dayKey, dayIdx, period } of preSlots) {
        if (demand.remaining <= 0) break;
        if ((demand.dayCount[dayIdx] || 0) >= (demand.dayBudget[dayIdx] ?? 0)) continue;
        if (classBusy.has(`${demand.classId}_${dayIdx}_${period}`)) continue;
        if ((classPeriodSettings[demand.classId]?.blockedPeriods || []).includes(period)) continue;
        if (demand.notInFirstN > 0 && period <= demand.notInFirstN) continue;

        const freeTeachers = demand.teacherIds.filter(tid =>
          !teacherBusy.has(`${tid}_${dayIdx}_${period}`) &&
          teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
        );
        if (!freeTeachers.length) continue;

        const chosenTeacherId = pickBestTeacher(freeTeachers, dayIdx);
        const teacher = teachers.find(t => t.id === chosenTeacherId);
        if (teacher && teacher.maxPeriods > 0 && (teacherLoad[chosenTeacherId] || 0) >= teacher.maxPeriods) continue;
        // Concurrent: ALL sibling classes must be free at this slot
        if (demand.concurrent && !concSibsFree(demand, chosenTeacherId, dayIdx, period)) continue;

        // Handle non-synced OR group siblings
        let alternatives = null;
        if (demand.orGroup) {
          const key = `${demand.classId}__${demand.orGroup}`;
          const siblings = orGroupIndex[key] || [];
          const allSiblingAlts = siblings.map(sib => {
            const freeSibTeachers = (sib.teacherIds || []).filter(tid =>
              !teacherBusy.has(`${tid}_${dayIdx}_${period}`) &&
              teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
            );
            const chosen = freeSibTeachers.length
              ? pickBestTeacher(freeSibTeachers, dayIdx)
              : null;
            return { subjectId: sib.subjectId, teacherId: chosen, free: !!chosen };
          });
          if (!allSiblingAlts.every(s => s.free)) continue;
          alternatives = allSiblingAlts.map(({ subjectId, teacherId }) => ({ subjectId, teacherId }));
        }

        // ✅ Assign
        schedule.push({
          id: `sch_${demand.classId}_${dayIdx}_${period}`,
          classId: demand.classId, day: dayIdx, period,
          teacherId: chosenTeacherId, subjectId: demand.subjectId,
          alternatives,
        });
        teacherBusy.add(`${chosenTeacherId}_${dayIdx}_${period}`);
        classBusy.add(`${demand.classId}_${dayIdx}_${period}`);
        // Concurrent: only count this slot once even if same teacher covers multiple classes
        const _concKey3a = `${chosenTeacherId}_${dayIdx}_${period}`;
        if (!demand.concurrent || !concurrentLoadCounted.has(_concKey3a)) {
          teacherLoad[chosenTeacherId] = (teacherLoad[chosenTeacherId] || 0) + 1;
          bumpDayLoad(chosenTeacherId, dayIdx);
          if (demand.concurrent) concurrentLoadCounted.add(_concKey3a);
        }
        demand.remaining--;
        demand.dayCount[dayIdx] = (demand.dayCount[dayIdx] || 0) + 1;
        placeConcurrentSibs(demand, chosenTeacherId, dayIdx, period);

        if (demand.orGroup && alternatives) {
          for (const sib of alternatives) {
            if (sib.teacherId === chosenTeacherId) continue;
            teacherBusy.add(`${sib.teacherId}_${dayIdx}_${period}`);
            teacherLoad[sib.teacherId] = (teacherLoad[sib.teacherId] || 0) + 1;
            bumpDayLoad(sib.teacherId, dayIdx);
            const sibDemand = demands.find(
              d => d.classId === demand.classId && d.subjectId === sib.subjectId
            );
            if (sibDemand) sibDemand.remaining--;
          }
        }
      }
    }
  }
  // ── Step 3b: Round-robin slot fill for remaining / unconstrained demands ──

  for (const { dayKey, dayIdx, period } of slots) {
    // Get remaining demands. Sort by: fewest available slots first (MRV — constrained
    // teachers are placed before unrestricted ones), then most-needed, then random.
    const pending = demands
      .filter(d => d.remaining > 0 && (d.dayCount[dayIdx] || 0) < (d.dayBudget[dayIdx] ?? 0))
      .sort((a, b) => a.availableSlotCount - b.availableSlotCount || b.remaining - a.remaining || Math.random() - 0.5);

    // For this slot: pick an independent set — no two picks share a teacher or class
    const usedTeachersThisSlot = new Set();
    const usedClassesThisSlot = new Set();

    for (const demand of pending) {
      if (usedClassesThisSlot.has(demand.classId)) continue;
      if (classBusy.has(`${demand.classId}_${dayIdx}_${period}`)) continue;
      // Skip this slot if the period is blocked for this class
      if ((classPeriodSettings[demand.classId]?.blockedPeriods || []).includes(period)) continue;
      // Skip if subject is restricted from early periods
      if (demand.notInFirstN > 0 && period <= demand.notInFirstN) continue;

      // Pick the best available teacher from the pool.
      // Concurrent subjects skip the teacher-busy check — the same teacher
      // can teach multiple classes simultaneously for this subject.
      const freeTeachers = demand.teacherIds.filter(tid =>
        (demand.concurrent || !teacherBusy.has(`${tid}_${dayIdx}_${period}`)) &&
        (demand.concurrent || !usedTeachersThisSlot.has(tid)) &&
        teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
      );
      if (!freeTeachers.length) continue;

      // Pick lowest-loaded free teacher, preferring spread across days
      const chosenTeacherId = pickBestTeacher(freeTeachers, dayIdx);

      // Check weekly teacher cap
      const teacher = teachers.find(t => t.id === chosenTeacherId);
      if (teacher && teacher.maxPeriods > 0 && (teacherLoad[chosenTeacherId] || 0) >= teacher.maxPeriods) continue;
      // Concurrent: ALL sibling classes must be free at this slot
      if (demand.concurrent && !concSibsFree(demand, chosenTeacherId, dayIdx, period)) continue;

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
            ? pickBestTeacher(freeSibTeachers, dayIdx)
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
      // Concurrent: only count this slot once even if same teacher covers multiple classes
      const _concKey = `${chosenTeacherId}_${dayIdx}_${period}`;
      if (!demand.concurrent || !concurrentLoadCounted.has(_concKey)) {
        teacherLoad[chosenTeacherId] = (teacherLoad[chosenTeacherId] || 0) + 1;
        bumpDayLoad(chosenTeacherId, dayIdx);
        if (demand.concurrent) concurrentLoadCounted.add(_concKey);
      }
      demand.remaining--;
      demand.dayCount[dayIdx] = (demand.dayCount[dayIdx] || 0) + 1;
      placeConcurrentSibs(demand, chosenTeacherId, dayIdx, period);

      // Mark sibling teachers busy
      if (demand.orGroup && alternatives) {
        for (const sib of alternatives) {
          if (sib.teacherId === chosenTeacherId) continue;
          teacherBusy.add(`${sib.teacherId}_${dayIdx}_${period}`);
          usedTeachersThisSlot.add(sib.teacherId);
          teacherLoad[sib.teacherId] = (teacherLoad[sib.teacherId] || 0) + 1;
          bumpDayLoad(sib.teacherId, dayIdx);
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
          if (leaderTeacherObj && leaderTeacherObj.maxPeriods > 0 && (teacherLoad[leaderAlt.teacherId] || 0) >= leaderTeacherObj.maxPeriods) continue;

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

  // ── Step 3c: Relaxed pass — fill any still-unfilled demands ignoring dayBudget ──
  // Runs only when the main pass left demands unfilled (e.g. all budgeted-day slots
  // were claimed by other subjects first). Iterates the same slot list; classBusy
  // prevents double-booking, so this only touches genuinely empty class slots.
  if (demands.some(d => d.remaining > 0)) {
    for (const { dayKey, dayIdx, period } of slots) {
      const pending2 = demands
        .filter(d => d.remaining > 0)   // no dayBudget restriction
        .sort((a, b) => a.availableSlotCount - b.availableSlotCount || b.remaining - a.remaining || Math.random() - 0.5);
      if (!pending2.length) break;

      const usedTeachersThisSlot = new Set();
      const usedClassesThisSlot = new Set();

      for (const demand of pending2) {
        if (usedClassesThisSlot.has(demand.classId)) continue;
        if (classBusy.has(`${demand.classId}_${dayIdx}_${period}`)) continue;
        if ((classPeriodSettings[demand.classId]?.blockedPeriods || []).includes(period)) continue;
        if (demand.notInFirstN > 0 && period <= demand.notInFirstN) continue;

        const freeTeachers = demand.teacherIds.filter(tid =>
          (demand.concurrent || !teacherBusy.has(`${tid}_${dayIdx}_${period}`)) &&
          (demand.concurrent || !usedTeachersThisSlot.has(tid)) &&
          teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
        );
        if (!freeTeachers.length) continue;

        const chosenTeacherId = pickBestTeacher(freeTeachers, dayIdx);
        const teacher = teachers.find(t => t.id === chosenTeacherId);
        if (teacher && teacher.maxPeriods > 0 && (teacherLoad[chosenTeacherId] || 0) >= teacher.maxPeriods) continue;
        // Concurrent: ALL sibling classes must be free at this slot
        if (demand.concurrent && !concSibsFree(demand, chosenTeacherId, dayIdx, period)) continue;

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
              ? pickBestTeacher(freeSibTeachers, dayIdx)
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
        bumpDayLoad(chosenTeacherId, dayIdx);
        demand.remaining--;
        demand.dayCount[dayIdx] = (demand.dayCount[dayIdx] || 0) + 1;
        placeConcurrentSibs(demand, chosenTeacherId, dayIdx, period);

        if (demand.orGroup && alternatives) {
          for (const sib of alternatives) {
            if (sib.teacherId === chosenTeacherId) continue;
            teacherBusy.add(`${sib.teacherId}_${dayIdx}_${period}`);
            usedTeachersThisSlot.add(sib.teacherId);
            teacherLoad[sib.teacherId] = (teacherLoad[sib.teacherId] || 0) + 1;
            bumpDayLoad(sib.teacherId, dayIdx);
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
            if (leaderTeacherObj && leaderTeacherObj.maxPeriods > 0 && (teacherLoad[leaderAlt.teacherId] || 0) >= leaderTeacherObj.maxPeriods) continue;

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

  // ── Step 3c: Cleanup pass — exhaustive placement of still-remaining demands ─
  // The round-robin pass uses a soft day-spread budget and picks a maximal
  // independent set per slot, which can leave valid slots unfilled.
  // This pass ignores the day-budget and processes each remaining demand against
  // every slot so that only genuine hard conflicts (teacher unavailable / at cap /
  // class or teacher already busy / blocked period) prevent assignment.
  for (const demand of demands.filter(d => d.remaining > 0)) {
    for (const { dayKey, dayIdx, period } of slots) {
      if (demand.remaining <= 0) break;
      if (classBusy.has(`${demand.classId}_${dayIdx}_${period}`)) continue;
      if ((classPeriodSettings[demand.classId]?.blockedPeriods || []).includes(period)) continue;
      if (demand.notInFirstN > 0 && period <= demand.notInFirstN) continue;

      const freeTeachers = demand.teacherIds.filter(tid =>
        (demand.concurrent || !teacherBusy.has(`${tid}_${dayIdx}_${period}`)) &&
        teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
      );
      if (!freeTeachers.length) continue;

      const chosenTeacherId = pickBestTeacher(freeTeachers, dayIdx);
      const teacher = teachers.find(t => t.id === chosenTeacherId);
      if (teacher && teacher.maxPeriods > 0 && (teacherLoad[chosenTeacherId] || 0) >= teacher.maxPeriods) continue;
      // Concurrent: ALL sibling classes must be free at this slot
      if (demand.concurrent && !concSibsFree(demand, chosenTeacherId, dayIdx, period)) continue;

      // OR group: all siblings must also have a free teacher for this slot
      let alternatives = null;
      if (demand.orGroup) {
        const key = `${demand.classId}__${demand.orGroup}`;
        const siblings = orGroupIndex[key] || [];
        const allSiblingAlts = siblings.map(sib => {
          const freeSibTeachers = (sib.teacherIds || []).filter(tid =>
            !teacherBusy.has(`${tid}_${dayIdx}_${period}`) &&
            teacherAvailability?.[tid]?.[dayKey]?.[period] !== false
          );
          const chosen = freeSibTeachers.length ? pickBestTeacher(freeSibTeachers, dayIdx) : null;
          return { subjectId: sib.subjectId, teacherId: chosen, free: !!chosen };
        });
        if (!allSiblingAlts.every(s => s.free)) continue;
        alternatives = allSiblingAlts.map(({ subjectId, teacherId }) => ({ subjectId, teacherId }));
      }

      // ✅ Assign
      schedule.push({
        id: `sch_${demand.classId}_${dayIdx}_${period}`,
        classId: demand.classId, day: dayIdx, period,
        teacherId: chosenTeacherId, subjectId: demand.subjectId,
        alternatives,
      });
      teacherBusy.add(`${chosenTeacherId}_${dayIdx}_${period}`);
      classBusy.add(`${demand.classId}_${dayIdx}_${period}`);
      const _cKey = `${chosenTeacherId}_${dayIdx}_${period}`;
      if (!demand.concurrent || !concurrentLoadCounted.has(_cKey)) {
        teacherLoad[chosenTeacherId] = (teacherLoad[chosenTeacherId] || 0) + 1;
        bumpDayLoad(chosenTeacherId, dayIdx);
        if (demand.concurrent) concurrentLoadCounted.add(_cKey);
      }
      demand.remaining--;
      demand.dayCount[dayIdx] = (demand.dayCount[dayIdx] || 0) + 1;
      placeConcurrentSibs(demand, chosenTeacherId, dayIdx, period);

      if (demand.orGroup && alternatives) {
        for (const sib of alternatives) {
          if (sib.teacherId === chosenTeacherId) continue;
          teacherBusy.add(`${sib.teacherId}_${dayIdx}_${period}`);
          teacherLoad[sib.teacherId] = (teacherLoad[sib.teacherId] || 0) + 1;
          bumpDayLoad(sib.teacherId, dayIdx);
          const sibDemand = demands.find(d => d.classId === demand.classId && d.subjectId === sib.subjectId);
          if (sibDemand) sibDemand.remaining--;
        }

        // ── Cross-class OR sync (cleanup pass) ──
        const syncClsIds = syncGroupMap[`${demand.classId}__${demand.orGroup}`] || [];
        for (const syncCid of syncClsIds) {
          if (classBusy.has(`${syncCid}_${dayIdx}_${period}`)) continue;
          if ((classPeriodSettings[syncCid]?.blockedPeriods || []).includes(period)) continue;

          let syncLeaderDemand = demands.find(d => d.classId === syncCid && d.orGroup === demand.orGroup && d.remaining > 0);
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
          if (leaderTeacherObj && leaderTeacherObj.maxPeriods > 0 && (teacherLoad[leaderAlt.teacherId] || 0) >= leaderTeacherObj.maxPeriods) continue;

          schedule.push({
            id: `sch_${syncCid}_${dayIdx}_${period}`,
            classId: syncCid, day: dayIdx, period,
            teacherId: leaderAlt.teacherId, subjectId: leaderAlt.subjectId,
            alternatives: syncAlts.map(({ subjectId, teacherId }) => ({ subjectId, teacherId })),
          });
          teacherBusy.add(`${leaderAlt.teacherId}_${dayIdx}_${period}`);
          classBusy.add(`${syncCid}_${dayIdx}_${period}`);
          teacherLoad[leaderAlt.teacherId] = (teacherLoad[leaderAlt.teacherId] || 0) + 1;
          syncLeaderDemand.remaining--;
          syncLeaderDemand.dayCount[dayIdx] = (syncLeaderDemand.dayCount[dayIdx] || 0) + 1;

          for (const syncSib of syncAlts) {
            if (syncSib.subjectId === leaderAlt.subjectId) continue;
            if (syncSib.teacherId === leaderAlt.teacherId) continue;
            teacherBusy.add(`${syncSib.teacherId}_${dayIdx}_${period}`);
            teacherLoad[syncSib.teacherId] = (teacherLoad[syncSib.teacherId] || 0) + 1;
            const syncSibDemand = demands.find(d => d.classId === syncCid && d.subjectId === syncSib.subjectId);
            if (syncSibDemand) syncSibDemand.remaining--;
          }
        }
      }
    }
  }

  // ── Step 3d: Slot filler — fill remaining empty class slots ──────────────
  // After all configured demands are placed, any class slot still empty is
  // filled using "flexible" subjects: teacher has NO availability restrictions,
  // subject is NOT concurrent and NOT in an OR group.  These can repeat beyond
  // their configured periodsPerWeek because the slot would otherwise be wasted.
  // Preference goes to the least-scheduled subject in that class (variety).
  {
    // Build per-class list of fill-eligible assignments (subjectId + teacherIds).
    // Concurrent subjects are skip (they are demand-driven, not filler).
    // OR-group subjects are skipped (they need sibling coordination).
    // Per-slot availability is checked inside the candidates loop below.
    const flexPool = {};
    targetClasses.forEach(cls => {
      const entries = classAssignments
        .filter(a => a.classId === cls.id)
        .flatMap(a => {
          const sub = subjects.find(s => s.id === a.subjectId);
          if (!sub || sub.concurrent) return [];
          if (subjectOrGroupLabel[`${cls.id}__${a.subjectId}`]) return [];
          const tids = a.teacherIds?.length ? a.teacherIds : (a.teacherId ? [a.teacherId] : []);
          if (!tids.length) return [];
          return [{ subjectId: a.subjectId, teacherIds: tids }];
        });
      if (entries.length) flexPool[cls.id] = entries;
    });

    // Track how many times each (class, subject) appears in the schedule so far
    const slotCount = {};
    schedule.forEach(s => {
      const k = `${s.classId}__${s.subjectId}`;
      slotCount[k] = (slotCount[k] || 0) + 1;
    });

    for (const { dayKey, dayIdx, period } of slots) {
      for (const cls of targetClasses) {
        if (classBusy.has(`${cls.id}_${dayIdx}_${period}`)) continue;
        if ((classPeriodSettings[cls.id]?.blockedPeriods || []).includes(period)) continue;
        const pool = flexPool[cls.id];
        if (!pool?.length) continue;

        // Among flexible assignments, find those with a free teacher under cap
        const candidates = pool.flatMap(fa => {
          const subNotInFirstN = subjects.find(s => s.id === fa.subjectId)?.notInFirstN || 0;
          if (subNotInFirstN > 0 && period <= subNotInFirstN) return [];
          const freeTids = fa.teacherIds.filter(tid =>
            !teacherBusy.has(`${tid}_${dayIdx}_${period}`) &&
            teacherAvailability?.[tid]?.[dayKey]?.[period] !== false &&
            (teacherLoad[tid] || 0) < (teachers.find(t => t.id === tid)?.maxPeriods || Infinity)
          );
          return freeTids.length ? [{ subjectId: fa.subjectId, freeTids }] : [];
        });
        if (!candidates.length) continue;

        // Pick subject with lowest schedule count for this class (variety)
        candidates.sort((a, b) =>
          (slotCount[`${cls.id}__${a.subjectId}`] || 0) -
          (slotCount[`${cls.id}__${b.subjectId}`] || 0)
        );
        const chosen = candidates[0];
        const chosenTid = pickBestTeacher(chosen.freeTids, dayIdx);

        schedule.push({
          id: `sch_${cls.id}_${dayIdx}_${period}`,
          classId: cls.id, day: dayIdx, period,
          teacherId: chosenTid, subjectId: chosen.subjectId,
        });
        teacherBusy.add(`${chosenTid}_${dayIdx}_${period}`);
        classBusy.add(`${cls.id}_${dayIdx}_${period}`);
        teacherLoad[chosenTid] = (teacherLoad[chosenTid] || 0) + 1;
        bumpDayLoad(chosenTid, dayIdx);
        const k = `${cls.id}__${chosen.subjectId}`;
        slotCount[k] = (slotCount[k] || 0) + 1;
      }
    }
  }

  // ── Step 5: Post-generation repair pass ───────────────────────────────────
  // Scan all generated (non-locked) slots for hard constraint violations and
  // sync issues. Attempt to fix by swapping within the same class.
  //
  // Violations checked:
  //   (a) notInFirstN      — subject placed in a restricted early period
  //   (b) teacherUnavail   — teacher marked unavailable at that slot
  //   (c) blockedPeriod    — class has this period blocked
  //   (d) altTeacherUnavail — OR-group alternative teacher unavailable
  //   (e) concurrent misalignment — sibling classes not at same day+period
  //   (f) OR-group cross-class sync — synced classes have group at different slots
  {
    const IDX_TO_DAY_KEY = Object.fromEntries(
      Object.entries(DAY_KEY_TO_IDX).map(([k, v]) => [v, k])
    );

    // Returns the first violated constraint for a slot, or null if clean
    const getViolation = (slot) => {
      const dayKey = IDX_TO_DAY_KEY[slot.day];
      const sub = subjects.find(s => s.id === slot.subjectId);
      if (sub?.notInFirstN > 0 && slot.period <= sub.notInFirstN) return 'notInFirstN';
      if (slot.teacherId && teacherAvailability?.[slot.teacherId]?.[dayKey]?.[slot.period] === false) return 'teacherUnavail';
      if ((classPeriodSettings[slot.classId]?.blockedPeriods || []).includes(slot.period)) return 'blockedPeriod';
      if (slot.alternatives) {
        for (const alt of slot.alternatives) {
          if (alt.teacherId && teacherAvailability?.[alt.teacherId]?.[dayKey]?.[slot.period] === false) return 'altTeacherUnavail';
        }
      }
      return null;
    };

    const isConcurrent = (subjectId) => !!(subjects.find(s => s.id === subjectId)?.concurrent);

    // Build position maps: teacher/class → schedule index
    // Concurrent teacher slots are excluded from tMap (they can share)
    const buildMaps = () => {
      const tMap = new Map(); // `${tid}_${day}_${period}` → idx
      const cMap = new Map(); // `${classId}_${day}_${period}` → idx
      schedule.forEach((s, idx) => {
        cMap.set(`${s.classId}_${s.day}_${s.period}`, idx);
        if (s.teacherId && !isConcurrent(s.subjectId)) tMap.set(`${s.teacherId}_${s.day}_${s.period}`, idx);
        (s.alternatives || []).forEach(alt => {
          if (alt.teacherId) tMap.set(`${alt.teacherId}_${s.day}_${s.period}`, idx);
        });
      });
      return { tMap, cMap };
    };

    let { tMap, cMap } = buildMaps();

    // ── (a-d) Hard constraint repair: swap violating slot with a partner in same class ──
    for (let i = 0; i < schedule.length; i++) {
      const slot = schedule[i];
      if (lockedSlotIds.has(slot.id)) continue;
      const violation = getViolation(slot);
      if (!violation) continue;

      let fixed = false;
      for (let j = 0; j < schedule.length; j++) {
        if (i === j) continue;
        const partner = schedule[j];
        if (partner.classId !== slot.classId) continue;
        if (lockedSlotIds.has(partner.id)) continue;

        // Build the swapped versions
        const slotAt   = { ...slot,    day: partner.day, period: partner.period, id: `sch_${slot.classId}_${partner.day}_${partner.period}` };
        const partnerAt = { ...partner, day: slot.day,    period: slot.period,    id: `sch_${partner.classId}_${slot.day}_${slot.period}` };

        // Both sides must be constraint-clean after the swap
        if (getViolation(slotAt) || getViolation(partnerAt)) continue;

        // Check teacher cross-class conflicts for non-concurrent subjects
        const slotConc    = isConcurrent(slot.subjectId);
        const partnerConc = isConcurrent(partner.subjectId);

        // slot.teacher moving to partner's position — must not conflict with another class
        if (!slotConc && slot.teacherId) {
          const key = `${slot.teacherId}_${partner.day}_${partner.period}`;
          if (tMap.has(key) && tMap.get(key) !== j) continue;
        }
        // partner.teacher moving to slot's position — must not conflict with another class
        if (!partnerConc && partner.teacherId) {
          const key = `${partner.teacherId}_${slot.day}_${slot.period}`;
          if (tMap.has(key) && tMap.get(key) !== i) continue;
        }
        // Also check all OR-group alternative teachers
        let altConflict = false;
        for (const alt of (slot.alternatives || [])) {
          if (alt.teacherId) {
            const key = `${alt.teacherId}_${partner.day}_${partner.period}`;
            if (tMap.has(key) && tMap.get(key) !== j) { altConflict = true; break; }
          }
        }
        if (altConflict) continue;
        for (const alt of (partner.alternatives || [])) {
          if (alt.teacherId) {
            const key = `${alt.teacherId}_${slot.day}_${slot.period}`;
            if (tMap.has(key) && tMap.get(key) !== i) { altConflict = true; break; }
          }
        }
        if (altConflict) continue;

        // ✅ Valid swap — apply it
        schedule[i] = slotAt;
        schedule[j] = partnerAt;

        // Update cMap
        cMap.delete(`${slot.classId}_${slot.day}_${slot.period}`);
        cMap.delete(`${partner.classId}_${partner.day}_${partner.period}`);
        cMap.set(`${slot.classId}_${partner.day}_${partner.period}`, i);
        cMap.set(`${partner.classId}_${slot.day}_${slot.period}`, j);

        // Update tMap for primary teachers
        if (!slotConc && slot.teacherId) {
          tMap.delete(`${slot.teacherId}_${slot.day}_${slot.period}`);
          tMap.set(`${slot.teacherId}_${partner.day}_${partner.period}`, i);
        }
        if (!partnerConc && partner.teacherId) {
          tMap.delete(`${partner.teacherId}_${partner.day}_${partner.period}`);
          tMap.set(`${partner.teacherId}_${slot.day}_${slot.period}`, j);
        }
        // Update tMap for OR-group alternatives
        (slot.alternatives || []).forEach(alt => {
          if (alt.teacherId) {
            tMap.delete(`${alt.teacherId}_${slot.day}_${slot.period}`);
            tMap.set(`${alt.teacherId}_${partner.day}_${partner.period}`, i);
          }
        });
        (partner.alternatives || []).forEach(alt => {
          if (alt.teacherId) {
            tMap.delete(`${alt.teacherId}_${partner.day}_${partner.period}`);
            tMap.set(`${alt.teacherId}_${slot.day}_${slot.period}`, j);
          }
        });

        fixed = true;
        break;
      }

      if (!fixed) {
        const sub = subjects.find(s => s.id === slot.subjectId);
        const cls = classes.find(c => c.id === slot.classId);
        warnings.push(`⚠ Repair failed: ${cls?.name} – ${sub?.name} at ${IDX_TO_DAY_KEY[slot.day]} P${slot.period} (${violation}). No valid swap found.`);
      }
    }

    // ── (e) Concurrent subject alignment ─────────────────────────────────────
    // All slots for the same concurrent subject+teacher must be at the same day+period.
    const concGroups = {};
    schedule.forEach((s, idx) => {
      if (!isConcurrent(s.subjectId) || !s.teacherId) return;
      const key = `${s.subjectId}__${s.teacherId}`;
      (concGroups[key] = concGroups[key] || []).push(idx);
    });

    for (const indices of Object.values(concGroups)) {
      if (indices.length <= 1) continue;
      // Group by position
      const posMap = {};
      indices.forEach(idx => {
        const s = schedule[idx];
        const k = `${s.day}_${s.period}`;
        (posMap[k] = posMap[k] || []).push(idx);
      });
      if (Object.keys(posMap).length === 1) continue; // already aligned ✓

      // Align all to the position held by the largest group
      const [targetKey, ] = Object.entries(posMap).sort((a, b) => b[1].length - a[1].length)[0];
      const [targetDay, targetPeriod] = targetKey.split('_').map(Number);
      const targetDayKey = IDX_TO_DAY_KEY[targetDay];

      for (const [posKey, idxList] of Object.entries(posMap)) {
        if (posKey === targetKey) continue;
        for (const idx of idxList) {
          if (lockedSlotIds.has(schedule[idx].id)) continue;
          const slot = schedule[idx];

          // If target position is occupied by another (non-concurrent) slot for this class, try to swap it out
          const blockKey = `${slot.classId}_${targetDay}_${targetPeriod}`;
          if (cMap.has(blockKey) && cMap.get(blockKey) !== idx) {
            const bIdx = cMap.get(blockKey);
            const blocker = schedule[bIdx];
            if (!lockedSlotIds.has(blocker.id)) {
              const blockerMoved = { ...blocker, day: slot.day, period: slot.period, id: `sch_${blocker.classId}_${slot.day}_${slot.period}` };
              if (!getViolation(blockerMoved)) {
                schedule[bIdx] = blockerMoved;
                cMap.delete(blockKey);
                cMap.set(`${blocker.classId}_${slot.day}_${slot.period}`, bIdx);
                if (!isConcurrent(blocker.subjectId) && blocker.teacherId) {
                  tMap.delete(`${blocker.teacherId}_${targetDay}_${targetPeriod}`);
                  tMap.set(`${blocker.teacherId}_${slot.day}_${slot.period}`, bIdx);
                }
              } else { continue; }
            } else { continue; }
          }

          const moved = { ...slot, day: targetDay, period: targetPeriod, id: `sch_${slot.classId}_${targetDay}_${targetPeriod}` };
          if (getViolation(moved)) { continue; }

          schedule[idx] = moved;
          cMap.delete(`${slot.classId}_${slot.day}_${slot.period}`);
          cMap.set(`${slot.classId}_${targetDay}_${targetPeriod}`, idx);
          // Concurrent teacher not in tMap, so no tMap update needed
        }
      }
    }

    // ── (f) OR-group cross-class sync alignment ───────────────────────────────
    // Detect OR group slots that are synced across classes but landed on different
    // day+period slots. Align them to the most common position.
    // Build reference positions from contextSchedule (existing other-class slots during
    // single-class regeneration) so Step 5c aligns to the already-placed positions.
    const contextOrPositions = {}; // label → { `day_period` → count }
    (contextSchedule || []).forEach(slot => {
      if (!slot.alternatives || slot.alternatives.length < 2) return;
      const classGroups = classOrGroups[slot.classId] || [];
      const matched = classGroups.find(g =>
        g.subjectIds.includes(slot.subjectId) ||
        g.subjectIds.some(sid => slot.alternatives.some(a => a.subjectId === sid))
      );
      if (!matched) return;
      if (!contextOrPositions[matched.label]) contextOrPositions[matched.label] = {};
      const k = `${slot.day}_${slot.period}`;
      contextOrPositions[matched.label][k] = (contextOrPositions[matched.label][k] || 0) + 1;
    });

    const orSyncGroups = {}; // groupLabel → [slotIdx]
    schedule.forEach((slot, idx) => {
      if (!slot.alternatives || slot.alternatives.length < 2) return;
      const classGroups = classOrGroups[slot.classId] || [];
      const matched = classGroups.find(g =>
        g.subjectIds.includes(slot.subjectId) ||
        g.subjectIds.some(sid => slot.alternatives.some(a => a.subjectId === sid))
      );
      if (!matched) return;
      // Only care if this label appears in another class too
      const synced = Object.entries(classOrGroups).some(
        ([cid, gs]) => cid !== slot.classId && gs.some(g => g.label === matched.label)
      );
      if (!synced) return;
      (orSyncGroups[matched.label] = orSyncGroups[matched.label] || []).push(idx);
    });

    for (const [label, indices] of Object.entries(orSyncGroups)) {
      if (indices.length <= 1) continue;
      const posMap = {};
      indices.forEach(idx => {
        const s = schedule[idx];
        const k = `${s.day}_${s.period}`;
        (posMap[k] = posMap[k] || []).push(idx);
      });
      if (Object.keys(posMap).length === 1) continue; // already synced ✓

      // Prefer the position that already exists in contextSchedule (other classes);
      // fallback to the position held by the largest group in this schedule.
      const ctxPos = contextOrPositions[label] || {};
      const [targetKey, ] = Object.entries(posMap).sort((a, b) => {
        const aCtx = ctxPos[a[0]] || 0;
        const bCtx = ctxPos[b[0]] || 0;
        if (bCtx !== aCtx) return bCtx - aCtx;
        return b[1].length - a[1].length;
      })[0];
      const [targetDay, targetPeriod] = targetKey.split('_').map(Number);
      const targetDayKey = IDX_TO_DAY_KEY[targetDay];

      for (const [posKey, idxList] of Object.entries(posMap)) {
        if (posKey === targetKey) continue;
        for (const idx of idxList) {
          if (lockedSlotIds.has(schedule[idx].id)) continue;
          const slot = schedule[idx];

          const moved = { ...slot, day: targetDay, period: targetPeriod, id: `sch_${slot.classId}_${targetDay}_${targetPeriod}` };
          if (getViolation(moved)) continue;

          // Target position must be free for this class — displace blocker if possible
          const blockKey = `${slot.classId}_${targetDay}_${targetPeriod}`;
          if (cMap.has(blockKey) && cMap.get(blockKey) !== idx) {
            const bIdx = cMap.get(blockKey);
            const blocker = schedule[bIdx];
            if (!lockedSlotIds.has(blocker.id)) {
              const blockerMoved = { ...blocker, day: slot.day, period: slot.period, id: `sch_${blocker.classId}_${slot.day}_${slot.period}` };
              if (!getViolation(blockerMoved)) {
                schedule[bIdx] = blockerMoved;
                cMap.delete(blockKey);
                cMap.set(`${blocker.classId}_${slot.day}_${slot.period}`, bIdx);
                if (blocker.teacherId && !isConcurrent(blocker.subjectId)) {
                  tMap.delete(`${blocker.teacherId}_${targetDay}_${targetPeriod}`);
                  tMap.set(`${blocker.teacherId}_${slot.day}_${slot.period}`, bIdx);
                }
                (blocker.alternatives || []).forEach(alt => {
                  if (alt.teacherId) {
                    tMap.delete(`${alt.teacherId}_${targetDay}_${targetPeriod}`);
                    tMap.set(`${alt.teacherId}_${slot.day}_${slot.period}`, bIdx);
                  }
                });
              } else { continue; }
            } else { continue; }
          }

          // All alternative teachers must be free at the target slot
          let altConflict = false;
          for (const alt of (slot.alternatives || [])) {
            if (alt.teacherId) {
              const key = `${alt.teacherId}_${targetDay}_${targetPeriod}`;
              if (tMap.has(key) && tMap.get(key) !== idx) { altConflict = true; break; }
            }
          }
          if (altConflict) continue;

          // ✅ Move
          schedule[idx] = moved;
          cMap.delete(`${slot.classId}_${slot.day}_${slot.period}`);
          cMap.set(`${slot.classId}_${targetDay}_${targetPeriod}`, idx);
          if (slot.teacherId) {
            tMap.delete(`${slot.teacherId}_${slot.day}_${slot.period}`);
            tMap.set(`${slot.teacherId}_${targetDay}_${targetPeriod}`, idx);
          }
          (slot.alternatives || []).forEach(alt => {
            if (alt.teacherId) {
              tMap.delete(`${alt.teacherId}_${slot.day}_${slot.period}`);
              tMap.set(`${alt.teacherId}_${targetDay}_${targetPeriod}`, idx);
            }
          });
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
  const { teachers, classes, subjects, classAssignments = [], schedule = [] } = state;

  const targetClasses = selectedClassIds
    ? classes.filter(c => selectedClassIds.includes(c.id))
    : classes;

  // Per subject — collect all demands and assigned teachers
  const subjectData = {};
  subjects.forEach(sub => { subjectData[sub.id] = { totalPeriods: 0, teacherPeriods: {}, teacherClasses: {} }; });

  // Cross-subject total load per teacher (assignment-based — may be overridden below)
  const teacherTotalPeriods = {};

  // Both OR-group subjects and concurrent subjects are taught in a shared slot across
  // divisions — count each (teacher, subject) pair once using the MAX configured value.
  const allOrGroupSubjectIds = new Set(
    Object.values(state.classOrGroups || {}).flatMap(groups => groups.flatMap(g => g.subjectIds))
  );
  const concurrentSubjectIds = new Set(subjects.filter(s => s.concurrent).map(s => s.id));
  const syncedSubjectIds = new Set([...allOrGroupSubjectIds, ...concurrentSubjectIds]);

  // Pre-pass: find the MAX configured periodsPerWeek per (teacher, synced-subject)
  // across all divisions so iteration order never affects the result.
  const syncedMaxPeriods = {}; // "tid__subjectId" -> max share
  if (syncedSubjectIds.size > 0) {
    targetClasses.forEach(cls => {
      (classSubjectMap[cls.id] || []).forEach(req => {
        if (!syncedSubjectIds.has(req.subjectId) || req.periodsPerWeek <= 0) return;
        const asgn = classAssignments.find(a => a.classId === cls.id && a.subjectId === req.subjectId);
        if (!asgn) return;
        const tids = asgn.teacherIds?.length ? asgn.teacherIds : (asgn.teacherId ? [asgn.teacherId] : []);
        tids.forEach(tid => {
          const key = `${tid}__${req.subjectId}`;
          const share = req.periodsPerWeek / tids.length;
          syncedMaxPeriods[key] = Math.max(syncedMaxPeriods[key] || 0, share);
        });
      });
    });
  }

  const syncedTeacherSubjectCounted = new Set(); // "tid__subjectId"

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
        const isSynced = syncedSubjectIds.has(req.subjectId);
        tids.forEach(tid => {
          const share = req.periodsPerWeek / tids.length;
          // Synced subjects (concurrent or OR group): each teacher physically occupies one
          // shared slot regardless of how many divisions — count once per (teacher, subject)
          // using the MAX configured value across all divisions.
          if (!isSynced || !syncedTeacherSubjectCounted.has(`${tid}__${req.subjectId}`)) {
            const periodsToAdd = isSynced
              ? (syncedMaxPeriods[`${tid}__${req.subjectId}`] || share)
              : share;
            sd.teacherPeriods[tid] = (sd.teacherPeriods[tid] || 0) + periodsToAdd;
            teacherTotalPeriods[tid] = (teacherTotalPeriods[tid] || 0) + periodsToAdd;
            if (isSynced) syncedTeacherSubjectCounted.add(`${tid}__${req.subjectId}`);
          }
          if (!sd.teacherClasses[tid]) sd.teacherClasses[tid] = [];
          if (!sd.teacherClasses[tid].includes(cls.name)) sd.teacherClasses[tid].push(cls.name);
        });
      }
    });
  });

  // ── If the timetable has been generated, override loads with actual unique
  // (day, period) counts per teacher. This correctly handles concurrent subjects
  // where the same teacher covers multiple classes in the same slot — counting
  // it once instead of once-per-class.
  if (schedule.length > 0) {
    const teacherSlotSets   = {};  // { tid: Set("day_period") }
    const teacherSubjSlots  = {};  // { "tid__subjectId": Set("day_period") }

    schedule.forEach(({ teacherId: tid, subjectId, day, period }) => {
      if (!tid) return;
      const key = `${day}_${period}`;
      if (!teacherSlotSets[tid]) teacherSlotSets[tid] = new Set();
      teacherSlotSets[tid].add(key);
      if (subjectId) {
        const sk = `${tid}__${subjectId}`;
        if (!teacherSubjSlots[sk]) teacherSubjSlots[sk] = new Set();
        teacherSubjSlots[sk].add(key);
      }
    });

    // Override cross-subject totals with schedule-based unique counts
    Object.entries(teacherSlotSets).forEach(([tid, slots]) => {
      teacherTotalPeriods[tid] = slots.size;
    });

    // Override per-subject teacher periods
    subjects.forEach(sub => {
      if (!subjectData[sub.id]) return;
      const sd = subjectData[sub.id];
      Object.keys(sd.teacherPeriods).forEach(tid => {
        const slots = teacherSubjSlots[`${tid}__${sub.id}`];
        if (slots) sd.teacherPeriods[tid] = slots.size;
      });
    });
  }

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
    const clsAssignments = assignments.filter(a => a.classId === cls.id && a.subjectId);

    // Set of subjectIds that still have valid assignments for this class
    const assignedSubjectIds = new Set(clsAssignments.map(a => a.subjectId));

    // Set of subjectIds that are now configured as multi-teacher
    const multiTeacherSubjectIds = new Set(
      clsAssignments
        .filter(a => (a.teacherIds?.length ?? 0) > 1)
        .map(a => a.subjectId)
    );

    // Clean existing entries:
    //   - drop orphaned subjects (no longer assigned to this class)
    //   - drop old single/no-teacher entries for subjects now using multi-teacher
    //   - drop per-teacher entries whose teacher is no longer in the current assignment
    const filteredExisting = existing.filter(r => {
      if (!assignedSubjectIds.has(r.subjectId)) return false;          // orphaned
      if (multiTeacherSubjectIds.has(r.subjectId) && !r.teacherId) return false; // stale
      if (r.teacherId) {
        const asgn = clsAssignments.find(a => a.subjectId === r.subjectId);
        const validIds = asgn?.teacherIds?.length ? asgn.teacherIds : (asgn?.teacherId ? [asgn.teacherId] : []);
        if (!validIds.includes(r.teacherId)) return false;             // teacher no longer assigned
      }
      return true;
    });

    // Build a set of "subjectId__teacherId" keys already present
    const existingKeys = new Set(filteredExisting.map(r => r.teacherId ? `${r.subjectId}__${r.teacherId}` : r.subjectId));

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
        // Only add a no-teacherId entry if no per-teacher entry already exists for this subject
        const hasPTEntry = filteredExisting.some(r => r.subjectId === a.subjectId && r.teacherId);
        if (!existingKeys.has(a.subjectId) && !hasPTEntry) {
          newEntries.push({ subjectId: a.subjectId, periodsPerWeek: 0 });
        }
      }
    });
    // Deduplicate: keep only the first no-teacherId entry per subjectId
    const seenNoTeacher = new Set();
    const deduped = [...filteredExisting, ...newEntries].filter(r => {
      if (r.teacherId) return true;
      if (seenNoTeacher.has(r.subjectId)) return false;
      seenNoTeacher.add(r.subjectId);
      return true;
    });
    merged[cls.id] = deduped;
  });
  return merged;
}
