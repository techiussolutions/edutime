import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../store/AppStore';
import { Plus, Pencil, Trash2, GraduationCap, ChevronRight, ChevronLeft, Check, BookOpen, Clock, ToggleLeft, ToggleRight } from 'lucide-react';

const GRADE_GROUPS = [
  { id: 'primary',   label: 'Primary (1-5)' },
  { id: 'middle',    label: 'Middle (6-8)' },
  { id: 'secondary', label: 'Secondary (9-10)' },
  { id: 'senior',    label: 'Senior (11-12)' },
];
const GRADES   = ['1','2','3','4','5','6','7','8','9','10','11','12'];
const SECTIONS = ['A','B','C','D','E'];

const EMPTY_FORM = { grade: '10', section: 'A', gradeGroup: 'secondary', classTeacherId: '' };

// Build a default period list from global settings for a new custom override
function defaultCustomPeriods(globalTimings) {
  return globalTimings.map(p => ({ ...p }));
}

export default function ClassesPage() {
  const { state, dispatch } = useApp();
  const { subjects, teachers, classAssignments = [], classPeriodSettings = {}, settings } = state;

  const [modal,          setModal]          = useState(null);  // null | 'add' | class-obj
  const [step,           setStep]           = useState(1);     // 1-3
  const [form,           setForm]           = useState(EMPTY_FORM);
  const [subjectTeachers,setSubjectTeachers]= useState({});
  // Period schedule state
  const [useCustom,      setUseCustom]      = useState(false);
  const [customPeriods,  setCustomPeriods]  = useState([]);
  const [confirmDel,     setConfirmDel]     = useState(null);

  const applicableSubjects = useMemo(() =>
    subjects.filter(s =>
      !s.gradeGroups || s.gradeGroups.length === 0 || s.gradeGroups.includes(form.gradeGroup)
    ), [subjects, form.gradeGroup]);

  // ── Open modals ───────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setSubjectTeachers({});
    setUseCustom(false);
    setCustomPeriods(defaultCustomPeriods(settings.periodTimings));
    setStep(1); setModal('add');
  };

  const openEdit = (cls) => {
    setForm({ ...cls });
    const existing = {};
    classAssignments.filter(a => a.classId === cls.id).forEach(a => { existing[a.subjectId] = a.teacherId; });
    setSubjectTeachers(existing);
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
    const name = `${form.grade}th ${form.section}`;
    let classId;
    if (modal === 'add') {
      classId = `c_${Date.now()}`;
      dispatch({ type: 'ADD_CLASS', payload: { ...form, id: classId, name } });
    } else {
      classId = modal.id;
      dispatch({ type: 'UPDATE_CLASS', payload: { ...form, name } });
    }
    // Save subject-teacher assignments
    dispatch({
      type: 'SET_CLASS_ASSIGNMENTS',
      payload: {
        classId,
        assignments: applicableSubjects.map(sub => ({ subjectId: sub.id, teacherId: subjectTeachers[sub.id] || '' })),
      },
    });
    // Save period schedule
    dispatch({
      type: 'SET_CLASS_PERIOD_SETTINGS',
      payload: { classId, periodTimings: useCustom ? customPeriods : null },
    });
    setModal(null);
  };

  // ── Grouped display ───────────────────────────────────────────────────────
  const grouped = GRADE_GROUPS
    .map(g => ({ ...g, classes: state.classes.filter(c => c.gradeGroup === g.id) }))
    .filter(g => g.classes.length > 0);

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
              const assignments   = classAssignments.filter(a => a.classId === cls.id);
              const totalSubjs    = subjects.filter(s => !s.gradeGroups || s.gradeGroups.length === 0 || s.gradeGroups.includes(cls.gradeGroup)).length;
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
                        const t   = teachers.find(t => t.id === a.teacherId);
                        return (
                          <span key={a.id} className="badge badge-gray" style={{ fontSize: '.68rem' }} title={`${sub?.name} → ${t?.name}`}>
                            {sub?.code}: {t?.name?.split(' ')[0]}
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
                  <div className="field"><label>Grade Group</label>
                    <select className="input" value={form.gradeGroup} onChange={e => setForm(p => ({ ...p, gradeGroup: e.target.value }))}>
                      {GRADE_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
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

              {/* ── STEP 2: Subject-Teacher Assignments ── */}
              {step === 2 && (
                <div>
                  <p style={{ marginBottom: '1rem', fontSize: '.875rem', color: 'var(--tx-muted)' }}>
                    Assign a teacher to each subject for <strong>{form.grade}th {form.section}</strong>.
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Subject</th><th>Assigned Teacher</th></tr></thead>
                      <tbody>
                        {applicableSubjects.map(sub => {
                          const qualified = teachers.filter(t => t.subjects?.includes(sub.id));
                          return (
                            <tr key={sub.id}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{sub.name}</div>
                                <div style={{ fontSize: '.72rem', color: 'var(--tx-muted)' }}>{sub.code}</div>
                              </td>
                              <td>
                                <select className="input" style={{ width: '100%' }}
                                  value={subjectTeachers[sub.id] || ''}
                                  onChange={e => setSubjectTeachers(prev => ({ ...prev, [sub.id]: e.target.value }))}>
                                  <option value="">— Not assigned (skip) —</option>
                                  {(qualified.length > 0 ? qualified : teachers).map(t =>
                                    <option key={t.id} value={t.id}>{t.name} ({t.department})</option>
                                  )}
                                </select>
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
                  <div style={{ marginTop: '.75rem', fontSize: '.8rem', color: 'var(--tx-muted)' }}>
                    ✅ {Object.values(subjectTeachers).filter(Boolean).length} of {applicableSubjects.length} subjects assigned
                  </div>
                </div>
              )}

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
                              <td>{p.start}</td>
                              <td>{p.end}</td>
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
                                  <input className="input" type="time" value={p.start} style={{ width: 105 }}
                                    onChange={e => updatePeriodRow(idx, 'start', e.target.value)}/>
                                </td>
                                <td>
                                  <input className="input" type="time" value={p.end} style={{ width: 105 }}
                                    onChange={e => updatePeriodRow(idx, 'end', e.target.value)}/>
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
