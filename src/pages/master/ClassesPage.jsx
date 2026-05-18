import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../store/AppStore';
import { Plus, Pencil, Trash2, GraduationCap, ChevronRight, ChevronLeft, Check, BookOpen, Clock, ToggleLeft, ToggleRight, Link2 } from 'lucide-react';
import { formatAMPM } from '../../utils/formatTime';
import TimePicker from '../../components/TimePicker';


const GRADES   = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const SECTIONS = ['A','B','C','D','E'];

const EMPTY_FORM = { grade: '10', section: 'A', classTeacherId: '' };

// Build a default period list from global settings for a new custom override
function defaultCustomPeriods(globalTimings) {
  return globalTimings.map(p => ({ ...p }));
}

export default function ClassesPage() {
  const { state, dispatch } = useApp();
  const { subjects, teachers, classAssignments = [], classPeriodSettings = {}, settings } = state;

  const [modal,          setModal]          = useState(null);
  const [step,           setStep]           = useState(1);
  const [form,           setForm]           = useState(EMPTY_FORM);
  const [subjectTeachers,setSubjectTeachers]= useState({});
  const [orGroups,       setOrGroups]       = useState([]); // [{label, subjectIds[]}]
  const [newOrLabel,     setNewOrLabel]     = useState('');
  // Period schedule state
  const [useCustom,      setUseCustom]      = useState(false);
  const [customPeriods,  setCustomPeriods]  = useState([]);
  const [confirmDel,     setConfirmDel]     = useState(null);


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
    setCustomPeriods(defaultCustomPeriods(settings.periodTimings));
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
    setUseCustom(!!saved);
    setCustomPeriods(saved ? [...saved.periodTimings.map(p => ({...p}))] : defaultCustomPeriods(settings.periodTimings));
    setStep(1); setModal(cls);
  };



  // ── Period editor helpers ─────────────────────────────────────────────────
  const updatePeriodRow = (idx, key, val) => {
    setCustomPeriods(prev => prev.map((p, i) => i === idx ? { ...p, [key]: val } : p));
  };
  const addPeriodRow = () => {
    const last = customPeriods[customPeriods.length - 1];
    const newPeriod = customPeriods.length + 1;
    setCustomPeriods(prev => [...prev, {
      period: newPeriod, label: `Period ${newPeriod}`,
      start: last?.end ?? '14:00', end: '14:45', isBreak: false,
    }]);
  };
  const removePeriodRow = (idx) => {
    setCustomPeriods(prev => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, period: i + 1 })));
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

    dispatch({ type: 'SET_CLASS_PERIOD_SETTINGS', payload: { classId, periodTimings: useCustom ? customPeriods : null } });
    // Save OR groups (filter out empty ones)
    const validGroups = orGroups.filter(g => g.label.trim() && g.subjectIds.length >= 2);
    dispatch({ type: 'SET_CLASS_OR_GROUPS', payload: { classId, groups: validGroups } });
    setModal(null);
  };


  // ── Grouped display ───────────────────────────────────────────────────────
  const uniqueGrades = [...new Set(state.classes.map(c => c.grade))].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
  const grouped = uniqueGrades.map(grade => {
    const gClasses = state.classes.filter(c => c.grade === grade);
    gClasses.sort((a, b) => (a.section || '').localeCompare(b.section || ''));
    return { id: `grade_${grade}`, label: `Grade ${grade}`, classes: gClasses };
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
          <h4 style={{ marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <GraduationCap size={16} color="var(--clr-primary)"/> {group.label}
            <span className="badge badge-indigo">{group.classes.length}</span>
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
              const nonBreakCount = periodSetting
                ? periodSetting.periodTimings.filter(p => !p.isBreak).length
                : settings.periodTimings.filter(p => !p.isBreak).length;

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
                    color: periodSetting ? 'var(--clr-primary)' : 'var(--tx-muted)',
                    background: periodSetting ? 'var(--clr-primary-l)' : 'var(--bg-muted)',
                    border: `1px solid ${periodSetting ? 'var(--clr-primary)' : 'var(--border)'}`,
                    borderRadius: 'var(--r-md)', padding: '.2rem .5rem', marginBottom: '.4rem', width: 'fit-content' }}>
                    <Clock size={10}/>
                    {periodSetting ? `Custom: ${nonBreakCount} periods/day` : `Default: ${nonBreakCount} periods/day`}
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
                  setSubjectTeachers(prev => {
                    const cur = prev[subId] || [];
                    return cur.includes(tid) ? prev : { ...prev, [subId]: [...cur, tid] };
                  });
                };
                const removeTeacher = (subId, tid) => {
                  setSubjectTeachers(prev => ({ ...prev, [subId]: (prev[subId] || []).filter(id => id !== tid) }));
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
                                      return (
                                        <span key={tid} style={{
                                          display: 'inline-flex', alignItems: 'center', gap: '.25rem',
                                          background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd',
                                          borderRadius: 20, padding: '.15rem .55rem', fontSize: '.76rem', fontWeight: 600,
                                        }}>
                                          {t?.name?.split(' ')[0] ?? tid}
                                          <button style={{ background: 'none', border: 'none', cursor: 'pointer',
                                            color: '#7c3aed', padding: 0, lineHeight: 1, fontSize: '.85rem' }}
                                            onClick={() => removeTeacher(sub.id, tid)} title="Remove">×</button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                  {/* Add teacher dropdown */}
                                  {unselected.length > 0 && (
                                    <select className="input" style={{ width: '100%', fontSize: '.8rem' }}
                                      value=""
                                      onChange={e => addTeacher(sub.id, e.target.value)}>
                                      <option value="">{assigned.length ? '+ Add another teacher…' : '— Assign teacher —'}</option>
                                      {unselected.map(t =>
                                        <option key={t.id} value={t.id}>{t.name} ({t.department})</option>
                                      )}
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
                    {orGroups.map((grp, gi) => (
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
                      </div>
                    ))}

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
                      <div style={{ fontWeight: 600, fontSize: '.875rem' }}>Use Custom Period Schedule</div>
                      <div style={{ fontSize: '.78rem', color: 'var(--tx-muted)', marginTop: '.15rem' }}>
                        {useCustom
                          ? `This class has its own ${customPeriods.length} periods/day (${customPeriods.filter(p=>!p.isBreak).length} teaching + ${customPeriods.filter(p=>p.isBreak).length} breaks).`
                          : `Inheriting school default (${settings.periodTimings.length} periods/day).`}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (!useCustom) setCustomPeriods(defaultCustomPeriods(settings.periodTimings));
                        setUseCustom(p => !p);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: useCustom ? 'var(--clr-primary)' : 'var(--tx-muted)' }}>
                      {useCustom ? <ToggleRight size={36}/> : <ToggleLeft size={36}/>}
                    </button>
                  </div>

                  {/* School default preview (if not custom) */}
                  {!useCustom && (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>#</th><th>Label</th><th>Start</th><th>End</th><th>Type</th></tr></thead>
                        <tbody>
                          {settings.periodTimings.map(p => (
                            <tr key={p.period} style={{ opacity: 0.65 }}>
                              <td>{p.period}</td>
                              <td>{p.label}</td>
                              <td>{formatAMPM(p.start)}</td>
                              <td>{formatAMPM(p.end)}</td>
                              <td>{p.isBreak ? '☕ Break' : '📚 Teaching'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p style={{ fontSize: '.75rem', color: 'var(--tx-muted)', marginTop: '.5rem' }}>
                        This is read-only — edit in Administration → Settings. Toggle "Custom" above to override for this class.
                      </p>
                    </div>
                  )}

                  {/* Custom period editor */}
                  {useCustom && (
                    <div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr><th style={{width:36}}>#</th><th>Label</th><th>Start</th><th>End</th><th>Type</th><th style={{width:32}}></th></tr>
                          </thead>
                          <tbody>
                            {customPeriods.map((p, idx) => (
                              <tr key={idx}>
                                <td style={{ textAlign: 'center', color: 'var(--tx-muted)', fontSize: '.8rem' }}>{idx + 1}</td>
                                <td>
                                  <input className="input" value={p.label} style={{ width: '100%' }}
                                    onChange={e => updatePeriodRow(idx, 'label', e.target.value)}/>
                                </td>
                                <td>
                                  <TimePicker value={p.start} onChange={v => updatePeriodRow(idx, 'start', v)} />
                                </td>
                                <td>
                                  <TimePicker value={p.end} onChange={v => updatePeriodRow(idx, 'end', v)} />
                                </td>
                                <td>
                                  <select className="input" value={p.isBreak ? 'break' : 'teach'} style={{ width: 120 }}
                                    onChange={e => updatePeriodRow(idx, 'isBreak', e.target.value === 'break')}>
                                    <option value="teach">📚 Teaching</option>
                                    <option value="break">☕ Break</option>
                                  </select>
                                </td>
                                <td>
                                  {customPeriods.length > 1 && (
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removePeriodRow(idx)}>
                                      <Trash2 size={12} color="var(--clr-red)"/>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: '.75rem' }} onClick={addPeriodRow}>
                        <Plus size={13}/> Add Period
                      </button>
                    </div>
                  )}
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
    </div>
  );
}
