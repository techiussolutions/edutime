import React, { useState, useMemo } from 'react';
import { useApp } from '../store/AppStore';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { checkConflict } from '../utils/engine';
import { CheckCircle2, AlertCircle, Wand2, Lock, Unlock, X, User } from 'lucide-react';

const DAY_NAMES = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday' };
const DAY_IDX  = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5 };

export default function TimetablePage() {
  const { state, dispatch } = useApp();
  const { can } = useAuth();
  const navigate = useNavigate();
  const canEdit = can('editTimetable');
  const {
    settings, schedule, teachers, subjects, classes,
    lockedSlots = [], classAssignments = [], teacherAvailability = {}
  } = state;

  const [viewMode,       setViewMode]       = useState('class');
  const [selectedClass,  setSelectedClass]  = useState(classes[0]?.id);
  const [selectedTeacher,setSelectedTeacher]= useState(teachers[0]?.id);
  const [editing,        setEditing]        = useState(null);   // { classId, dayKey, period }
  const [conflict,       setConflict]       = useState(null);

  const activeDays = Object.entries(settings.workingDays).filter(([,v])=>v).map(([k])=>k);

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

    return assignedSubs.map(a => {
      const sub = subjects.find(s => s.id === a.subjectId);
      const teacher = teachers.find(t => t.id === a.teacherId);
      // Check if assigned elsewhere
      const busy = teacher ? schedule.some(s =>
        s.teacherId===teacher.id && s.day===dIdx && s.period===period && s.id!==excludeId
      ) : false;
      // Check if blocked in availability settings
      const unavailable = teacher ? teacherAvailability?.[teacher.id]?.[dayKey]?.[period] === false : false;

      // How many times this subject already appears for this class this week
      const weekCount = schedule.filter(s => s.classId===classId && s.subjectId===a.subjectId).length;
      return { sub, teacher, subjectId: a.subjectId, teacherId: a.teacherId, busy, unavailable, weekCount };
    }).filter(o => o.sub && o.teacher);
  }, [editing, classAssignments, subjects, teachers, schedule]);

  // ── Open/close edit ──────────────────────────────────────────────────────
  const openEdit = (classId, dayKey, period) => {
    if (!canEdit || isLocked(classId, dayKey, period)) return;
    setEditing({ classId, dayKey, period });
    setConflict(null);
  };

  // ── Quick-assign from visual block ───────────────────────────────────────
  const quickAssign = (opt) => {
    if (opt.busy || opt.unavailable) return; // teacher is occupied or blocked, not clickable
    const { classId, dayKey, period } = editing;
    const dIdx = DAY_IDX[dayKey];
    const id = slotId(classId, dayKey, period);
    dispatch({ type:'ASSIGN_SLOT', payload:{ classId, day:dIdx, period, teacherId:opt.teacherId, subjectId:opt.subjectId } });
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
      <div className="card card-body" style={{ marginBottom:'1rem', display:'flex', gap:'1rem', alignItems:'center', flexWrap:'wrap' }}>
        <div className="tabs" style={{ margin:0, borderBottom:'none' }}>
          <button className={`tab-btn ${viewMode==='class'?'active':''}`} onClick={()=>setViewMode('class')}>Class View</button>
          <button className={`tab-btn ${viewMode==='teacher'?'active':''}`} onClick={()=>setViewMode('teacher')}>Teacher View</button>
        </div>
        <div style={{ flex:1 }}/>
        {viewMode==='class'
          ? <select className="input" style={{width:200}} value={selectedClass} onChange={e=>setSelectedClass(e.target.value)}>
              {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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

      {/* Grid */}
      <div className="card">
        <div className="tt-grid">
          <table className="tt-table">
            <thead>
              <tr>
                <th className="day-col">DAY</th>
                {settings.periodTimings.map(p => (
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
                  {settings.periodTimings.map(p => {
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

                    return (
                      <td
                        key={p.period}
                        className={`tt-cell${slot ? ' assigned' : ''}`}
                        style={{
                          cursor: canEdit && viewMode==='class' && !locked ? 'pointer' : 'default',
                          background: locked ? '#fffbeb' : undefined,
                          position: 'relative',
                        }}
                        onClick={() => canEdit && viewMode==='class' && openEdit(selectedClass, dayKey, p.period)}
                        title={locked ? (canEdit ? 'Locked — click 🔒 to unlock' : 'Locked') : (canEdit && viewMode==='class' ? 'Click to edit' : undefined)}
                      >
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
                            <>
                              <span className="sub">{subject?.code}</span>
                              <span className="teacher">{teacher?.name?.split(' ')[0] ?? '—'}</span>
                              {cls && <span className="cls">{cls.name}</span>}
                            </>
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
                      {visualOptions.map(opt => {
                        const currentSlot = getCellData(editing.classId, editing.dayKey, editing.period);
                        const isCurrentlyAssigned = currentSlot?.subjectId===opt.subjectId;
                        return (
                          <button
                            key={opt.subjectId}
                            onClick={() => !opt.busy && quickAssign(opt)}
                            title={opt.busy ? `${opt.teacher?.name} is already teaching another class this period` : `Assign ${opt.sub?.name} (${opt.teacher?.name})`}
                            style={{
                              display:'flex', flexDirection:'column', alignItems:'flex-start',
                              padding:'.75rem 1rem', borderRadius:'var(--r-lg)',
                              border:`2px solid ${opt.busy ? 'var(--clr-red)' : isCurrentlyAssigned ? 'var(--clr-primary)' : 'var(--border)'}`,
                              background: opt.busy ? '#fef2f2' : isCurrentlyAssigned ? 'var(--clr-primary-l)' : 'var(--bg-card)',
                              cursor: opt.busy ? 'not-allowed' : 'pointer',
                              opacity: opt.busy ? 0.65 : 1,
                              minWidth:140, textAlign:'left',
                              transition:'all .15s',
                              position:'relative',
                            }}
                          >
                            {/* Subject pill */}
                            <span style={{ fontSize:'.7rem', fontWeight:800, letterSpacing:.5, background: opt.busy?'#fca5a5':'var(--clr-primary)', color:'#fff', borderRadius:4, padding:'1px 7px', marginBottom:'.35rem' }}>
                              {opt.sub?.code}
                            </span>
                            <span style={{ fontWeight:700, fontSize:'.875rem', color:'var(--tx-main)' }}>{opt.sub?.name}</span>
                            <div style={{ display:'flex', alignItems:'center', gap:'.3rem', marginTop:'.3rem', fontSize:'.75rem', color: (opt.busy || opt.unavailable)?'var(--clr-red)':'var(--tx-muted)' }}>
                              <User size={11}/> {opt.teacher?.name?.split(' ')[0]}
                              {opt.busy && <span style={{ fontWeight:700 }}>· BUSY</span>}
                              {opt.unavailable && <span style={{ fontWeight:700 }}>· UNAVAILABLE</span>}
                            </div>
                            <div style={{ fontSize:'.68rem', color:'var(--tx-muted)', marginTop:'.2rem' }}>
                              {opt.weekCount} period{opt.weekCount!==1?'s':''} this week
                            </div>
                            {isCurrentlyAssigned && !opt.busy && (
                              <span style={{ position:'absolute', top:4, right:6, fontSize:'.65rem', color:'var(--clr-primary)', fontWeight:700 }}>✓ current</span>
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
    </div>
  );
}
