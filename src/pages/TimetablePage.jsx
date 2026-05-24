import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../store/AppStore';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { checkConflict } from '../utils/engine';
import { generateTimetable } from '../utils/generator';
import { CheckCircle2, AlertCircle, Wand2, Lock, Unlock, X, User, Printer, Trash2, BookmarkPlus, History, RotateCcw } from 'lucide-react';

const DAY_NAMES = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday' };
const DAY_IDX  = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5 };

export default function TimetablePage() {
  const { state, dispatch } = useApp();
  const { can, session } = useAuth();
  const navigate = useNavigate();
  const canEdit = can('editTimetable');
  const {
    settings, schedule, teachers, subjects, classes, school,
    lockedSlots = [], classAssignments = [], teacherAvailability = {},
    classPeriodSettings = {}
  } = state;

  const [viewMode,       setViewMode]       = useState(() => localStorage.getItem('tt_view_mode') || 'class');
  const [selectedClass,  setSelectedClass]  = useState('');
  const [selectedTeacher,setSelectedTeacher]= useState('');
  const [editing,        setEditing]        = useState(null);   // { classId, dayKey, period }
  const [conflict,       setConflict]       = useState(null);
  const [showPrintModal,    setShowPrintModal]    = useState(false);
  const [printClassIds,     setPrintClassIds]     = useState([]);
  const [printTeacherIds,   setPrintTeacherIds]   = useState([]);
  const [confirmClear,      setConfirmClear]      = useState(null); // classId to clear, or null
  const [showSaveModal,     setShowSaveModal]     = useState(false);
  const [snapName,          setSnapName]          = useState('');
  const [snapDesc,          setSnapDesc]          = useState('');
  const [showHistoryModal,  setShowHistoryModal]  = useState(false);
  const [restoringId,       setRestoringId]       = useState(null);
  const [regenerating,      setRegenerating]      = useState(false);

  // Sort classes numerically by grade, then section alphabetically
  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => {
      const ga = parseInt(a.grade, 10) || 0;
      const gb = parseInt(b.grade, 10) || 0;
      if (ga !== gb) return ga - gb;
      return (a.section || '').localeCompare(b.section || '');
    });
  }, [classes]);

  // Persist view mode
  useEffect(() => { localStorage.setItem('tt_view_mode', viewMode); }, [viewMode]);

  // Persist & restore selectedClass
  const classInitRef = useRef(false);
  useEffect(() => {
    if (sortedClasses.length === 0) return;
    if (!classInitRef.current) {
      classInitRef.current = true;
      const stored = localStorage.getItem('tt_selected_class');
      const valid = stored && sortedClasses.find(c => c.id === stored);
      setSelectedClass(valid ? stored : sortedClasses[0].id);
    } else if (selectedClass && !sortedClasses.find(c => c.id === selectedClass)) {
      setSelectedClass(sortedClasses[0].id);
    }
  }, [sortedClasses, selectedClass]);
  useEffect(() => { if (selectedClass) localStorage.setItem('tt_selected_class', selectedClass); }, [selectedClass]);

  // Persist & restore selectedTeacher
  const teacherInitRef = useRef(false);
  useEffect(() => {
    if (teachers.length === 0) return;
    if (!teacherInitRef.current) {
      teacherInitRef.current = true;
      const stored = localStorage.getItem('tt_selected_teacher');
      const valid = stored && teachers.find(t => t.id === stored);
      setSelectedTeacher(valid ? stored : teachers[0].id);
    } else if (selectedTeacher && !teachers.find(t => t.id === selectedTeacher)) {
      setSelectedTeacher(teachers[0].id);
    }
  }, [teachers, selectedTeacher]);
  useEffect(() => { if (selectedTeacher) localStorage.setItem('tt_selected_teacher', selectedTeacher); }, [selectedTeacher]);

  const activeDays = Object.entries(settings.workingDays).filter(([,v])=>v).map(([k])=>k).sort((a,b)=>DAY_IDX[a]-DAY_IDX[b]);

  // ── Class regenerate ────────────────────────────────────────────────────
  const regenClass = async () => {
    if (!selectedClass || regenerating) return;
    setRegenerating(true);
    try {
      await new Promise(r => setTimeout(r, 0));
      const classSubjectMap = state.periodsConfig || {};
      const result = generateTimetable(state, {
        classSubjectMap,
        selectedClassIds: [selectedClass],
      });
      // Keep all other classes; generator already re-includes locked slots for this class
      const existingOther = schedule.filter(s => s.classId !== selectedClass);
      dispatch({ type: 'BULK_SET_SCHEDULE', payload: [...existingOther, ...result.schedule] });
    } catch (err) {
      console.error('Regenerate class error:', err);
    } finally {
      setRegenerating(false);
    }
  };

  // ── Print helpers ──────────────────────────────────────────────────────
  const getPeriodsForClass = (classId) => {
    return settings.periodTimings;
  };
  const getCellForPrint = (classId, dayKey, period) => {
    const dIdx = DAY_IDX[dayKey];
    return schedule.find(s => s.classId===classId && s.day===dIdx && s.period===period) || null;
  };
  const openPrintModal = () => {
    setPrintClassIds(classes.map(c => c.id));
    setPrintTeacherIds([]);
    setShowPrintModal(true);
  };
  const togglePrintClass = (id) => {
    setPrintClassIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAllPrint = () => {
    setPrintClassIds(prev => prev.length === classes.length ? [] : classes.map(c => c.id));
  };
  const togglePrintTeacher = (id) => {
    setPrintTeacherIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAllPrintTeachers = () => {
    setPrintTeacherIds(prev => prev.length === teachers.length ? [] : teachers.map(t => t.id));
  };
  const doPrint = () => {
    setShowPrintModal(false);
    setTimeout(() => window.print(), 100);
  };

  // ── Snapshot helpers ───────────────────────────────────────────────────
  const saveSnapshot = () => {
    if (!snapName.trim()) return;
    const id = `snap_${Date.now()}`;
    const snapshot = {
      id,
      name: snapName.trim(),
      description: snapDesc.trim(),
      slots: schedule,
      createdBy: session?.user?.email || '',
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'SAVE_SNAPSHOT', payload: snapshot });
    setSnapName(''); setSnapDesc(''); setShowSaveModal(false);
  };
  const deleteSnapshot = (id) => {
    dispatch({ type: 'DELETE_SNAPSHOT', payload: id });
  };
  const restoreSnapshot = async (snapshot) => {
    setRestoringId(snapshot.id);
    dispatch({ type: 'BULK_SET_SCHEDULE', payload: snapshot.slots });
    setRestoringId(null);
    setShowHistoryModal(false);
  };

  // All classes share the global period schedule; blocked periods are per-class config
  const getEffectivePeriods = () => settings.periodTimings;
  const effectivePeriods = getEffectivePeriods();

  const isBlockedPeriod = (classId, period) =>
    (classPeriodSettings[classId]?.blockedPeriods || []).includes(period);

  const slotId  = (classId, dayKey, period) => `sch_${classId}_${DAY_IDX[dayKey]}_${period}`;
  const isLocked= (classId, dayKey, period) => lockedSlots.includes(slotId(classId, dayKey, period));
  const toggleLock = (e, classId, dayKey, period) => {
    e.stopPropagation();
    if (!canEdit) return;
    const id = slotId(classId, dayKey, period);
    dispatch({ type: lockedSlots.includes(id) ? 'UNLOCK_SLOT' : 'LOCK_SLOT', payload: id });
  };

  const getCellData = (classId, dayKey, period) => {
    const dIdx = DAY_IDX[dayKey];
    return schedule.find(s => s.classId===classId && s.day===dIdx && s.period===period) || null;
  };
  const getTeacherCell = (teacherId, dayKey, period) => {
    const dIdx = DAY_IDX[dayKey];
    return schedule.find(s => s.teacherId===teacherId && s.day===dIdx && s.period===period) || null;
  };

  // ── Teacher busy-ness for a given slot ─────────────────────────────────
  const teacherBusyAt = (teacherId, dayKey, period, excludeSlotId) => {
    const dIdx = DAY_IDX[dayKey];
    return schedule.some(s =>
      s.teacherId===teacherId && s.day===dIdx && s.period===period && s.id!==excludeSlotId
    );
  };

  // ── Visual picker: teachers per subject for this class (filtered by classAssignments) ──
  const visualOptions = useMemo(() => {
    if (!editing) return [];
    const { classId, dayKey, period } = editing;
    const dIdx = DAY_IDX[dayKey];
    const excludeId = slotId(classId, dayKey, period);

    // Get assigned subjects for this class
    const assignedSubs = classAssignments.filter(a => a.classId === classId);
    // Current slot being edited (may already have a subject)
    const currentSlot = schedule.find(s => s.classId===classId && s.day===dIdx && s.period===period);
    const { periodsConfig = {} } = state;

    return assignedSubs.map(a => {
      const sub = subjects.find(s => s.id === a.subjectId);
      const teacher = teachers.find(t => t.id === a.teacherId);
      // Check if teacher is assigned elsewhere this slot
      const isConcurrent = !!sub?.concurrent;
      const busy = !isConcurrent && teacher ? schedule.some(s =>
        s.teacherId===teacher.id && s.day===dIdx && s.period===period && s.id!==excludeId
      ) : false;
      // Check if blocked in availability settings
      const unavailable = teacher ? teacherAvailability?.[teacher.id]?.[dayKey]?.[period] === false : false;

      // How many times this subject already appears for this class this week
      // Count both primary subjectId slots AND slots where it appears in alternatives (OR groups)
      const weekCount = schedule.filter(s =>
        s.classId===classId && (
          s.subjectId===a.subjectId ||
          s.alternatives?.some(alt => alt.subjectId === a.subjectId)
        )
      ).length;

      // Configured periods/week limit for this subject in this class
      // Sum across all entries (multi-teacher subjects have one entry per teacher)
      const subjectEntries = periodsConfig[classId]?.filter(r => r.subjectId === a.subjectId) ?? [];
      const configuredLimit = subjectEntries.length > 0
        ? subjectEntries.reduce((sum, r) => sum + (r.periodsPerWeek ?? 0), 0)
        : null;
      // If assigning to this slot, would the total exceed the limit?
      // If this slot already holds this subject, re-assigning keeps count the same.
      const alreadyHere = currentSlot?.subjectId === a.subjectId;
      const projectedCount = alreadyHere ? weekCount : weekCount + 1;
      const atLimit = configuredLimit !== null && projectedCount > configuredLimit;
      // How many other classes share this concurrent subject+teacher (for badge display)
      const concurrentClassCount = isConcurrent
        ? classAssignments.filter(ca =>
            ca.subjectId === a.subjectId && ca.classId !== classId &&
            (ca.teacherIds?.includes(a.teacherId) || ca.teacherId === a.teacherId)
          ).length
        : 0;

      return { sub, teacher, subjectId: a.subjectId, teacherId: a.teacherId, busy, unavailable, weekCount, configuredLimit, atLimit, isConcurrent, concurrentClassCount };
    }).filter(o => o.sub && o.teacher);
  }, [editing, classAssignments, subjects, teachers, schedule, state]);

  // ── OR group options for the assign modal ─────────────────────────────────
  const orGroupOptions = useMemo(() => {
    if (!editing) return [];
    const { classId, dayKey, period } = editing;
    const dIdx = DAY_IDX[dayKey];
    const groups = state.classOrGroups?.[classId] || [];
    const currentSlot = schedule.find(s => s.classId === classId && s.day === dIdx && s.period === period);
    const excludeId = `sch_${classId}_${dIdx}_${period}`;

    return groups.map(grp => {
      const members = grp.subjectIds.map(sid => {
        const assignment = classAssignments.find(a => a.classId === classId && a.subjectId === sid);
        if (!assignment) return null;
        const sub = subjects.find(s => s.id === sid);
        const teacherId = assignment.teacherIds?.[0] || assignment.teacherId;
        const teacher = teachers.find(t => t.id === teacherId);
        if (!sub || !teacher) return null;
        const busy = !!schedule.find(s => s.teacherId === teacherId && s.day === dIdx && s.period === period && s.id !== excludeId);
        const unavailable = teacherAvailability?.[teacherId]?.[dayKey]?.[period] === false;
        // Period/week tracking for this subject (count alternatives slots too)
        const weekCount = schedule.filter(s =>
          s.classId === classId && (
            s.subjectId === sid ||
            s.alternatives?.some(alt => alt.subjectId === sid)
          )
        ).length;
        const subjectEntries = state.periodsConfig?.[classId]?.filter(r => r.subjectId === sid) ?? [];
        const configuredLimit = subjectEntries.length > 0
          ? subjectEntries.reduce((sum, r) => sum + (r.periodsPerWeek ?? 0), 0)
          : null;
        const alreadyHereAlt = currentSlot?.alternatives?.length > 1 &&
          currentSlot.alternatives.some(a => a.subjectId === sid);
        const projectedCount = alreadyHereAlt ? weekCount : weekCount + 1;
        const atLimit = configuredLimit !== null && projectedCount > configuredLimit;
        return { sub, teacher, subjectId: sid, teacherId, busy, unavailable, weekCount, configuredLimit, atLimit };
      }).filter(Boolean);
      if (members.length < 2) return null;
      const anyBusy = members.some(m => m.busy || m.unavailable || m.atLimit);
      const atLimitMember = members.find(m => m.atLimit);
      const isCurrentlyAssigned = currentSlot?.alternatives?.length > 1 &&
        members.every(m => currentSlot.alternatives.some(a => a.subjectId === m.subjectId));
      // Count ALL classes sharing the same OR group label (auto-detected sync)
      const syncClassCount = Object.keys(state.classOrGroups || {}).filter(
        cid => cid !== classId && (state.classOrGroups[cid] || []).some(g => g.label === grp.label)
      ).length;
      return { label: grp.label, members, anyBusy, atLimitMember, isCurrentlyAssigned, syncClassCount };
    }).filter(Boolean);
  }, [editing, state.classOrGroups, classAssignments, subjects, teachers, schedule, teacherAvailability]);

  // ── Open/close edit ──────────────────────────────────────────────────────
  const openEdit = (classId, dayKey, period) => {
    if (!canEdit || isLocked(classId, dayKey, period)) return;
    setEditing({ classId, dayKey, period });
    setConflict(null);
  };

  // ── Quick-assign from visual block ───────────────────────────────────────
  const quickAssign = (opt) => {
    if (opt.busy || opt.unavailable || opt.atLimit) return;
    const { classId, dayKey, period } = editing;
    const dIdx = DAY_IDX[dayKey];
    dispatch({ type:'ASSIGN_SLOT', payload:{ classId, day:dIdx, period, teacherId:opt.teacherId, subjectId:opt.subjectId } });
    // Concurrent subject: auto-assign same slot to all other classes that share this subject+teacher
    if (opt.isConcurrent) {
      classAssignments
        .filter(a => a.subjectId === opt.subjectId && a.classId !== classId &&
          (a.teacherIds?.includes(opt.teacherId) || a.teacherId === opt.teacherId))
        .forEach(a => {
          dispatch({ type:'ASSIGN_SLOT', payload:{ classId: a.classId, day:dIdx, period, teacherId: opt.teacherId, subjectId: opt.subjectId } });
        });
    }
    setEditing(null); setConflict(null);
  };

  const quickAssignOrGroup = (grp) => {
    if (grp.anyBusy) return;
    const { classId, dayKey, period } = editing;
    const dIdx = DAY_IDX[dayKey];
    const primary = grp.members[0];
    dispatch({ type:'ASSIGN_SLOT', payload:{
      classId, day:dIdx, period,
      teacherId: primary.teacherId, subjectId: primary.subjectId,
      alternatives: grp.members.map(m => ({ subjectId: m.subjectId, teacherId: m.teacherId })),
    }});
    // Cross-class OR group sync: propagate to ALL classes sharing the same OR group label
    Object.entries(state.classOrGroups || {})
      .filter(([cid, groups]) => cid !== classId && groups.some(g => g.label === grp.label))
      .forEach(([syncCid]) => {
        const syncGrpDef = (state.classOrGroups[syncCid] || []).find(g => g.label === grp.label);
        if (!syncGrpDef) return;
        const syncMembers = syncGrpDef.subjectIds.map(sid => {
          const a = classAssignments.find(a2 => a2.classId === syncCid && a2.subjectId === sid);
          const tid = a?.teacherIds?.[0] || a?.teacherId;
          return tid ? { subjectId: sid, teacherId: tid } : null;
        }).filter(Boolean);
        if (syncMembers.length < 2) return;
        dispatch({ type:'ASSIGN_SLOT', payload:{
          classId: syncCid, day:dIdx, period,
          teacherId: syncMembers[0].teacherId, subjectId: syncMembers[0].subjectId,
          alternatives: syncMembers,
        }});
      });
    setEditing(null); setConflict(null);
  };

  const clearSlot = () => {
    if (!editing) return;
    const { classId, dayKey, period } = editing;
    dispatch({ type:'CLEAR_SLOT', payload: slotId(classId, dayKey, period) });
    setEditing(null);
  };

  return (
    <div className="anim-fade-up">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>Timetable</h2>
          <p>View and edit the school schedule. Click a cell to assign — lock cells to protect from regeneration.</p>
        </div>
        <div style={{ display:'flex', gap:'.75rem', alignItems:'center' }}>
          <button className="btn btn-outline no-print" onClick={openPrintModal} title="Print / Save as PDF">
            <Printer size={15}/> Print
          </button>
          {canEdit && (
            <>
              <button className="btn btn-outline no-print" onClick={() => { setSnapName(''); setSnapDesc(''); setShowSaveModal(true); }} title="Save timetable snapshot">
                <BookmarkPlus size={15}/> Save Version
              </button>
              {state.snapshots?.length > 0 && (
                <button className="btn btn-outline no-print" onClick={() => setShowHistoryModal(true)} title="View saved versions">
                  <History size={15}/> History ({state.snapshots.length})
                </button>
              )}
            </>
          )}
          {lockedSlots.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:'.375rem', fontSize:'.82rem', color:'#92400e', background:'#fef3c7', border:'1px solid #fcd34d', padding:'.35rem .75rem', borderRadius:20 }}>
              <Lock size={13}/> {lockedSlots.length} locked
              {canEdit && (
                <button onClick={()=>dispatch({type:'UNLOCK_ALL_SLOTS'})} title="Unlock all" style={{ background:'none', border:'none', cursor:'pointer', padding:'0 0 0 .25rem', color:'#b45309' }}>
                  <Unlock size={13}/>
                </button>
              )}
            </div>
          )}
          {canEdit && (
            <button className="btn btn-primary" onClick={()=>navigate('/timetable/wizard')}>
              <Wand2 size={15}/> Auto-Generate
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="card card-body" style={{ marginBottom:'1rem', display:'flex', flexDirection: 'column', gap:'1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
          <div className="tabs" style={{ margin:0, borderBottom:'none' }}>
            <button className={`tab-btn ${viewMode==='class'?'active':''}`} onClick={()=>setViewMode('class')}>Class View</button>
            <button className={`tab-btn ${viewMode==='teacher'?'active':''}`} onClick={()=>setViewMode('teacher')}>Teacher View</button>
          </div>
          
          <div style={{ flex:1 }}/>
          
          {viewMode==='class' && canEdit && (
            <button
              className="btn btn-outline btn-sm"
              style={{ gap: '.25rem' }}
              onClick={regenClass}
              disabled={regenerating}
              title="Regenerate timetable for this class only (locked slots are preserved)"
            >
              <RotateCcw size={13} style={regenerating ? { animation: 'spin 1s linear infinite' } : {}}/>
              {regenerating ? 'Generating…' : 'Regenerate Class'}
            </button>
          )}
          {viewMode==='class' && canEdit && schedule.some(s => s.classId===selectedClass && !lockedSlots.includes(s.id)) && (
            <button className="btn btn-outline btn-sm" style={{ color:'var(--clr-red)', borderColor:'var(--clr-red)', gap: '.25rem' }}
              onClick={() => setConfirmClear(selectedClass)} title="Clear this class's unlocked slots">
              <Trash2 size={13}/> Clear Class
            </button>
          )}

          {viewMode==='teacher' && (
            <select className="input" style={{width:200}} value={selectedTeacher} onChange={e=>setSelectedTeacher(e.target.value)}>
              {teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}

          <div style={{ display:'flex', alignItems:'center', gap:'.75rem', fontSize:'.78rem', color:'var(--tx-muted)' }}>
            <span style={{ display:'flex', alignItems:'center', gap:.25 }}><span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'#f0fdf4', border:'1px solid #86efac', marginRight:4 }}/>Assigned</span>
            <span style={{ display:'flex', alignItems:'center', gap:.25 }}><span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'#fffbeb', border:'1px solid #fcd34d', marginRight:4 }}/><Lock size={9} style={{ marginRight:4 }}/>Locked</span>
            <span style={{ display:'flex', alignItems:'center', gap:.25 }}><span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'var(--bg-muted)', border:'1px solid var(--border)', marginRight:4 }}/>Break</span>
          </div>
        </div>

        {viewMode==='class' && (
          <div style={{ 
            display: 'flex', 
            gap: '.5rem', 
            flexWrap: 'wrap', 
            paddingTop: '.75rem', 
            borderTop: '1px solid var(--border)',
            alignItems: 'center' 
          }}>
            <span style={{ fontSize: '.8rem', color: 'var(--tx-muted)', fontWeight: 600, marginRight: '.5rem' }}>Select Class:</span>
            {sortedClasses.map(c => (
              <button
                key={c.id}
                className={`btn btn-sm ${selectedClass === c.id ? 'btn-primary' : 'btn-outline'}`}
                style={{
                  padding: '.35rem .85rem',
                  fontSize: '.8rem',
                  fontWeight: 600,
                  borderRadius: 'var(--r-md)',
                  minWidth: '60px',
                  textAlign: 'center'
                }}
                onClick={() => setSelectedClass(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Confirm clear class modal */}
      {confirmClear && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmClear(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--clr-red)' }}>Clear {classes.find(c=>c.id===confirmClear)?.name}?</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setConfirmClear(null)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <p>This will remove all <strong>unlocked</strong> slots for <strong>{classes.find(c=>c.id===confirmClear)?.name}</strong>. Locked slots are preserved.</p>
              {lockedSlots.filter(id => id.startsWith(`sch_${confirmClear}_`)).length > 0 && (
                <p style={{ fontSize: '.82rem', color: 'var(--tx-muted)' }}>
                  {lockedSlots.filter(id => id.startsWith(`sch_${confirmClear}_`)).length} locked slot(s) in this class will be kept.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmClear(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => {
                dispatch({ type: 'CLEAR_CLASS_SCHEDULE', payload: confirmClear });
                setConfirmClear(null);
              }}>Clear Unlocked Slots</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Version Modal ── */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSaveModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Save Timetable Version</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowSaveModal(false)}><X size={16}/></button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div>
                <label className="label">Version Name <span style={{ color:'var(--clr-red)' }}>*</span></label>
                <input
                  className="input" autoFocus
                  placeholder="e.g. Week 1 Draft, Final Approved…"
                  value={snapName} onChange={e => setSnapName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveSnapshot()}
                />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input" rows={3}
                  placeholder="Optional notes about this version…"
                  value={snapDesc} onChange={e => setSnapDesc(e.target.value)}
                  style={{ resize:'vertical' }}
                />
              </div>
              <p style={{ fontSize:'.82rem', color:'var(--tx-muted)', margin:0 }}>
                Saves a snapshot of the current timetable ({schedule.length} slots). You can restore it later from Version History.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!snapName.trim()} onClick={saveSnapshot}>
                <BookmarkPlus size={14}/> Save Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Modal ── */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowHistoryModal(false)}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <h3>Version History</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowHistoryModal(false)}><X size={16}/></button>
            </div>
            <div className="modal-body" style={{ padding:0, maxHeight:'60vh', overflowY:'auto' }}>
              {(state.snapshots || []).length === 0 ? (
                <p style={{ padding:'2rem', textAlign:'center', color:'var(--tx-muted)' }}>No saved versions yet.</p>
              ) : (state.snapshots || []).map(snap => (
                <div key={snap.id} style={{ display:'flex', alignItems:'flex-start', gap:'1rem', padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:'.95rem' }}>{snap.name}</div>
                    {snap.description && <div style={{ fontSize:'.82rem', color:'var(--tx-muted)', marginTop:2 }}>{snap.description}</div>}
                    <div style={{ fontSize:'.75rem', color:'var(--tx-muted)', marginTop:4 }}>
                      {snap.slots?.length ?? 0} slots &middot; {snap.createdBy && <>{snap.createdBy} &middot; </>}
                      {snap.createdAt ? new Date(snap.createdAt).toLocaleString() : ''}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:'.5rem', flexShrink:0 }}>
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={restoringId === snap.id}
                      onClick={() => restoreSnapshot(snap)}
                      title="Restore this version"
                    >
                      <RotateCcw size={13}/> {restoringId === snap.id ? 'Restoring…' : 'Restore'}
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => deleteSnapshot(snap.id)}
                      title="Delete this version"
                      style={{ color:'var(--clr-red)' }}
                    >
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowHistoryModal(false)}>Close</button>
              {canEdit && (
                <button className="btn btn-outline" onClick={() => { setShowHistoryModal(false); setSnapName(''); setSnapDesc(''); setShowSaveModal(true); }}>
                  <BookmarkPlus size={14}/> Save Current
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Print header — only visible when printing */}
      <div className="print-header">
        <h2>{school?.name || 'School Timetable'}</h2>
        <p>
          {viewMode === 'class'
            ? `Class: ${classes.find(c => c.id === selectedClass)?.name || '—'}`
            : `Teacher: ${teachers.find(t => t.id === selectedTeacher)?.name || '—'}`
          }
          {' · '}{settings.academicYear || school?.academicYear || ''}
        </p>
      </div>

      {/* Grid */}
      <div className="card">
        <div className="tt-grid">
          <table className="tt-table">
            <thead>
              <tr>
                <th className="day-col">DAY</th>
                {effectivePeriods.filter(p => p.isBreak || viewMode !== 'class' || !isBlockedPeriod(selectedClass, p.period)).map(p => (
                  <th key={p.period}>
                    {p.label}{p.isBreak ? ' 🫖' : ''}
                    <br/><span style={{fontWeight:400,textTransform:'none',letterSpacing:0,fontSize:'.72rem'}}>{p.start}–{p.end}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeDays.map(dayKey => (
                <tr key={dayKey}>
                  <th className="day-col" style={{ fontWeight:600, fontSize:'.85rem', textAlign:'center' }}>{dayKey}</th>
                  {effectivePeriods.filter(p => p.isBreak || viewMode !== 'class' || !isBlockedPeriod(selectedClass, p.period)).map(p => {
                    if (p.isBreak) return (
                      <td key={p.period} className="tt-cell break">
                        <div className="tt-slot"><span className="break-label">☕ {p.label}</span></div>
                      </td>
                    );

                    const slot = viewMode==='class'
                      ? getCellData(selectedClass, dayKey, p.period)
                      : getTeacherCell(selectedTeacher, dayKey, p.period);
                    const teacher = slot ? teachers.find(t=>t.id===slot.teacherId) : null;
                    const subject = slot ? subjects.find(s=>s.id===slot.subjectId) : null;
                    const cls = slot && viewMode==='teacher' ? classes.find(c=>c.id===slot.classId) : null;
                    const locked = viewMode==='class' && isLocked(selectedClass, dayKey, p.period);
                    const blocked = false;
                    const hasAvailViolation = slot && teacherAvailability?.[slot.teacherId]?.[dayKey]?.[p.period] === false;

                    return (
                      <td
                        key={p.period}
                        className={`tt-cell${slot ? ' assigned' : ''}`}
                        style={{
                          cursor: canEdit && viewMode==='class' && !locked ? 'pointer' : 'default',
                          background: locked ? '#fffbeb' : hasAvailViolation ? '#fef2f2' : undefined,
                          position: 'relative',
                        }}
                        onClick={() => canEdit && viewMode==='class' && openEdit(selectedClass, dayKey, p.period)}
                        title={locked ? (canEdit ? 'Locked — click 🔒 to unlock' : 'Locked') : hasAvailViolation ? `${teacher?.name} is not available this period` : (canEdit && viewMode==='class' ? 'Click to edit' : undefined)}
                      >
                        {/* Availability violation indicator */}
                        {hasAvailViolation && (
                          <span style={{
                            position:'absolute', top:3, left:3,
                            fontSize:'.55rem', fontWeight:800, color:'var(--clr-red)',
                            background:'#fca5a5', borderRadius:3, padding:'1px 4px',
                            lineHeight:1.3, letterSpacing:.3,
                          }} title={`${teacher?.name} is not available this period`}>
                            ⚠
                          </span>
                        )}
                        {/* Lock icon — always visible (dimmed when unlocked, bright when locked) */}
                        {viewMode === 'class' && (
                          <button
                            style={{
                              position:'absolute', top:3, right:3,
                              background:'none', border:'none', cursor: canEdit ? 'pointer' : 'default', padding:2,
                              opacity: locked ? 1 : (canEdit ? 0.25 : 0),
                              transition:'opacity .15s',
                              color: locked ? '#d97706' : 'var(--tx-muted)',
                            }}
                            className="lock-btn"
                            onClick={e => toggleLock(e, selectedClass, dayKey, p.period)}
                            title={locked ? (canEdit ? 'Unlock this slot' : 'Locked') : (canEdit ? 'Lock this slot' : '')}
                            disabled={!canEdit}
                          >
                            <Lock size={11}/>
                          </button>
                        )}
                        <div className="tt-slot">
                          {slot ? (
                            slot.alternatives?.length > 1 ? (
                              <>
                                <span className="sub" style={{ fontSize: '.62rem' }}>
                                  {slot.alternatives.map(a => subjects.find(s=>s.id===a.subjectId)?.code ?? '?').join('/')}
                                </span>
                                <span className="teacher" style={{ fontSize: '.55rem' }}>
                                  {slot.alternatives.map(a => teachers.find(t=>t.id===a.teacherId)?.name?.split(' ')[0] ?? '—').join('/')}
                                </span>
                                {cls && <span className="cls">{cls.name}</span>}
                              </>
                            ) : (
                              <>
                                <span className="sub">{subject?.code}</span>
                                <span className="teacher">{teacher?.name?.split(' ')[0] ?? '—'}</span>
                                {cls && <span className="cls">{cls.name}</span>}
                              </>
                            )
                          ) : (
                            viewMode==='class' && !locked && <span style={{ fontSize:'.72rem', color:'var(--tx-xmuted)' }}>+ Assign</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Visual Slot Editor Modal ── */}
      {editing && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditing(null)}>
          <div className="modal modal-lg" style={{ maxWidth:600 }}>
            <div className="modal-header">
              <div>
                <h3>Assign Slot — {DAY_NAMES[editing.dayKey]}, {settings.periodTimings.find(p=>p.period===editing.period)?.label}</h3>
                <p style={{ margin:0, fontSize:'.8rem', color:'var(--tx-muted)' }}>
                  {classes.find(c=>c.id===editing.classId)?.name}
                </p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={()=>setEditing(null)}><X size={16}/></button>
            </div>

            <div className="modal-body">
              {conflict && <div className="alert alert-danger" style={{ marginBottom:'1rem' }}><AlertCircle size={15}/> {conflict}</div>}

              <div>
                <p style={{ fontSize:'.82rem', color:'var(--tx-muted)', marginBottom:'.875rem' }}>
                  Click a block to assign. Only teachers mapped to this class are shown.
                  <span style={{ marginLeft:'.5rem', color:'var(--clr-red)' }}>🔴 = teacher busy or unavailable</span>
                  <span style={{ marginLeft:'.5rem', color:'#ea580c' }}>🟠 = weekly period limit reached</span>
                </p>
                  {visualOptions.length === 0 && orGroupOptions.length === 0 ? (
                    <div className="alert alert-warning">
                      No subject-teacher assignments found for this class. Go to <strong>Master Data → Classes</strong> to set them up.
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'.625rem' }}>
                      {/* OR group combined cards */}
                      {orGroupOptions.map(grp => {
                        const isAtLimit = !!grp.atLimitMember;
                        const borderColor = isAtLimit ? '#f97316'
                          : grp.anyBusy ? 'var(--clr-red)'
                          : grp.isCurrentlyAssigned ? 'var(--clr-primary)'
                          : '#8b5cf6';
                        const bgColor = isAtLimit ? '#fff7ed'
                          : grp.anyBusy ? '#fef2f2'
                          : grp.isCurrentlyAssigned ? 'var(--clr-primary-l)'
                          : '#f5f3ff';
                        const titleText = isAtLimit
                          ? `Limit reached: ${grp.atLimitMember.sub.code} is at ${grp.atLimitMember.weekCount}/${grp.atLimitMember.configuredLimit} periods/week`
                          : grp.anyBusy ? 'One or more teachers are busy this period'
                          : `Assign OR group: ${grp.label}`;
                        return (
                          <button
                            key={grp.label}
                            onClick={() => !grp.anyBusy && quickAssignOrGroup(grp)}
                            title={titleText}
                            style={{
                              display:'flex', flexDirection:'column', alignItems:'flex-start',
                              padding:'.75rem 1rem', borderRadius:'var(--r-lg)',
                              border:`2px solid ${borderColor}`,
                              background: bgColor,
                              cursor: grp.anyBusy ? 'not-allowed' : 'pointer',
                              opacity: grp.anyBusy && !isAtLimit ? 0.65 : 1,
                              minWidth:160, textAlign:'left',
                              transition:'all .15s',
                              position:'relative',
                            }}
                          >
                            <span style={{ fontSize:'.65rem', fontWeight:800, letterSpacing:.5, background: isAtLimit ? '#f97316' : '#8b5cf6', color:'#fff', borderRadius:4, padding:'1px 7px', marginBottom:'.35rem' }}>
                              OR GROUP
                            </span>
                            <span style={{ fontWeight:700, fontSize:'.875rem', color:'var(--tx-main)' }}>
                              {grp.members.map(m => m.sub.code).join(' / ')}
                            </span>
                            <div style={{ fontSize:'.75rem', color: grp.anyBusy ? 'var(--clr-red)' : 'var(--tx-muted)', marginTop:'.3rem' }}>
                              {grp.members.map(m => m.teacher.name.split(' ')[0]).join(' / ')}
                              {grp.anyBusy && !isAtLimit && <span style={{ fontWeight:700 }}> · BUSY</span>}
                            </div>
                            {/* Per-member period counts */}
                            <div style={{ fontSize:'.67rem', color: isAtLimit ? '#ea580c' : 'var(--tx-muted)', marginTop:'.25rem', fontWeight: isAtLimit ? 700 : 400 }}>
                              {grp.members.map(m =>
                                m.configuredLimit !== null
                                  ? `${m.sub.code}: ${m.weekCount}/${m.configuredLimit}`
                                  : `${m.sub.code}: ${m.weekCount}`
                              ).join(' · ')}
                              {isAtLimit && ' · LIMIT'}
                            </div>
                            {grp.isCurrentlyAssigned && !grp.anyBusy && (
                              <span style={{ position:'absolute', top:4, right:6, fontSize:'.65rem', color:'var(--clr-primary)', fontWeight:700 }}>✓ current</span>
                            )}
                            {grp.syncClassCount > 0 && !grp.anyBusy && (
                              <div style={{ fontSize:'.65rem', color:'#7c3aed', marginTop:'.25rem', fontWeight:600 }}>
                                ⟶ also applies to {grp.syncClassCount} synced class{grp.syncClassCount > 1 ? 'es' : ''}
                              </div>
                            )}
                          </button>
                        );
                      })}
                      {/* Individual subject cards — hide subjects already in an OR group */}
                      {(() => {
                        const orSubjectIds = new Set(orGroupOptions.flatMap(g => g.members.map(m => m.subjectId)));
                        return visualOptions.filter(o => !orSubjectIds.has(o.subjectId)).map(opt => {
                        const currentSlot = getCellData(editing.classId, editing.dayKey, editing.period);
                        const isCurrentlyAssigned = currentSlot?.subjectId===opt.subjectId;
                        const blocked = opt.busy || opt.unavailable || opt.atLimit;
                        const borderColor = opt.atLimit ? '#f97316'
                          : opt.busy ? 'var(--clr-red)'
                          : isCurrentlyAssigned ? 'var(--clr-primary)'
                          : 'var(--border)';
                        const bgColor = opt.atLimit ? '#fff7ed'
                          : opt.busy ? '#fef2f2'
                          : isCurrentlyAssigned ? 'var(--clr-primary-l)'
                          : 'var(--bg-card)';
                        const pillColor = opt.atLimit ? '#f97316'
                          : opt.busy ? '#fca5a5'
                          : 'var(--clr-primary)';
                        const titleText = opt.atLimit
                          ? `Already at limit: ${opt.weekCount}/${opt.configuredLimit} periods this week`
                          : opt.unavailable ? `${opt.teacher?.name} is not available this period`
                          : opt.busy ? `${opt.teacher?.name} is already teaching another class this period`
                          : `Assign ${opt.sub?.name} (${opt.teacher?.name})`;
                        return (
                          <button
                            key={opt.subjectId}
                            onClick={() => !blocked && quickAssign(opt)}
                            title={titleText}
                            style={{
                              display:'flex', flexDirection:'column', alignItems:'flex-start',
                              padding:'.75rem 1rem', borderRadius:'var(--r-lg)',
                              border:`2px solid ${borderColor}`,
                              background: bgColor,
                              cursor: blocked ? 'not-allowed' : 'pointer',
                              opacity: blocked && !opt.atLimit ? 0.65 : 1,
                              minWidth:140, textAlign:'left',
                              transition:'all .15s',
                              position:'relative',
                            }}
                          >
                            {/* Subject pill */}
                            <span style={{ fontSize:'.7rem', fontWeight:800, letterSpacing:.5, background: pillColor, color:'#fff', borderRadius:4, padding:'1px 7px', marginBottom:'.35rem' }}>
                              {opt.sub?.code}
                            </span>
                            <span style={{ fontWeight:700, fontSize:'.875rem', color:'var(--tx-main)' }}>{opt.sub?.name}</span>
                            <div style={{ display:'flex', alignItems:'center', gap:'.3rem', marginTop:'.3rem', fontSize:'.75rem', color: (opt.busy || opt.unavailable) ? 'var(--clr-red)' : opt.atLimit ? '#ea580c' : 'var(--tx-muted)' }}>
                              <User size={11}/> {opt.teacher?.name?.split(' ')[0]}
                              {opt.busy && <span style={{ fontWeight:700 }}>· BUSY</span>}
                              {opt.unavailable && <span style={{ fontWeight:700 }}>· UNAVAILABLE</span>}
                            </div>
                            <div style={{ fontSize:'.68rem', color: opt.atLimit ? '#ea580c' : 'var(--tx-muted)', marginTop:'.2rem', fontWeight: opt.atLimit ? 700 : 400 }}>
                              {opt.configuredLimit !== null
                                ? `${opt.weekCount}/${opt.configuredLimit} periods this week`
                                : `${opt.weekCount} period${opt.weekCount!==1?'s':''} this week`}
                              {opt.atLimit && ' · LIMIT REACHED'}
                            </div>
                            {isCurrentlyAssigned && !opt.busy && (
                              <span style={{ position:'absolute', top:4, right:6, fontSize:'.65rem', color:'var(--clr-primary)', fontWeight:700 }}>✓ current</span>
                            )}
                            {opt.isConcurrent && opt.concurrentClassCount > 0 && (
                              <div style={{ fontSize:'.65rem', color:'#0369a1', marginTop:'.2rem', fontWeight:600 }}>
                                ⟶ also assigns {opt.concurrentClassCount} other class{opt.concurrentClassCount > 1 ? 'es' : ''}
                              </div>
                            )}
                          </button>
                        );
                      });
                      })()}
                    </div>
                  )}

                </div>
            </div>
            <div className="modal-footer">
              {(() => {
                const hasSlot = !!getCellData(editing.classId, editing.dayKey, editing.period);
                return (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={clearSlot}
                    disabled={!hasSlot}
                    title={hasSlot ? 'Remove the current assignment from this slot' : 'Slot is already empty'}
                    style={{ opacity: hasSlot ? 1 : 0.45 }}
                  >
                    <X size={14}/> Clear Slot
                  </button>
                );
              })()}
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Print Modal ── */}
      {showPrintModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowPrintModal(false)}>
          <div className="modal" style={{ maxWidth:480 }}>
            <div className="modal-header">
              <h3>Print Timetables</h3>
              <button className="btn btn-ghost btn-icon" onClick={()=>setShowPrintModal(false)}><X size={16}/></button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

              {/* Class timetables */}
              <div>
                <div style={{ fontWeight:700, fontSize:'.82rem', marginBottom:'.5rem' }}>Class Timetables</div>
                <label style={{ display:'flex', alignItems:'center', gap:'.5rem', fontWeight:600, marginBottom:'.35rem', cursor:'pointer', padding:'.4rem .5rem', background:'var(--bg-muted)', borderRadius:6, fontSize:'.82rem' }}>
                  <input type="checkbox" checked={printClassIds.length === classes.length} onChange={toggleAllPrint}/>
                  Select All ({classes.length})
                </label>
                <div style={{ maxHeight:180, overflowY:'auto', display:'flex', flexDirection:'column', gap:'.2rem' }}>
                  {sortedClasses.map(c => (
                    <label key={c.id} style={{ display:'flex', alignItems:'center', gap:'.5rem', cursor:'pointer', padding:'.3rem .5rem', borderRadius:4, fontSize:'.82rem', background: printClassIds.includes(c.id) ? 'var(--clr-primary-l)' : 'transparent' }}>
                      <input type="checkbox" checked={printClassIds.includes(c.id)} onChange={()=>togglePrintClass(c.id)}/>
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* Teacher timetables */}
              <div>
                <div style={{ fontWeight:700, fontSize:'.82rem', marginBottom:'.5rem' }}>Teacher Timetables</div>
                <label style={{ display:'flex', alignItems:'center', gap:'.5rem', fontWeight:600, marginBottom:'.35rem', cursor:'pointer', padding:'.4rem .5rem', background:'var(--bg-muted)', borderRadius:6, fontSize:'.82rem' }}>
                  <input type="checkbox" checked={printTeacherIds.length === teachers.length} onChange={toggleAllPrintTeachers}/>
                  Select All ({teachers.length})
                </label>
                <div style={{ maxHeight:180, overflowY:'auto', display:'flex', flexDirection:'column', gap:'.2rem' }}>
                  {teachers.map(t => (
                    <label key={t.id} style={{ display:'flex', alignItems:'center', gap:'.5rem', cursor:'pointer', padding:'.3rem .5rem', borderRadius:4, fontSize:'.82rem', background: printTeacherIds.includes(t.id) ? 'var(--clr-primary-l)' : 'transparent' }}>
                      <input type="checkbox" checked={printTeacherIds.includes(t.id)} onChange={()=>togglePrintTeacher(t.id)}/>
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setShowPrintModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={printClassIds.length===0 && printTeacherIds.length===0} onClick={doPrint}>
                <Printer size={14}/> Print {printClassIds.length + printTeacherIds.length} Page{(printClassIds.length + printTeacherIds.length) !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden print pages ── class pages then teacher pages ── */}
      <div className="print-pages">
        {/* Class timetable pages */}
        {printClassIds.map(cid => {
          const cls = classes.find(c => c.id === cid);
          if (!cls) return null;
          const periods = getPeriodsForClass(cid);
          return (
            <div key={cid} className="print-page">
              <div className="print-page-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ textAlign: 'left' }}>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 900, margin: 0, color: '#000000', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      {school?.name || 'School Timetable'}
                    </h2>
                    {school?.academicYear && (
                      <p style={{ margin: '2px 0 0', fontSize: '.75rem', color: '#333333', fontWeight: 500 }}>
                        Academic Year: {school.academicYear}
                      </p>
                    )}
                  </div>
                  <div style={{ padding: '.4rem .9rem', border: '2.5px solid #000000', background: '#f3f4f6', borderRadius: '4px', fontWeight: 900, fontSize: '1.05rem', textTransform: 'uppercase', color: '#000000', letterSpacing: '0.04em', boxShadow: '2px 2px 0px #000000', display: 'inline-block' }}>
                    CLASS: {cls.name}
                  </div>
                </div>
              </div>
              <table className="tt-table print-tt">
                <thead>
                  <tr>
                    <th className="day-col">DAY</th>
                    {periods.filter(p => p.isBreak || !isBlockedPeriod(cid, p.period)).map(p => (
                      <th key={p.period}>
                        {p.label}{p.isBreak ? ' 🫖' : ''}
                        <br/><span style={{fontWeight:400,fontSize:'.55rem'}}>{p.start}–{p.end}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeDays.map(dayKey => (
                    <tr key={dayKey}>
                      <th className="day-col">{dayKey}</th>
                      {periods.filter(p => p.isBreak || !isBlockedPeriod(cid, p.period)).map(p => {
                        if (p.isBreak) return <td key={p.period} className="tt-cell break"><div className="tt-slot"><span className="break-label">☕</span></div></td>;
                        const slot = getCellForPrint(cid, dayKey, p.period);
                        const t = slot ? teachers.find(x=>x.id===slot.teacherId) : null;
                        const s = slot ? subjects.find(x=>x.id===slot.subjectId) : null;
                        return (
                          <td
                            key={p.period}
                            className={`tt-cell${slot ? ' assigned' : ''}`}
                          >
                            <div className="tt-slot">
                              {slot ? (
                                slot.alternatives?.length > 1 ? (
                                  <>
                                    <span className="sub" style={{ fontWeight: 800, fontSize: '.65rem', display: 'block', textTransform: 'uppercase' }}>
                                      {slot.alternatives.map(a => subjects.find(x=>x.id===a.subjectId)?.code ?? '?').join('/')}
                                    </span>
                                    <span className="teacher" style={{ fontSize: '.55rem', display: 'block', marginTop: '2px', color: '#333333' }}>
                                      {slot.alternatives.map(a => teachers.find(x=>x.id===a.teacherId)?.name?.split(' ')[0] ?? '—').join('/')}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="sub" style={{ fontWeight: 800, fontSize: '.75rem', display: 'block', textTransform: 'uppercase' }}>
                                      {s?.code || s?.name}
                                    </span>
                                    <span className="teacher" style={{ fontSize: '.62rem', display: 'block', marginTop: '2px', color: '#333333' }}>
                                      {t?.name ?? '—'}
                                    </span>
                                  </>
                                )
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Teacher timetable pages */}
        {printTeacherIds.map(tid => {
          const teacher = teachers.find(t => t.id === tid);
          if (!teacher) return null;
          const periods = settings.periodTimings;
          return (
            <div key={tid} className="print-page">
              <div className="print-page-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ textAlign: 'left' }}>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 900, margin: 0, color: '#000000', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      {school?.name || 'School Timetable'}
                    </h2>
                    {school?.academicYear && (
                      <p style={{ margin: '2px 0 0', fontSize: '.75rem', color: '#333333', fontWeight: 500 }}>
                        Academic Year: {school.academicYear}
                      </p>
                    )}
                  </div>
                  <div style={{ padding: '.4rem .9rem', border: '2.5px solid #000000', background: '#f3f4f6', borderRadius: '4px', fontWeight: 900, fontSize: '1.05rem', textTransform: 'uppercase', color: '#000000', letterSpacing: '0.04em', boxShadow: '2px 2px 0px #000000', display: 'inline-block' }}>
                    TEACHER: {teacher.name}
                  </div>
                </div>
              </div>
              <table className="tt-table print-tt">
                <thead>
                  <tr>
                    <th className="day-col">DAY</th>
                    {periods.map(p => (
                      <th key={p.period}>
                        {p.label}{p.isBreak ? ' 🫖' : ''}
                        <br/><span style={{fontWeight:400,fontSize:'.55rem'}}>{p.start}–{p.end}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeDays.map(dayKey => (
                    <tr key={dayKey}>
                      <th className="day-col">{dayKey}</th>
                      {periods.map(p => {
                        if (p.isBreak) return (
                          <td key={p.period} className="tt-cell break">
                            <div className="tt-slot"><span className="break-label">☕</span></div>
                          </td>
                        );
                        const slot = getTeacherCell(tid, dayKey, p.period);
                        const s = slot ? subjects.find(x => x.id === slot.subjectId) : null;
                        const cls = slot ? classes.find(x => x.id === slot.classId) : null;
                        return (
                          <td key={p.period} className={`tt-cell${slot ? ' assigned' : ''}`}>
                            <div className="tt-slot">
                              {slot ? (
                                <>
                                  <span className="sub" style={{ fontWeight: 800, fontSize: '.75rem', display: 'block', textTransform: 'uppercase' }}>
                                    {s?.code || s?.name}
                                  </span>
                                  <span className="cls" style={{ fontSize: '.62rem', display: 'block', marginTop: '2px', color: '#333333' }}>
                                    {cls?.name ?? '—'}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
