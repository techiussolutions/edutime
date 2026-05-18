import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../store/AppStore';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { checkConflict } from '../utils/engine';
import { formatAMPM } from '../utils/formatTime';
import { CheckCircle2, AlertCircle, Wand2, Lock, Unlock, X, User, Printer, Trash2 } from 'lucide-react';


const DAY_NAMES = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday' };
const DAY_IDX  = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5 };

export default function TimetablePage() {
  const { state, dispatch } = useApp();
  const { can } = useAuth();
  const navigate = useNavigate();
  const canEdit = can('editTimetable');
  const {
    settings, schedule, teachers, subjects, classes, school,
    lockedSlots = [], classAssignments = [], teacherAvailability = {},
    classPeriodSettings = {}, classOrGroups = {},
  } = state;

  // Sort classes numerically by grade, then section alphabetically
  const sortedClasses = [...classes].sort((a, b) => {
    const ga = parseInt(a.grade, 10) || 0;
    const gb = parseInt(b.grade, 10) || 0;
    if (ga !== gb) return ga - gb;
    return (a.section || '').localeCompare(b.section || '');
  });

  const [viewMode,       setViewMode]       = useState('class');
  const [selectedClass,  setSelectedClass]  = useState(() => sortedClasses[0]?.id);

  const [selectedTeacher,setSelectedTeacher]= useState(teachers[0]?.id);
  const [editing,        setEditing]        = useState(null);   // { classId, dayKey, period }
  const [conflict,       setConflict]       = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printClassIds,   setPrintClassIds]   = useState([]);
  const [printTeacherIds, setPrintTeacherIds] = useState([]);
  const [clearConfirmClass, setClearConfirmClass] = useState(false);


  const activeDays = Object.entries(settings.workingDays).filter(([,v])=>v).map(([k])=>k).sort((a,b)=>DAY_IDX[a]-DAY_IDX[b]);

  // ── Print helpers ──────────────────────────────────────────────────────
  const getPeriodsForClass = (classId) => {
    const custom = classPeriodSettings[classId];
    return custom ? custom.periodTimings : settings.periodTimings;
  };
  const getCellForPrint = (classId, dayKey, period) => {
    const dIdx = DAY_IDX[dayKey];
    return schedule.find(s => s.classId===classId && s.day===dIdx && s.period===period) || null;
  };
  const openPrintModal = () => {
    if (viewMode === 'teacher') {
      setPrintTeacherIds(teachers.map(t => t.id));
    } else {
      setPrintClassIds(classes.map(c => c.id));
    }
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
  // Get the union of all period timings a teacher teaches across their classes
  const getPeriodsForTeacher = (teacherId) => {
    const teacherClassIds = [...new Set(
      schedule.filter(s => s.teacherId === teacherId).map(s => s.classId)
    )];
    let longest = settings.periodTimings;
    for (const cid of teacherClassIds) {
      const custom = classPeriodSettings[cid];
      if (custom && custom.periodTimings.length > longest.length) longest = custom.periodTimings;
    }
    return longest;
  };
  const doPrint = () => {
    setShowPrintModal(false);
    setTimeout(() => window.print(), 100);
  };


  // Resolve effective period timings: class-specific if available, else global
  // For teacher view, use the longest period list across all classes they teach
  const getEffectivePeriods = () => {
    if (viewMode === 'class' && selectedClass) {
      const custom = classPeriodSettings[selectedClass];
      if (custom) return custom.periodTimings;
    }
    if (viewMode === 'teacher' && selectedTeacher) {
      const teacherClassIds = [...new Set(
        schedule.filter(s => s.teacherId === selectedTeacher).map(s => s.classId)
      )];
      let longest = settings.periodTimings;
      for (const cid of teacherClassIds) {
        const custom = classPeriodSettings[cid];
        if (custom && custom.periodTimings.length > longest.length) {
          longest = custom.periodTimings;
        }
      }
      return longest;
    }
    return settings.periodTimings;
  };
  const effectivePeriods = getEffectivePeriods();

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

  // ── Visual picker: individual subjects + OR group bundles ────────────────
  const visualOptions = useMemo(() => {
    if (!editing) return [];
    const { classId, dayKey, period } = editing;
    const dIdx = DAY_IDX[dayKey];
    const excludeId = slotId(classId, dayKey, period);

    const assignedSubs = classAssignments.filter(a => a.classId === classId);

    // Build OR group options first
    const orGroupDefs = classOrGroups?.[classId] || [];
    const orGroupSubjectIds = new Set(orGroupDefs.flatMap(g => g.subjectIds));

    const orGroupOptions = orGroupDefs
      .filter(g => g.label && g.subjectIds.length >= 2)
      .map(grp => {
        const alternatives = grp.subjectIds.map(sid => {
          const assign = assignedSubs.find(a => a.subjectId === sid);
          const teacherIds = assign?.teacherIds?.length ? assign.teacherIds : (assign?.teacherId ? [assign.teacherId] : []);
          // Pick first free teacher from the pool
          const freeTeacherId = teacherIds.find(tid => {
            const busy = schedule.some(s => s.teacherId === tid && s.day === dIdx && s.period === period && s.id !== excludeId);
            const unavail = teacherAvailability?.[tid]?.[dayKey]?.[period] === false;
            return !busy && !unavail;
          }) || teacherIds[0] || '';
          const sub = subjects.find(s => s.id === sid);
          const teacher = teachers.find(t => t.id === freeTeacherId);
          const busy = schedule.some(s => s.teacherId === freeTeacherId && s.day === dIdx && s.period === period && s.id !== excludeId);
          const unavailable = teacherAvailability?.[freeTeacherId]?.[dayKey]?.[period] === false;
          return { subjectId: sid, teacherId: freeTeacherId, sub, teacher, busy, unavailable };
        });
        const anyBusy = alternatives.some(a => a.busy || a.unavailable || !a.teacherId);
        const weekCount = schedule.filter(s =>
          s.classId === classId && alternatives.some(a => a.subjectId === s.subjectId)
        ).length;
        return { isOrGroup: true, label: grp.label, alternatives, busy: anyBusy, weekCount };
      });

    // Individual (non-OR-group) subject options
    const individualOptions = assignedSubs
      .filter(a => !orGroupSubjectIds.has(a.subjectId))
      .map(a => {
        const sub = subjects.find(s => s.id === a.subjectId);
        const teacherIds = a.teacherIds?.length ? a.teacherIds : (a.teacherId ? [a.teacherId] : []);
        const freeTeacherId = teacherIds.find(tid => {
          const busy = schedule.some(s => s.teacherId === tid && s.day === dIdx && s.period === period && s.id !== excludeId);
          const unavail = teacherAvailability?.[tid]?.[dayKey]?.[period] === false;
          return !busy && !unavail;
        }) || teacherIds[0] || '';
        const teacher = teachers.find(t => t.id === freeTeacherId);
        const busy = freeTeacherId ? schedule.some(s =>
          s.teacherId === freeTeacherId && s.day === dIdx && s.period === period && s.id !== excludeId
        ) : false;
        const unavailable = freeTeacherId ? teacherAvailability?.[freeTeacherId]?.[dayKey]?.[period] === false : false;
        const weekCount = schedule.filter(s => s.classId === classId && s.subjectId === a.subjectId).length;
        return { isOrGroup: false, sub, teacher, subjectId: a.subjectId, teacherId: freeTeacherId, busy, unavailable, weekCount };
      }).filter(o => o.sub && o.teacher);

    return [...orGroupOptions, ...individualOptions];
  }, [editing, classAssignments, subjects, teachers, schedule, classOrGroups, teacherAvailability]);


  // ── Open/close edit ──────────────────────────────────────────────────────
  const openEdit = (classId, dayKey, period) => {
    if (!canEdit || isLocked(classId, dayKey, period)) return;
    setEditing({ classId, dayKey, period });
    setConflict(null);
  };

  // ── Quick-assign from visual block ───────────────────────────────────────
  const quickAssign = (opt) => {
    if (opt.busy || opt.unavailable) return;
    const { classId, dayKey, period } = editing;
    const dIdx = DAY_IDX[dayKey];
    if (opt.isOrGroup) {
      // OR group: dispatch with alternatives
      const leader = opt.alternatives[0];
      dispatch({ type: 'ASSIGN_SLOT', payload: {
        classId, day: dIdx, period,
        teacherId: leader.teacherId, subjectId: leader.subjectId,
        alternatives: opt.alternatives.map(a => ({ subjectId: a.subjectId, teacherId: a.teacherId })),
      }});
    } else {
      dispatch({ type: 'ASSIGN_SLOT', payload: { classId, day: dIdx, period, teacherId: opt.teacherId, subjectId: opt.subjectId } });
    }
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
      <div className="card card-body" style={{ marginBottom: clearConfirmClass ? '.5rem' : '1rem', display:'flex', gap:'1rem', alignItems:'center', flexWrap:'wrap' }}>
        <div className="tabs" style={{ margin:0, borderBottom:'none' }}>
          <button className={`tab-btn ${viewMode==='class'?'active':''}`} onClick={()=>setViewMode('class')}>Class View</button>
          <button className={`tab-btn ${viewMode==='teacher'?'active':''}`} onClick={()=>setViewMode('teacher')}>Teacher View</button>
        </div>
        <div style={{ flex:1 }}/>
        {viewMode==='class'
          ? (
            <div style={{ display:'flex', gap:'.5rem', alignItems:'center' }}>
              <select className="input" style={{width:200}} value={selectedClass} onChange={e=>{setSelectedClass(e.target.value); setClearConfirmClass(false);}}>
                {sortedClasses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}

              </select>
              {canEdit && schedule.some(s => s.classId === selectedClass && !lockedSlots.includes(s.id)) && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--clr-red)', border: '1px solid var(--clr-red)', gap: '.3rem', whiteSpace: 'nowrap' }}
                  onClick={() => setClearConfirmClass(v => !v)}
                  title="Clear all unlocked slots for this class"
                >
                  <Trash2 size={13}/> Clear Class
                </button>
              )}
            </div>
          )
          : <select className="input" style={{width:200}} value={selectedTeacher} onChange={e=>setSelectedTeacher(e.target.value)}>
              {teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
        }
        <div style={{ display:'flex', alignItems:'center', gap:'.75rem', fontSize:'.78rem', color:'var(--tx-muted)' }}>
          <span style={{ display:'flex', alignItems:'center', gap:.25 }}><span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'#f0fdf4', border:'1px solid #86efac', marginRight:4 }}/>Assigned</span>
          <span style={{ display:'flex', alignItems:'center', gap:.25 }}><span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'#fffbeb', border:'1px solid #fcd34d', marginRight:4 }}/><Lock size={9} style={{ marginRight:4 }}/>Locked</span>
          <span style={{ display:'flex', alignItems:'center', gap:.25 }}><span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'var(--bg-muted)', border:'1px solid var(--border)', marginRight:4 }}/>Break</span>
        </div>
      </div>

      {/* Clear confirmation banner */}
      {clearConfirmClass && viewMode === 'class' && (() => {
        const cls = classes.find(c => c.id === selectedClass);
        const classSlots = schedule.filter(s => s.classId === selectedClass);
        const unlocked = classSlots.filter(s => !lockedSlots.includes(s.id));
        const locked   = classSlots.filter(s =>  lockedSlots.includes(s.id));
        return (
          <div style={{
            marginBottom: '1rem', padding: '.875rem 1.25rem',
            borderRadius: 'var(--r-lg)', border: '1.5px solid var(--clr-red)',
            background: '#fef2f2', display: 'flex', alignItems: 'center',
            gap: '1rem', flexWrap: 'wrap',
          }}>
            <Trash2 size={16} color="var(--clr-red)" style={{ flexShrink: 0 }}/>
            <div style={{ flex: 1, fontSize: '.85rem' }}>
              <strong style={{ color: 'var(--clr-red)' }}>Clear {cls?.name} timetable?</strong>
              <span style={{ color: '#991b1b', marginLeft: '.5rem' }}>
                {unlocked.length} unlocked slot{unlocked.length !== 1 ? 's' : ''} will be removed
                {locked.length > 0 ? ` · ${locked.length} locked slot${locked.length !== 1 ? 's' : ''} kept` : ''}.
              </span>
            </div>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setClearConfirmClass(false)}>Cancel</button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  dispatch({ type: 'CLEAR_CLASS_SCHEDULE', payload: selectedClass });
                  setClearConfirmClass(false);
                }}
              >
                <Trash2 size={13}/> Yes, Clear
              </button>
            </div>
          </div>
        );
      })()}

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
                {effectivePeriods.map(p => (
                  <th key={p.period}>
                    {p.label}{p.isBreak ? ' 🫖' : ''}
                    <br/><span style={{fontWeight:400,textTransform:'none',letterSpacing:0,fontSize:'.72rem'}}>{formatAMPM(p.start)}–{formatAMPM(p.end)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeDays.map(dayKey => (
                <tr key={dayKey}>
                  <th className="day-col" style={{ fontWeight:600, fontSize:'.85rem', textAlign:'center' }}>{dayKey}</th>
                  {effectivePeriods.map(p => {
                    if (p.isBreak) return (
                      <td key={p.period} className="tt-cell break">
                        <div className="tt-slot"><span className="break-label">☕ {p.label}</span></div>
                      </td>
                    );

                    const slot = viewMode==='class'
                      ? getCellData(selectedClass, dayKey, p.period)
                      : getTeacherCell(selectedTeacher, dayKey, p.period);
                    const locked = viewMode==='class' && isLocked(selectedClass, dayKey, p.period);
                    // OR-group: slot has alternatives array
                    const isOrGroup = slot?.alternatives && slot.alternatives.length > 1;

                    // Resolve display items: either alternatives array or single subject
                    const displayItems = isOrGroup
                      ? slot.alternatives.map(alt => ({
                          sub: subjects.find(s => s.id === alt.subjectId),
                          teacher: teachers.find(t => t.id === alt.teacherId),
                        }))
                      : slot
                        ? [{ sub: subjects.find(s=>s.id===slot.subjectId), teacher: teachers.find(t=>t.id===slot.teacherId) }]
                        : [];
                    const cls = slot && viewMode==='teacher' ? classes.find(c=>c.id===slot.classId) : null;

                    return (
                      <td
                        key={p.period}
                        className={`tt-cell${slot ? ' assigned' : ''}`}
                        style={{
                          cursor: canEdit && viewMode==='class' && !locked ? 'pointer' : 'default',
                          background: locked ? '#fffbeb' : isOrGroup ? '#faf5ff' : undefined,
                          position: 'relative',
                          borderLeft: isOrGroup ? '2.5px solid #a78bfa' : undefined,
                        }}
                        onClick={() => canEdit && viewMode==='class' && openEdit(selectedClass, dayKey, p.period)}
                        title={locked ? (canEdit ? 'Locked — click 🔒 to unlock' : 'Locked') : (canEdit && viewMode==='class' ? 'Click to edit' : undefined)}
                      >
                        {/* Lock icon */}
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
                          {displayItems.length > 0 ? (
                            isOrGroup ? (
                              // OR-group: stacked display
                              <div style={{ display:'flex', flexDirection:'column', gap:1, width:'100%' }}>
                                {displayItems.map((item, i) => (
                                  <div key={i} style={{
                                    display:'flex', alignItems:'center', gap:3,
                                    paddingBottom: i < displayItems.length-1 ? 2 : 0,
                                    borderBottom: i < displayItems.length-1 ? '1px dashed #ddd6fe' : 'none',
                                  }}>
                                    <span style={{ fontSize:'.65rem', fontWeight:800, color:'#7c3aed', letterSpacing:.3 }}>
                                      {item.sub?.code}
                                    </span>
                                    <span style={{ fontSize:'.65rem', color:'var(--tx-muted)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                      {item.teacher?.name?.split(' ')[0] ?? '—'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              // Normal single-subject display
                              <>
                                <span className="sub">{displayItems[0].sub?.code}</span>
                                <span className="teacher">{displayItems[0].teacher?.name?.split(' ')[0] ?? '—'}</span>
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
                </p>
                  {visualOptions.length === 0 ? (
                    <div className="alert alert-warning">
                      No subject-teacher assignments found for this class. Go to <strong>Master Data → Classes</strong> to set them up.
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'.625rem' }}>
                    {visualOptions.map((opt, oi) => {
                        const currentSlot = getCellData(editing.classId, editing.dayKey, editing.period);
                        const isCurrentlyAssigned = opt.isOrGroup
                          ? currentSlot?.alternatives?.some(a => a.subjectId === opt.alternatives?.[0]?.subjectId)
                          : currentSlot?.subjectId === opt.subjectId;
                        return (
                          <button
                            key={opt.isOrGroup ? `org_${opt.label}` : opt.subjectId}
                            onClick={() => !opt.busy && quickAssign(opt)}
                            title={opt.busy
                              ? (opt.isOrGroup ? 'One or more teachers in this OR group are busy' : `${opt.teacher?.name} is already teaching another class this period`)
                              : (opt.isOrGroup ? `Assign OR group: ${opt.label}` : `Assign ${opt.sub?.name} (${opt.teacher?.name})`)}
                            style={{
                              display:'flex', flexDirection:'column', alignItems:'flex-start',
                              padding:'.75rem 1rem', borderRadius:'var(--r-lg)',
                              border:`2px solid ${opt.busy ? 'var(--clr-red)' : isCurrentlyAssigned ? (opt.isOrGroup ? '#7c3aed' : 'var(--clr-primary)') : (opt.isOrGroup ? '#c4b5fd' : 'var(--border)')}`,
                              background: opt.busy ? '#fef2f2' : isCurrentlyAssigned ? (opt.isOrGroup ? '#ede9fe' : 'var(--clr-primary-l)') : (opt.isOrGroup ? '#faf5ff' : 'var(--bg-card)'),
                              cursor: opt.busy ? 'not-allowed' : 'pointer',
                              opacity: opt.busy ? 0.65 : 1,
                              minWidth: opt.isOrGroup ? 180 : 140, textAlign:'left',
                              transition:'all .15s', position:'relative',
                            }}
                          >
                            {opt.isOrGroup ? (
                              // ── OR Group card ──────────────────────────────
                              <>
                                <span style={{ fontSize:'.68rem', fontWeight:800, letterSpacing:.5,
                                  background: opt.busy ? '#fca5a5' : '#7c3aed', color:'#fff',
                                  borderRadius:4, padding:'1px 7px', marginBottom:'.4rem' }}>
                                  ⇄ OR Group
                                </span>
                                <span style={{ fontWeight:700, fontSize:'.82rem', color:'var(--tx-main)', marginBottom:'.35rem' }}>
                                  {opt.label}
                                </span>
                                {opt.alternatives.map(a => (
                                  <div key={a.subjectId} style={{ display:'flex', alignItems:'center', gap:'.3rem',
                                    fontSize:'.73rem', marginBottom:'.15rem',
                                    color: (a.busy || a.unavailable) ? 'var(--clr-red)' : 'var(--tx-muted)' }}>
                                    <span style={{ fontWeight:700, color: '#5b21b6', minWidth:32 }}>{a.sub?.code}</span>
                                    <User size={10}/>
                                    <span>{a.teacher?.name?.split(' ')[0] ?? '— no teacher'}</span>
                                    {(a.busy || a.unavailable) && <span style={{ fontWeight:700 }}>· BUSY</span>}
                                  </div>
                                ))}
                                <div style={{ fontSize:'.68rem', color:'var(--tx-muted)', marginTop:'.25rem' }}>
                                  {opt.weekCount} period{opt.weekCount!==1?'s':''} this week
                                </div>
                              </>
                            ) : (
                              // ── Individual subject card ────────────────────
                              <>
                                <span style={{ fontSize:'.7rem', fontWeight:800, letterSpacing:.5,
                                  background: opt.busy ? '#fca5a5' : 'var(--clr-primary)', color:'#fff',
                                  borderRadius:4, padding:'1px 7px', marginBottom:'.35rem' }}>
                                  {opt.sub?.code}
                                </span>
                                <span style={{ fontWeight:700, fontSize:'.875rem', color:'var(--tx-main)' }}>{opt.sub?.name}</span>
                                <div style={{ display:'flex', alignItems:'center', gap:'.3rem', marginTop:'.3rem', fontSize:'.75rem',
                                  color: (opt.busy || opt.unavailable) ? 'var(--clr-red)' : 'var(--tx-muted)' }}>
                                  <User size={11}/> {opt.teacher?.name?.split(' ')[0]}
                                  {opt.busy && <span style={{ fontWeight:700 }}>· BUSY</span>}
                                  {opt.unavailable && <span style={{ fontWeight:700 }}>· UNAVAILABLE</span>}
                                </div>
                                <div style={{ fontSize:'.68rem', color:'var(--tx-muted)', marginTop:'.2rem' }}>
                                  {opt.weekCount} period{opt.weekCount!==1?'s':''} this week
                                </div>
                              </>
                            )}
                            {isCurrentlyAssigned && !opt.busy && (
                              <span style={{ position:'absolute', top:4, right:6, fontSize:'.65rem',
                                color: opt.isOrGroup ? '#7c3aed' : 'var(--clr-primary)', fontWeight:700 }}>✓ current</span>
                            )}
                          </button>
                        );

                      })}
                    </div>
                  )}

                  {/* Clear option */}
                  {getCellData(editing.classId, editing.dayKey, editing.period) && (
                    <button className="btn btn-danger btn-sm" style={{ marginTop:'1rem' }} onClick={clearSlot}>
                      Clear this slot
                    </button>
                  )}
                </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Print Modal — mode-aware ── */}
      {showPrintModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowPrintModal(false)}>
          <div className="modal" style={{ maxWidth:420 }}>
            <div className="modal-header">
              <h3>Print {viewMode === 'teacher' ? 'Teacher' : 'Class'} Timetables</h3>
              <button className="btn btn-ghost btn-icon" onClick={()=>setShowPrintModal(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              {viewMode === 'teacher' ? (
                <>
                  <p style={{ fontSize:'.82rem', color:'var(--tx-muted)', marginBottom:'.75rem' }}>Select teachers to include. Each teacher prints on their own page.</p>
                  <label style={{ display:'flex', alignItems:'center', gap:'.5rem', fontWeight:600, marginBottom:'.5rem', cursor:'pointer', padding:'.4rem .5rem', background:'var(--bg-muted)', borderRadius:6 }}>
                    <input type="checkbox" checked={printTeacherIds.length === teachers.length} onChange={toggleAllPrintTeachers}/>
                    Select All ({teachers.length})
                  </label>
                  <div style={{ maxHeight:300, overflowY:'auto', display:'flex', flexDirection:'column', gap:'.25rem' }}>
                    {teachers.map(t => (
                      <label key={t.id} style={{ display:'flex', alignItems:'center', gap:'.5rem', cursor:'pointer', padding:'.35rem .5rem', borderRadius:4, background: printTeacherIds.includes(t.id) ? 'var(--clr-primary-l)' : 'transparent' }}>
                        <input type="checkbox" checked={printTeacherIds.includes(t.id)} onChange={()=>togglePrintTeacher(t.id)}/>
                        <span>{t.name}</span>
                        <span style={{ fontSize:'.72rem', color:'var(--tx-muted)', marginLeft:'auto' }}>{t.department}</span>
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize:'.82rem', color:'var(--tx-muted)', marginBottom:'.75rem' }}>Select classes to include. Each class prints on its own page.</p>
                  <label style={{ display:'flex', alignItems:'center', gap:'.5rem', fontWeight:600, marginBottom:'.5rem', cursor:'pointer', padding:'.4rem .5rem', background:'var(--bg-muted)', borderRadius:6 }}>
                    <input type="checkbox" checked={printClassIds.length === classes.length} onChange={toggleAllPrint}/>
                    Select All ({classes.length})
                  </label>
                  <div style={{ maxHeight:300, overflowY:'auto', display:'flex', flexDirection:'column', gap:'.25rem' }}>
                    {sortedClasses.map(c => (

                      <label key={c.id} style={{ display:'flex', alignItems:'center', gap:'.5rem', cursor:'pointer', padding:'.35rem .5rem', borderRadius:4, background: printClassIds.includes(c.id) ? 'var(--clr-primary-l)' : 'transparent' }}>
                        <input type="checkbox" checked={printClassIds.includes(c.id)} onChange={()=>togglePrintClass(c.id)}/>
                        {c.name}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setShowPrintModal(false)}>Cancel</button>
              {viewMode === 'teacher' ? (
                <button className="btn btn-primary" disabled={printTeacherIds.length===0} onClick={doPrint}>
                  <Printer size={14}/> Print {printTeacherIds.length} Teacher{printTeacherIds.length!==1?'s':''}
                </button>
              ) : (
                <button className="btn btn-primary" disabled={printClassIds.length===0} onClick={doPrint}>
                  <Printer size={14}/> Print {printClassIds.length} Class{printClassIds.length!==1?'es':''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      {/* ── Hidden print pages — class pages ── */}
      <div className="print-pages">
        {printClassIds.map(cid => {
          const cls = classes.find(c => c.id === cid);
          if (!cls) return null;
          const periods = getPeriodsForClass(cid);
          return (
            <div key={cid} className="print-page">
              <div className="print-page-header" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ marginBottom: '0.5rem' }}>{school?.name || 'School Timetable'}</h2>
                <div style={{
                  display: 'inline-block',
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  padding: '0.4rem 1rem',
                  border: '2px solid #111',
                  borderRadius: '8px',
                  backgroundColor: '#f3f4f6',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact'
                }}>
                  Class: {cls.name}
                </div>
                {school?.academicYear && <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#555' }}>Academic Year: {school.academicYear}</p>}
              </div>
              <table className="tt-table print-tt">
                <thead>
                  <tr>
                    <th className="day-col">DAY</th>
                    {periods.map(p => (
                      <th key={p.period}>
                        {p.label}{p.isBreak ? ' 🫖' : ''}
                        <br/><span style={{fontWeight:400,fontSize:'.55rem'}}>{formatAMPM(p.start)}–{formatAMPM(p.end)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeDays.map(dayKey => (
                    <tr key={dayKey}>
                      <th className="day-col">{dayKey}</th>
                      {periods.map(p => {
                        if (p.isBreak) return <td key={p.period} className="tt-cell break"><div className="tt-slot"><span className="break-label">☕</span></div></td>;
                        const slot = getCellForPrint(cid, dayKey, p.period);
                        const isOrGroup = slot?.alternatives && slot.alternatives.length > 1;
                        return (
                          <td key={p.period} className={`tt-cell${slot ? ' assigned' : ''}`}
                            style={{ background: isOrGroup ? '#faf5ff' : undefined,
                              borderLeft: isOrGroup ? '2px solid #a78bfa' : undefined }}>
                            <div className="tt-slot">
                              {slot && isOrGroup ? (
                                <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                                  {slot.alternatives.map((alt, i) => {
                                    const s = subjects.find(x => x.id === alt.subjectId);
                                    const t = teachers.find(x => x.id === alt.teacherId);
                                    return (
                                      <div key={i} style={{ display:'flex', gap:3, alignItems:'center',
                                        paddingBottom: i < slot.alternatives.length-1 ? 1 : 0,
                                        borderBottom: i < slot.alternatives.length-1 ? '1px dashed #ddd6fe' : 'none' }}>
                                        <span className="sub" style={{ color:'#7c3aed', fontSize:'.6rem' }}>{s?.code}</span>
                                        <span className="teacher" style={{ fontSize:'.6rem' }}>{t?.name?.split(' ')[0]}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : slot ? (
                                <>{/* normal */}
                                  <span className="sub">{subjects.find(x=>x.id===slot.subjectId)?.code}</span>
                                  <span className="teacher">{teachers.find(x=>x.id===slot.teacherId)?.name?.split(' ')[0] ?? '—'}</span>
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

        {/* ── Teacher print pages ── */}
        {printTeacherIds.map(tid => {
          const teacher = teachers.find(t => t.id === tid);
          if (!teacher) return null;
          const periods = getPeriodsForTeacher(tid);
          return (
            <div key={tid} className="print-page">
              <div className="print-page-header" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ marginBottom: '0.5rem' }}>{school?.name || 'School Timetable'}</h2>
                <div style={{
                  display: 'inline-block',
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  padding: '0.4rem 1rem',
                  border: '2px solid #111',
                  borderRadius: '8px',
                  backgroundColor: '#f3f4f6',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact'
                }}>
                  Teacher: {teacher.name} <span style={{ fontSize: '1rem', fontWeight: 600, color: '#555', marginLeft: '.5rem' }}>({teacher.department})</span>
                </div>
                {school?.academicYear && <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#555' }}>Academic Year: {school.academicYear}</p>}
              </div>
              <table className="tt-table print-tt">
                <thead>
                  <tr>
                    <th className="day-col">DAY</th>
                    {periods.map(p => (
                      <th key={p.period}>
                        {p.label}{p.isBreak ? ' 🫖' : ''}
                        <br/><span style={{fontWeight:400,fontSize:'.55rem'}}>{formatAMPM(p.start)}–{formatAMPM(p.end)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeDays.map(dayKey => {
                    const dIdx = DAY_IDX[dayKey];
                    return (
                      <tr key={dayKey}>
                        <th className="day-col">{dayKey}</th>
                        {periods.map(p => {
                          if (p.isBreak) return <td key={p.period} className="tt-cell break"><div className="tt-slot"><span className="break-label">☕</span></div></td>;
                          const slot = schedule.find(s => s.teacherId === tid && s.day === dIdx && s.period === p.period);
                          const sub  = slot ? subjects.find(x => x.id === slot.subjectId) : null;
                          const cls  = slot ? classes.find(x => x.id === slot.classId)    : null;
                          return (
                            <td key={p.period} className={`tt-cell${slot ? ' assigned' : ''}`}>
                              <div className="tt-slot">
                                {slot ? (
                                  <>
                                    <span className="sub">{sub?.code}</span>
                                    <span className="teacher">{cls?.name}</span>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

    </div>
  );
}
