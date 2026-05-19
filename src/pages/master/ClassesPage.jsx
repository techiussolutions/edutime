import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../store/AppStore';
import { Plus, Pencil, Trash2, GraduationCap, ChevronRight, ChevronLeft, Check, BookOpen, Clock, ToggleLeft, ToggleRight, Link2, AlertCircle } from 'lucide-react';
import { formatAMPM } from '../../utils/formatTime';
import { canAssignTeacherToSubject, getTeacherWorkload } from '../../utils/timetableValidation';


const GRADES   = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const SECTIONS = ['A','B','C','D','E'];

const EMPTY_FORM = { grade: '10', section: 'A', classTeacherId: '' };

export default function ClassesPage() {
  const { state, dispatch } = useApp();
  const { subjects, teachers, classAssignments = [], classPeriodSettings = {}, settings } = state;

  const [modal,          setModal]          = useState(null);
  const [step,           setStep]           = useState(1);
  const [form,           setForm]           = useState(EMPTY_FORM);
  const [subjectTeachers,setSubjectTeachers]= useState({});
  const [orGroups,       setOrGroups]       = useState([]); // [{label, subjectIds[]}]
  const [newOrLabel,     setNewOrLabel]     = useState('');
  // Period restriction state
  const [useCustom,      setUseCustom]      = useState(false);
  const [blockedPeriods, setBlockedPeriods] = useState([]);
  const [confirmDel,     setConfirmDel]     = useState(null);
  const [matrixModal,    setMatrixModal]    = useState(null); // { grade, classes }
  const [assignmentWarnings, setAssignmentWarnings] = useState({}); // { `${subId}_${tid}`: { message, level } }


  const applicableSubjects = useMemo(() =>
    form.id ? subjects.filter(s => (s.applicableClasses || []).includes(form.id)) : [],
  [subjects, form.id]);

  // ── Open modals ───────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setSubjectTeachers({});
    setOrGroups([]);
    setNewOrLabel('');
    setUseCustom(false);
    setBlockedPeriods([]);
    setAssignmentWarnings({});
    setStep(1); setModal('add');
  };


  const openEdit = (cls) => {
    setForm({ ...cls });
    const existing = {};
    classAssignments.filter(a => a.classId === cls.id).forEach(a => {
      const ids = a.teacherIds?.length ? a.teacherIds : (a.teacherId ? [a.teacherId] : []);
      existing[a.subjectId] = ids.filter(Boolean);
    });
    setSubjectTeachers(existing);
    setOrGroups((state.classOrGroups?.[cls.id] || []).map(g => ({ ...g, subjectIds: [...g.subjectIds] })));
    setNewOrLabel('');
    const saved = classPeriodSettings[cls.id];
    const bp = saved?.blockedPeriods || [];
    setUseCustom(bp.length > 0);
    setBlockedPeriods(bp);
    setAssignmentWarnings({});
    setStep(1); setModal(cls);
  };



  const toggleBlocked = (period) => {
    setBlockedPeriods(prev =>
      prev.includes(period) ? prev.filter(n => n !== period) : [...prev, period]
    );
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = () => {
    const name = `${form.grade} - ${form.section}`;
    let classId;
    if (modal === 'add') {
      classId = `c_${Date.now()}`;
      dispatch({ type: 'ADD_CLASS', payload: { ...form, id: classId, name } });
    } else {
      classId = modal.id;
      dispatch({ type: 'UPDATE_CLASS', payload: { ...form, name } });
    }
    dispatch({
      type: 'SET_CLASS_ASSIGNMENTS',
      payload: {
        classId,
        assignments: applicableSubjects.map(sub => ({
          subjectId: sub.id,
          teacherIds: subjectTeachers[sub.id] || [],
        })),
      },
    });

    dispatch({ type: 'SET_CLASS_PERIOD_SETTINGS', payload: { classId, blockedPeriods: useCustom ? blockedPeriods : [] } });
    // Save OR groups (filter out empty ones)
    const validGroups = orGroups.filter(g => g.label.trim() && g.subjectIds.length >= 2);
    dispatch({ type: 'SET_CLASS_OR_GROUPS', payload: { classId, groups: validGroups } });

    // Auto-propagate OR groups to synced classes so they don't need manual setup
    validGroups.forEach(grp => {
      if (!grp.syncClassIds?.length) return;
      grp.syncClassIds.forEach(syncCid => {
        const existing = (state.classOrGroups?.[syncCid] || []).filter(g => g.label !== grp.label);
        dispatch({
          type: 'SET_CLASS_OR_GROUPS',
          payload: {
            classId: syncCid,
            // Keep other OR groups, add/replace this one (without syncClassIds to avoid circular)
            groups: [...existing, { label: grp.label, subjectIds: grp.subjectIds, syncClassIds: [] }],
          },
        });
      });
    });

    setModal(null);
  };


  // ── Grouped display ───────────────────────────────────────────────────────
  const uniqueGrades = [...new Set(state.classes.map(c => c.grade))].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
  const grouped = uniqueGrades.map(grade => {
    const gClasses = state.classes.filter(c => c.grade === grade);
    gClasses.sort((a, b) => (a.section || '').localeCompare(b.section || ''));
    return { id: `grade_${grade}`, label: `Grade ${grade}`, classes: gClasses, grade };
  });

  const stepDefs = [
    { n: 1, label: 'Class Info' },
    { n: 2, label: 'Assign Teachers' },
    { n: 3, label: 'Period Schedule' },
  ];

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div><h2>Classes & Sections</h2><p>Manage grade-section combinations, subject-teacher assignments, and per-class period schedules.</p></div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15}/> Add Class</button>
      </div>

      {grouped.map(group => (
        <div key={group.id} style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <GraduationCap size={16} color="var(--clr-primary)"/> {group.label}
            <span className="badge badge-indigo">{group.classes.length}</span>
            {group.classes.length > 0 && (
              <button className="btn btn-outline btn-sm" onClick={() => setMatrixModal({ grade: group.grade, classes: group.classes })} style={{ padding: '.15rem .45rem', fontSize: '.7rem', gap: '.25rem', marginLeft: '.25rem' }}>
                <BookOpen size={11}/> Compare Divisions
              </button>
            )}
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.75rem' }}>
            {group.classes.map(cls => {
              const classTeacher  = teachers.find(t => t.id === cls.classTeacherId);
              const allAssignments = classAssignments.filter(a => a.classId === cls.id);
              // Only count rows that actually have a teacher (teacherIds[] non-empty or legacy teacherId)
              const assignments   = allAssignments.filter(a =>
                (a.teacherIds?.length > 0) || !!a.teacherId
              );
              const totalSubjs    = subjects.filter(s => (s.applicableClasses || []).includes(cls.id)).length;
              const periodSetting = classPeriodSettings[cls.id];
              const blockedCount = periodSetting?.blockedPeriods?.length ?? 0;
              const nonBreakCount = settings.periodTimings.filter(p => !p.isBreak).length;

              return (
                <div key={cls.id} className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--clr-primary)' }}>{cls.name}</h3>
                    <div style={{ display: 'flex', gap: '.25rem' }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(cls)}><Pencil size={13}/></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setConfirmDel(cls)}><Trash2 size={13} color="var(--clr-red)"/></button>
                    </div>
                  </div>

                  <div style={{ fontSize: '.78rem', color: 'var(--tx-muted)', marginBottom: '.25rem' }}>Class Teacher</div>
                  <div style={{ fontSize: '.83rem', fontWeight: 500, marginBottom: '.5rem' }}>
                    {classTeacher?.name ?? '— Not Assigned —'}
                  </div>

                  {/* Period schedule badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem', fontSize: '.74rem',
                    color: blockedCount > 0 ? '#92400e' : 'var(--tx-muted)',
                    background: blockedCount > 0 ? '#fef3c7' : 'var(--bg-muted)',
                    border: `1px solid ${blockedCount > 0 ? '#fcd34d' : 'var(--border)'}`,
                    borderRadius: 'var(--r-md)', padding: '.2rem .5rem', marginBottom: '.4rem', width: 'fit-content' }}>
                    <Clock size={10}/>
                    {blockedCount > 0 ? `${blockedCount} period(s) blocked · ${nonBreakCount - blockedCount} active` : `${nonBreakCount} periods/day`}
                  </div>

                  {/* OR groups badge */}
                  {(state.classOrGroups?.[cls.id]?.length > 0) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.74rem',
                      color: '#7c3aed', background: '#f5f3ff', border: '1px solid #c4b5fd',
                      borderRadius: 'var(--r-md)', padding: '.2rem .5rem', marginBottom: '.4rem', width: 'fit-content' }}>
                      <Link2 size={10}/>
                      {state.classOrGroups[cls.id].length} OR group{state.classOrGroups[cls.id].length > 1 ? 's' : ''}
                      {' · '}{state.classOrGroups[cls.id].map(g => g.label).join(', ')}
                    </div>
                  )}

                  {/* Assignment summary */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem', fontSize: '.76rem',
                    color: assignments.length < totalSubjs ? 'var(--clr-amber)' : 'var(--clr-green)',
                    background: assignments.length < totalSubjs ? '#fef3c7' : '#f0fdf4',
                    border: `1px solid ${assignments.length < totalSubjs ? '#fcd34d' : '#86efac'}`,
                    borderRadius: 'var(--r-md)', padding: '.3rem .6rem' }}>
                    <BookOpen size={11}/>
                    {assignments.length}/{totalSubjs} subjects assigned
                  </div>

                  {assignments.length > 0 && (
                    <div style={{ marginTop: '.5rem', display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                      {assignments.slice(0, 5).map(a => {
                        const sub = subjects.find(s => s.id === a.subjectId);
                        const tIds = a.teacherIds?.length ? a.teacherIds : (a.teacherId ? [a.teacherId] : []);
                        const t = teachers.find(t => t.id === tIds[0]);
                        return (
                          <span key={a.id} className="badge badge-gray" style={{ fontSize: '.68rem' }} title={`${sub?.name} → ${t?.name}`}>
                            {sub?.code}: {t?.name?.split(' ')[0] ?? '—'}
                          </span>
                        );
                      })}
                      {assignments.length > 5 && <span className="badge badge-gray" style={{ fontSize: '.68rem' }}>+{assignments.length - 5} more</span>}
                    </div>
                  )}
                </div>
              );

            })}
          </div>
        </div>
      ))}

      {/* ── ADD / EDIT MODAL ── */}
      {modal !== null && createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal modal-lg" style={{ maxWidth: 660 }}>
            <div className="modal-header">
              <div>
                <h3>{modal === 'add' ? 'Add New Class' : `Edit ${modal.name}`}</h3>
                <p style={{ fontSize: '.8rem', color: 'var(--tx-muted)', margin: 0 }}>Step {step} of 3 — {stepDefs[step-1].label}</p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', padding: '.75rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-muted)', alignItems: 'center' }}>
              {stepDefs.map((s, i) => (
                <React.Fragment key={s.n}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: step > s.n ? 'var(--clr-green)' : step === s.n ? 'var(--clr-primary)' : 'var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: step >= s.n ? 'white' : 'var(--tx-muted)', fontSize: '.72rem', fontWeight: 700,
                    }}>
                      {step > s.n ? <Check size={12}/> : s.n}
                    </div>
                    <span style={{ fontSize: '.79rem', fontWeight: step === s.n ? 700 : 500,
                      color: step === s.n ? 'var(--clr-primary)' : 'var(--tx-muted)' }}>{s.label}</span>
                  </div>
                  {i < stepDefs.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: step > s.n ? 'var(--clr-green)' : 'var(--border)', margin: '0 .5rem' }}/>
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="modal-body">

              {/* ── STEP 1: Class Info ── */}
              {step === 1 && (
                <div className="grid-2" style={{ gap: '1rem' }}>
                  <div className="field"><label>Grade *</label>
                    <select className="input" value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))}>
                      {GRADES.map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Section *</label>
                    <select className="input" value={form.section} onChange={e => setForm(p => ({ ...p, section: e.target.value }))}>
                      {SECTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Class Teacher</label>
                    <select className="input" value={form.classTeacherId} onChange={e => setForm(p => ({ ...p, classTeacherId: e.target.value }))}>
                      <option value="">— None —</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* ── STEP 2: Subject-Teacher Assignments + OR Groups ── */}
              {step === 2 && (() => {
                // Helper: add/remove a teacher for a subject
                const addTeacher = (subId, tid) => {
                  if (!tid) return;
                  
                  // ── Validate before adding ──────────────────────────────────────
                  const result = canAssignTeacherToSubject(state, tid, form.id, subId);
                  const warningKey = `${subId}_${tid}`;
                  
                  if (!result.canAssign) {
                    // Cannot assign - show error
                    setAssignmentWarnings(prev => ({
                      ...prev,
                      [warningKey]: { message: result.message, level: 'error' }
                    }));
                    return;
                  }
                  
                  // Check workload for warnings
                  const workload = getTeacherWorkload(state, tid);
                  if (workload && workload.utilisationPercent > 80) {
                    setAssignmentWarnings(prev => ({
                      ...prev,
                      [warningKey]: {
                        message: `Teacher utilisation at ${workload.utilisationPercent}%. Remaining: ${workload.remainingCapacity} periods.`,
                        level: 'warn'
                      }
                    }));
                  } else {
                    // Clear any previous warning
                    setAssignmentWarnings(prev => {
                      const next = { ...prev };
                      delete next[warningKey];
                      return next;
                    });
                  }
                  
                  // Add the teacher
                  setSubjectTeachers(prev => {
                    const cur = prev[subId] || [];
                    return cur.includes(tid) ? prev : { ...prev, [subId]: [...cur, tid] };
                  });
                };
                const removeTeacher = (subId, tid) => {
                  setSubjectTeachers(prev => ({ ...prev, [subId]: (prev[subId] || []).filter(id => id !== tid) }));
                  // Clear warning when removing
                  setAssignmentWarnings(prev => {
                    const next = { ...prev };
                    delete next[`${subId}_${tid}`];
                    return next;
                  });
                };
                const assignedCount = applicableSubjects.filter(s => (subjectTeachers[s.id] || []).length > 0).length;
                return (
                  <div>
                    <p style={{ marginBottom: '1rem', fontSize: '.875rem', color: 'var(--tx-muted)' }}>
                      {modal === 'add' ? (
                        <>Assign one or more teachers to each subject for <strong>{form.grade} - {form.section}</strong>. <br/><span style={{fontSize: '.8rem', color: 'var(--clr-amber)'}}>Note: You must first assign subjects to this class from the Subjects page before you can assign teachers here.</span></>
                      ) : (
                        <>Assign one or more teachers to each subject for <strong>{form.grade} - {form.section}</strong>.</>
                      )}
                    </p>
                    {applicableSubjects.length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--bg-muted)', borderRadius: 'var(--r-lg)', border: '1px dashed var(--border)', color: 'var(--tx-muted)', fontSize: '.9rem' }}>
                        No subjects are assigned to this class yet.<br/>
                        Go to the <strong>Subjects</strong> page to assign subjects to this class.
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                        <thead><tr><th>Subject</th><th>Assigned Teacher(s)</th></tr></thead>
                        <tbody>
                          {applicableSubjects.map(sub => {
                            const qualified  = teachers.filter(t => t.subjects?.includes(sub.id));
                            const pool       = qualified.length > 0 ? qualified : teachers;
                            const assigned   = subjectTeachers[sub.id] || [];
                            const unselected = pool.filter(t => !assigned.includes(t.id));
                            return (
                              <tr key={sub.id}>
                                <td style={{ verticalAlign: 'top', paddingTop: '.65rem' }}>
                                  <div style={{ fontWeight: 600 }}>{sub.name}</div>
                                  <div style={{ fontSize: '.72rem', color: 'var(--tx-muted)' }}>{sub.code}</div>
                                </td>
                                <td>
                                  {/* Chips for already-assigned teachers */}
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginBottom: assigned.length ? '.4rem' : 0 }}>
                                    {assigned.map(tid => {
                                      const t = teachers.find(x => x.id === tid);
                                      const warningKey = `${sub.id}_${tid}`;
                                      const warning = assignmentWarnings[warningKey];
                                      return (
                                        <div key={tid} style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                                          <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '.25rem',
                                            background: warning?.level === 'error' ? '#fee2e2' : warning?.level === 'warn' ? '#fef3c7' : '#ede9fe',
                                            color: warning?.level === 'error' ? '#991b1b' : warning?.level === 'warn' ? '#92400e' : '#5b21b6',
                                            border: `1px solid ${warning?.level === 'error' ? '#fca5a5' : warning?.level === 'warn' ? '#fcd34d' : '#c4b5fd'}`,
                                            borderRadius: 20, padding: '.15rem .55rem', fontSize: '.76rem', fontWeight: 600,
                                          }}>
                                            {warning?.level === 'error' && <AlertCircle size={12} />}
                                            {t?.name?.split(' ')[0] ?? tid}
                                            <button style={{ background: 'none', border: 'none', cursor: 'pointer',
                                              color: warning?.level === 'error' ? '#991b1b' : warning?.level === 'warn' ? '#92400e' : '#7c3aed', padding: 0, lineHeight: 1, fontSize: '.85rem' }}
                                              onClick={() => removeTeacher(sub.id, tid)} title="Remove">×</button>
                                          </span>
                                          {warning && (
                                            <div style={{ fontSize: '.68rem', color: warning.level === 'error' ? '#991b1b' : '#92400e', marginLeft: '.3rem' }}>
                                              ⚠️ {warning.message}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {/* Add teacher dropdown */}
                                  {unselected.length > 0 && (
                                    <select className="input" style={{ width: '100%', fontSize: '.8rem' }}
                                      value=""
                                      onChange={e => addTeacher(sub.id, e.target.value)}>
                                      <option value="">{assigned.length ? '+ Add another teacher…' : '— Assign teacher —'}</option>
                                      {unselected.map(t => {
                                        const workload = getTeacherWorkload(state, t.id);
                                        const display = workload
                                          ? `${t.name} (${workload.assignedPeriods}/${workload.maxPeriods} periods)`
                                          : `${t.name} (${t.department})`;
                                        return (
                                          <option key={t.id} value={t.id}>{display}</option>
                                        );
                                      })}
                                    </select>
                                  )}
                                  {qualified.length === 0 && (
                                    <div style={{ fontSize: '.7rem', color: 'var(--tx-muted)', marginTop: '.2rem' }}>
                                      No qualified teacher — all teachers shown
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        </table>
                      </div>
                    )}
                    
                    {applicableSubjects.length > 0 && (
                      <div style={{ marginTop: '.75rem', fontSize: '.8rem', color: 'var(--tx-muted)' }}>
                        ✅ {assignedCount} of {applicableSubjects.length} subjects assigned
                      </div>
                    )}

                    {/* ── OR Groups section ── */}
                    {applicableSubjects.length > 0 && (
                      <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
                      <Link2 size={15} color="#7c3aed"/>
                      <strong style={{ fontSize: '.875rem' }}>OR Subject Groups</strong>
                      <span style={{ fontSize: '.78rem', color: 'var(--tx-muted)' }}>
                        — subjects students choose between (scheduled simultaneously)
                      </span>
                    </div>

                    {/* Existing OR groups */}
                    {orGroups.map((grp, gi) => {
                      // Peer classes: same grade, different section
                      const peerClasses = state.classes.filter(c => c.grade === form.grade && c.id !== form.id);
                      return (
                      <div key={gi} style={{ marginBottom: '.75rem', padding: '.75rem 1rem',
                        borderRadius: 'var(--r-lg)', border: '1.5px solid #c4b5fd', background: '#faf5ff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                          <input
                            className="input" style={{ flex: 1, fontSize: '.82rem' }}
                            placeholder="Group label (e.g. Language II, Elective A)"
                            value={grp.label}
                            onChange={e => setOrGroups(prev => prev.map((g, i) =>
                              i === gi ? { ...g, label: e.target.value } : g
                            ))}
                          />
                          <button className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => setOrGroups(prev => prev.filter((_, i) => i !== gi))}>
                            <Trash2 size={13} color="var(--clr-red)"/>
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                          {applicableSubjects.map(sub => {
                            const checked = grp.subjectIds.includes(sub.id);
                            const hasTeacher = !!subjectTeachers[sub.id];
                            return (
                              <label key={sub.id} style={{
                                display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer',
                                padding: '.25rem .6rem', borderRadius: 'var(--r-md)', fontSize: '.78rem',
                                border: `1.5px solid ${checked ? '#7c3aed' : 'var(--border)'}`,
                                background: checked ? '#ede9fe' : 'transparent',
                              }}>
                                <input type="checkbox" checked={checked}
                                  onChange={e => setOrGroups(prev => prev.map((g, i) =>
                                    i === gi
                                      ? { ...g, subjectIds: e.target.checked
                                          ? [...g.subjectIds, sub.id]
                                          : g.subjectIds.filter(id => id !== sub.id) }
                                      : g
                                  ))}
                                />
                                <span style={{ fontWeight: 600 }}>{sub.code}</span>
                                <span style={{ color: hasTeacher ? 'var(--tx-muted)' : 'var(--tx-xmuted)' }}>
                                  {sub.name}{!hasTeacher ? ' (no teacher)' : ''}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {grp.subjectIds.length < 2 && (
                          <div style={{ fontSize: '.72rem', color: '#7c3aed', marginTop: '.4rem' }}>
                            ⚠️ Select at least 2 subjects to form a valid OR group.
                          </div>
                        )}

                        {/* Sync with other classes in same grade */}
                        {peerClasses.length > 0 && (
                          <div style={{ marginTop: '.75rem', borderTop: '1px dashed #c4b5fd', paddingTop: '.6rem' }}>
                            <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#7c3aed', marginBottom: '.35rem' }}>
                              Sync this OR group with other divisions (same slot):
                            </div>
                            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                              {peerClasses.map(pc => {
                                const synced = (grp.syncClassIds || []).includes(pc.id);
                                return (
                                  <label key={pc.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '.3rem', cursor: 'pointer',
                                    padding: '.2rem .55rem', borderRadius: 'var(--r-md)', fontSize: '.76rem',
                                    border: `1.5px solid ${synced ? '#7c3aed' : 'var(--border)'}`,
                                    background: synced ? '#ede9fe' : 'transparent',
                                  }}>
                                    <input type="checkbox" checked={synced}
                                      onChange={e => setOrGroups(prev => prev.map((g, i) =>
                                        i === gi ? {
                                          ...g,
                                          syncClassIds: e.target.checked
                                            ? [...(g.syncClassIds || []), pc.id]
                                            : (g.syncClassIds || []).filter(id => id !== pc.id)
                                        } : g
                                      ))}
                                    />
                                    <span style={{ fontWeight: 600 }}>{pc.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                            {(grp.syncClassIds || []).length > 0 && (
                              <div style={{ fontSize: '.7rem', color: 'var(--tx-muted)', marginTop: '.3rem' }}>
                                This OR group will be scheduled at the same time slot across all selected divisions.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                    })}

                    {/* Add new group button */}
                    <button className="btn btn-ghost btn-sm"
                      style={{ color: '#7c3aed', border: '1px dashed #c4b5fd' }}
                      onClick={() => setOrGroups(prev => [...prev, { label: '', subjectIds: [] }])}>
                      <Plus size={13}/> Add OR Group
                    </button>
                    {orGroups.length === 0 && (
                      <div style={{ fontSize: '.76rem', color: 'var(--tx-muted)', marginTop: '.5rem' }}>
                        No OR groups yet. Add one if this class has elective subjects that run simultaneously.
                      </div>
                    )}
                  </div>
                  )}
                  </div>
                );
              })()}


              {/* ── STEP 3: Period Schedule ── */}
              {step === 3 && (
                <div>
                  {/* Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem',
                    padding: '.875rem 1rem', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg-muted)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '.875rem' }}>Block Specific Periods</div>
                      <div style={{ fontSize: '.78rem', color: 'var(--tx-muted)', marginTop: '.15rem' }}>
                        {useCustom
                          ? blockedPeriods.length > 0
                            ? `${blockedPeriods.length} period(s) blocked — this class starts later or has a shorter day.`
                            : 'No periods blocked yet — toggle individual periods below to block them.'
                          : 'This class uses the full school schedule (all periods available).'}
                      </div>
                    </div>
                    <button
                      onClick={() => { setUseCustom(p => !p); if (useCustom) setBlockedPeriods([]); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: useCustom ? 'var(--clr-primary)' : 'var(--tx-muted)' }}>
                      {useCustom ? <ToggleRight size={36}/> : <ToggleLeft size={36}/>}
                    </button>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th><th>Label</th><th>Time</th><th>Type</th>
                          {useCustom && <th style={{ textAlign: 'center', width: 110 }}>Available?</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {settings.periodTimings.map(p => {
                          const isBlocked = useCustom && blockedPeriods.includes(p.period);
                          return (
                            <tr key={p.period} style={{
                              opacity: isBlocked ? 0.45 : 1,
                              background: isBlocked ? '#fef2f2' : undefined,
                            }}>
                              <td>{p.period}</td>
                              <td style={{ textDecoration: isBlocked ? 'line-through' : undefined }}>{p.label}</td>
                              <td style={{ whiteSpace: 'nowrap' }}>{formatAMPM(p.start)} – {formatAMPM(p.end)}</td>
                              <td>{p.isBreak ? '☕ Break' : '📚 Teaching'}</td>
                              {useCustom && (
                                <td style={{ textAlign: 'center' }}>
                                  {p.isBreak ? (
                                    <span style={{ fontSize: '.72rem', color: 'var(--tx-muted)' }}>—</span>
                                  ) : (
                                    <button
                                      onClick={() => toggleBlocked(p.period)}
                                      title={isBlocked ? 'Click to make available' : 'Click to block'}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                                        color: isBlocked ? 'var(--clr-red)' : 'var(--clr-green)' }}>
                                      {isBlocked ? <ToggleLeft size={28}/> : <ToggleRight size={28}/>}
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: '.75rem', color: 'var(--tx-muted)', marginTop: '.5rem' }}>
                    {useCustom
                      ? 'Blocked periods are skipped during timetable generation and shown as unavailable in the grid.'
                      : 'Enable above to block specific periods (e.g. for classes that start later or end earlier).'}
                  </p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {step > 1 && <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}><ChevronLeft size={15}/> Back</button>}
              <div style={{ flex: 1 }}/>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              {step < 3
                ? <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Next <ChevronRight size={15}/></button>
                : <button className="btn btn-primary" onClick={save}><Check size={15}/> {modal === 'add' ? 'Add Class' : 'Save Changes'}</button>
              }
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete confirmation */}
      {confirmDel && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header"><h3>Delete {confirmDel.name}?</h3></div>
            <div className="modal-body"><p>This permanently removes the class, its assignments, and period settings.</p></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { dispatch({ type: 'DELETE_CLASS', payload: confirmDel.id }); setConfirmDel(null); }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Division Comparison Matrix Modal */}
      {matrixModal && createPortal(
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setMatrixModal(null)}>
          <div className="modal modal-lg" style={{ maxWidth: 840 }}>
            <div className="modal-header">
              <div>
                <h3>Grade {matrixModal.grade} — Division Comparison Matrix</h3>
                <p style={{ fontSize: '.8rem', color: 'var(--tx-muted)', margin: 0 }}>Compare subject mapping and teacher assignments across all sections</p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setMatrixModal(null)}>✕</button>
            </div>
            
            <div className="modal-body" style={{ padding: '1.5rem' }}>
              <div className="table-wrap" style={{ maxHeight: '60vh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-muted)' }}>
                      <th style={{ padding: '.75rem 1rem', width: 220, borderBottom: '1px solid var(--border)' }}>Subject (Code)</th>
                      {matrixModal.classes.map(cls => (
                        <th key={cls.id} style={{ padding: '.75rem 1rem', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Section {cls.section}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Get all subjects applicable to at least one class/section in this grade
                      const gradeClassIds = matrixModal.classes.map(c => c.id);
                      const gradeSubjects = subjects.filter(sub => 
                        (sub.applicableClasses || []).some(cid => gradeClassIds.includes(cid))
                      );

                      if (gradeSubjects.length === 0) {
                        return (
                          <tr>
                            <td colSpan={matrixModal.classes.length + 1} style={{ textAlign: 'center', padding: '2rem', color: 'var(--tx-muted)' }}>
                              No subjects are currently mapped to any division in this grade. Please assign classes to subjects.
                            </td>
                          </tr>
                        );
                      }

                      return gradeSubjects.map(sub => {
                        return (
                          <tr key={sub.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '.875rem 1rem', fontWeight: 600 }}>
                              {sub.name} <span style={{ fontSize: '.75rem', color: 'var(--tx-muted)', fontWeight: 400 }}>({sub.code})</span>
                            </td>
                            {matrixModal.classes.map(cls => {
                              const isMapped = (sub.applicableClasses || []).includes(cls.id);
                              
                              if (!isMapped) {
                                return (
                                  <td key={cls.id} style={{ padding: '.875rem 1rem', textAlign: 'center' }}>
                                    <span className="badge badge-gray" style={{ opacity: 0.6, fontSize: '.75rem', display: 'inline-flex', gap: '.25rem' }}>
                                      ➖ Not Added
                                    </span>
                                  </td>
                                );
                              }

                              const assignment = classAssignments.find(a => a.classId === cls.id && a.subjectId === sub.id);
                              const teacherIds = assignment?.teacherIds?.length ? assignment.teacherIds : (assignment?.teacherId ? [assignment.teacherId] : []);
                              const hasTeacher = teacherIds.length > 0;

                              if (hasTeacher) {
                                const teacherNames = teacherIds
                                  .map(tid => teachers.find(t => t.id === tid)?.name?.split(' ')[0])
                                  .filter(Boolean)
                                  .join(', ');
                                
                                return (
                                  <td key={cls.id} style={{ padding: '.875rem 1rem', textAlign: 'center' }}>
                                    <span className="badge badge-green" style={{ fontSize: '.75rem', display: 'inline-flex', gap: '.25rem' }}>
                                      ✔️ {teacherNames || 'Assigned'}
                                    </span>
                                  </td>
                                );
                              } else {
                                return (
                                  <td key={cls.id} style={{ padding: '.875rem 1rem', textAlign: 'center' }}>
                                    <span className="badge badge-red" style={{ fontSize: '.75rem', display: 'inline-flex', gap: '.25rem', fontWeight: 700 }}>
                                      ⚠️ Missing Teacher
                                    </span>
                                  </td>
                                );
                              }
                            })}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.25rem', padding: '0.75rem', borderRadius: 'var(--r-md)', background: 'var(--bg-muted)', flexWrap: 'wrap', fontSize: '.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem' }}>
                  <span className="badge badge-green" style={{ pointerEvents: 'none' }}>✔️ [Name]</span>
                  <span style={{ color: 'var(--tx-muted)' }}>Mapped & Teacher Assigned</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem' }}>
                  <span className="badge badge-red" style={{ pointerEvents: 'none' }}>⚠️ Missing Teacher</span>
                  <span style={{ color: 'var(--tx-muted)' }}>Mapped, but Teacher is unassigned</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem' }}>
                  <span className="badge badge-gray" style={{ pointerEvents: 'none', opacity: 0.6 }}>➖ Not Added</span>
                  <span style={{ color: 'var(--tx-muted)' }}>Subject is not mapped to this Section</span>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setMatrixModal(null)}>Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
