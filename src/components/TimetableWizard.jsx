import React, { useState, useMemo } from 'react';
import { useApp } from '../store/AppStore';
import { generateTimetable, getDefaultRequirements } from '../utils/generator';
import {
  Wand2, ChevronRight, ChevronLeft, Check, AlertTriangle, RefreshCcw,
  Settings2, ClipboardList, Eye, Sparkles, X
} from 'lucide-react';

const STEPS = [
  { id: 1, icon: Settings2,    label: 'Configure',  desc: 'Set subjects & periods per class' },
  { id: 2, icon: ClipboardList,label: 'Validate',   desc: 'Check teacher availability' },
  { id: 3, icon: Eye,          label: 'Preview',    desc: 'Review generated schedule' },
  { id: 4, icon: Sparkles,     label: 'Apply',      desc: 'Apply to your timetable' },
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TimetableWizard({ onClose, onApply }) {
  const { state } = useApp();
  const [step, setStep] = useState(1);

  // Step 1 state: subject requirements per class
  const [selectedClass, setSelectedClass] = useState(state.classes[0]?.id ?? '');
  const activeDayCount = Object.values(state.settings.workingDays).filter(Boolean).length;

  const [classSubjectMap, setClassSubjectMap] = useState(() =>
    getDefaultRequirements(state.classes, state.subjects, activeDayCount)
  );

  // Generated result
  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);

  const handleSetPeriods = (classId, subjectId, value) => {
    setClassSubjectMap(prev => ({
      ...prev,
      [classId]: prev[classId].map(s =>
        s.subjectId === subjectId ? { ...s, periodsPerWeek: Math.max(0, Math.min(10, Number(value))) } : s
      )
    }));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 600)); // slight delay for UX
    const result = generateTimetable(state, { classSubjectMap });
    setGenerated(result);
    setGenerating(false);
    setStep(3);
  };

  // Validation summary
  const validation = useMemo(() => {
    const issues = [];
    const nonBreakCount = state.settings.periodTimings.filter(p => !p.isBreak).length;
    const totalAvailableSlots = nonBreakCount * activeDayCount;

    state.classes.forEach(cls => {
      const reqs = classSubjectMap[cls.id] || [];
      const totalReqPeriods = reqs.reduce((s, r) => s + r.periodsPerWeek, 0);
      if (totalReqPeriods > totalAvailableSlots) {
        issues.push({ type: 'error', msg: `${cls.name}: requires ${totalReqPeriods} periods but only ${totalAvailableSlots} slots available.` });
      } else if (totalReqPeriods < totalAvailableSlots) {
        issues.push({ type: 'warn', msg: `${cls.name}: ${totalAvailableSlots - totalReqPeriods} period slots will remain unassigned.` });
      }
    });

    // Check teacher qualification coverage
    const subjectIds = [...new Set(
      Object.values(classSubjectMap).flatMap(r => r.filter(x => x.periodsPerWeek > 0).map(x => x.subjectId))
    )];
    subjectIds.forEach(sid => {
      const qualified = state.teachers.filter(t => t.subjects.includes(sid));
      if (qualified.length === 0) {
        const sub = state.subjects.find(s => s.id === sid);
        issues.push({ type: 'error', msg: `No teacher is qualified for ${sub?.name}. Please assign subject to a teacher in Master Data.` });
      }
    });

    return issues;
  }, [classSubjectMap, state, activeDayCount]);

  const canProceedStep2 = validation.filter(v => v.type === 'error').length === 0;

  // For preview: show generated schedule for selected class
  const previewClass = state.classes[0]?.id;
  const previewSchedule = generated?.schedule ?? [];

  const getCellData = (classId, dayIdx, period) => {
    const entry = previewSchedule.find(s => s.classId === classId && s.day === dayIdx && s.period === period);
    if (!entry) return null;
    const teacher = state.teachers.find(t => t.id === entry.teacherId);
    const subject = state.subjects.find(s => s.id === entry.subjectId);
    return { teacher, subject };
  };

  const activeDayKeys = Object.entries(state.settings.workingDays)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg" style={{ maxWidth: 900, maxHeight: '92vh' }}>

        {/* ── HEADER ─────────────────────────────── */}
        <div className="modal-header" style={{ background: 'linear-gradient(135deg,#1e1b4b,#4338ca)', borderRadius: '1.5rem 1.5rem 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wand2 size={18} color="white" />
            </div>
            <div>
              <h3 style={{ color: 'white' }}>Timetable Generation Wizard</h3>
              <p style={{ color: '#a5b4fc', fontSize: '.8rem', margin: 0 }}>Automatically generate a complete school timetable</p>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: 'white' }}><X size={18} /></button>
        </div>

        {/* ── STEP INDICATOR ─────────────────────── */}
        <div style={{ display: 'flex', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', gap: 0, background: '#fafafa' }}>
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <React.Fragment key={s.id}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.25rem', flex: 1 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: done ? 'var(--clr-green)' : active ? 'var(--clr-primary)' : 'var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: done || active ? 'white' : 'var(--tx-muted)',
                    transition: 'var(--ease)'
                  }}>
                    {done ? <Check size={16} /> : <s.icon size={16} />}
                  </div>
                  <span style={{ fontSize: '.72rem', fontWeight: active ? 700 : 500, color: active ? 'var(--clr-primary)' : done ? 'var(--clr-green)' : 'var(--tx-muted)' }}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 2, height: 2, background: done ? 'var(--clr-green)' : 'var(--border)', margin: '17px 0 0', transition: 'var(--ease)' }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* ── STEP CONTENT ───────────────────────── */}
        <div className="modal-body" style={{ padding: '1.5rem', minHeight: 340, maxHeight: 'calc(90vh - 220px)', overflowY: 'auto' }}>

          {/* STEP 1: Configure */}
          {step === 1 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '.375rem' }}>Set Subject Requirements</h3>
              <p style={{ marginBottom: '1.25rem', fontSize: '.875rem' }}>
                Define how many periods per week each subject should be taught for each class.
              </p>

              {/* Class selector */}
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                {state.classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedClass(cls.id)}
                    className={`badge ${selectedClass === cls.id ? 'badge-indigo' : 'badge-gray'}`}
                    style={{ cursor: 'pointer', padding: '.4rem .875rem', fontSize: '.85rem' }}
                  >
                    {cls.name}
                  </button>
                ))}
              </div>

              {/* Subject requirements table for selected class */}
              {selectedClass && (
                <div className="card">
                  <div className="card-header" style={{ padding: '.75rem 1rem' }}>
                    <h4 style={{ fontSize: '.9rem' }}>
                      {state.classes.find(c => c.id === selectedClass)?.name} — Subject Periods/Week
                    </h4>
                    <span style={{ fontSize: '.78rem', color: 'var(--tx-muted)' }}>
                      {activeDayCount} working days × {state.settings.periodTimings.filter(p => !p.isBreak).length} non-break periods = {activeDayCount * state.settings.periodTimings.filter(p => !p.isBreak).length} slots/week
                    </span>
                  </div>
                  <div style={{ overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '.6rem 1rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600, background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>Subject</th>
                          <th style={{ padding: '.6rem 1rem', textAlign: 'center', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600, background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>Periods / Week</th>
                          <th style={{ padding: '.6rem 1rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600, background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>Qualified Teachers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(classSubjectMap[selectedClass] || []).map(req => {
                          const sub = state.subjects.find(s => s.id === req.subjectId);
                          const qualTeachers = state.teachers.filter(t => t.subjects.includes(req.subjectId));
                          return (
                            <tr key={req.subjectId} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '.625rem 1rem' }}>
                                <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{sub?.name}</div>
                                <div style={{ fontSize: '.72rem', color: 'var(--tx-muted)' }}>{sub?.code}</div>
                              </td>
                              <td style={{ padding: '.625rem 1rem', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}>
                                  <button className="btn btn-ghost btn-icon btn-sm"
                                    style={{ border: '1px solid var(--border)', width: 28, height: 28 }}
                                    onClick={() => handleSetPeriods(selectedClass, req.subjectId, req.periodsPerWeek - 1)}>−
                                  </button>
                                  <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center', fontSize: '1rem' }}>{req.periodsPerWeek}</span>
                                  <button className="btn btn-ghost btn-icon btn-sm"
                                    style={{ border: '1px solid var(--border)', width: 28, height: 28 }}
                                    onClick={() => handleSetPeriods(selectedClass, req.subjectId, req.periodsPerWeek + 1)}>+
                                  </button>
                                </div>
                              </td>
                              <td style={{ padding: '.625rem 1rem' }}>
                                {qualTeachers.length === 0
                                  ? <span style={{ color: 'var(--clr-red)', fontSize: '.8rem' }}>⚠ No qualified teacher</span>
                                  : qualTeachers.map(t => (
                                    <span key={t.id} className="badge badge-green" style={{ marginRight: '.25rem', fontSize: '.72rem' }}>{t.name.split(' ')[0]}</span>
                                  ))
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Total count footer */}
                  <div style={{ padding: '.625rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--bg-muted)', display: 'flex', justifyContent: 'flex-end', gap: '1.5rem', fontSize: '.8rem' }}>
                    <span>Total requested: <strong>{(classSubjectMap[selectedClass] || []).reduce((s, r) => s + r.periodsPerWeek, 0)}</strong></span>
                    <span>Available slots: <strong>{activeDayCount * state.settings.periodTimings.filter(p => !p.isBreak).length}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Validate */}
          {step === 2 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '.375rem' }}>Validation Report</h3>
              <p style={{ marginBottom: '1.25rem', fontSize: '.875rem' }}>
                Reviewing your setup before generation. Fix any errors before proceeding.
              </p>

              {validation.length === 0 ? (
                <div className="alert alert-success">
                  <Check size={18} />
                  <span>All checks passed! Your timetable configuration is valid and ready for generation.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                  {validation.map((v, i) => (
                    <div key={i} className={`alert ${v.type === 'error' ? 'alert-danger' : 'alert-warning'}`}>
                      <AlertTriangle size={16} />
                      <span>{v.msg}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Teacher stats quick view */}
              <div className="divider" />
              <h4 style={{ marginBottom: '.75rem', fontSize: '.9rem' }}>Teacher Availability Summary</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '.75rem' }}>
                {state.teachers.map(t => {
                  const totalAvailable = activeDayCount * state.settings.periodTimings.filter(p => !p.isBreak).length;
                  return (
                    <div key={t.id} style={{ padding: '.875rem', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{t.name}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)' }}>{t.department}</div>
                      <div style={{ fontSize: '.75rem' }}>
                        Cap: <strong>{t.maxPeriods}</strong>/wk &nbsp;·&nbsp;
                        Available slots: <strong>{Math.min(totalAvailable, t.maxPeriods)}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Preview */}
          {step === 3 && generated && (
            <div className="anim-fade-in">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ marginBottom: '.25rem' }}>Preview Generated Timetable</h3>
                  <p style={{ fontSize: '.875rem' }}>Showing schedule for {state.classes.find(c => c.id === previewClass)?.name}. All classes are generated.</p>
                </div>
                <select className="input" style={{ width: 160 }} value={previewClass} onChange={() => {}}>
                  {state.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Warnings */}
              {generated.warnings.length > 0 && (
                <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  {generated.warnings.slice(0, 4).map((w, i) => (
                    <div key={i} className="alert alert-warning" style={{ padding: '.5rem .75rem', fontSize: '.8rem' }}>
                      <AlertTriangle size={14} />{w}
                    </div>
                  ))}
                  {generated.warnings.length > 4 && (
                    <div style={{ fontSize: '.8rem', color: 'var(--tx-muted)', paddingLeft: '.75rem' }}>
                      …and {generated.warnings.length - 4} more warnings
                    </div>
                  )}
                </div>
              )}

              {/* Grid preview */}
              <div style={{ overflowX: 'auto' }}>
                <table className="tt-table" style={{ fontSize: '.8rem' }}>
                  <thead>
                    <tr>
                      <th className="day-col">Day</th>
                      {state.settings.periodTimings.map(p => (
                        <th key={p.period}>{p.label}<br /><span style={{ fontWeight: 400, fontSize: '.7rem' }}>{p.start}</span></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeDayKeys.map((dayKey, dIdx) => {
                      const dayIdx = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 }[dayKey];
                      return (
                        <tr key={dayKey}>
                          <th className="day-col" style={{ textAlign: 'center', fontSize: '.8rem' }}>{dayKey}</th>
                          {state.settings.periodTimings.map(p => {
                            if (p.isBreak) return (
                              <td key={p.period} className="tt-cell break">
                                <span style={{ fontSize: '.7rem', color: 'var(--tx-muted)', fontStyle: 'italic' }}>Break</span>
                              </td>
                            );
                            const data = getCellData(previewClass, dayIdx, p.period);
                            return (
                              <td key={p.period} className={`tt-cell${data ? ' assigned' : ''}`} style={{ height: 60 }}>
                                {data ? (
                                  <div className="tt-slot">
                                    <span className="sub" style={{ fontSize: '.78rem' }}>{data.subject?.code}</span>
                                    <span className="teacher" style={{ fontSize: '.7rem' }}>{data.teacher?.name?.split(' ')[0]}</span>
                                  </div>
                                ) : <span style={{ fontSize: '.7rem', color: 'var(--tx-xmuted)' }}>—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Stats */}
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="badge badge-green" style={{ padding: '.375rem .875rem' }}>
                  <Check size={13} /> {generated.schedule.length} slots filled
                </div>
                <div className="badge badge-amber" style={{ padding: '.375rem .875rem' }}>
                  <AlertTriangle size={13} /> {generated.warnings.length} warnings
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Apply */}
          {step === 4 && (
            <div className="anim-fade-in" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--clr-green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '2rem' }}>
                🎉
              </div>
              <h3 style={{ marginBottom: '.5rem' }}>Ready to Apply!</h3>
              <p style={{ maxWidth: 440, margin: '0 auto 1.5rem', fontSize: '.9rem' }}>
                {generated?.schedule.length} timetable slots have been generated across {state.classes.length} classes.
                This will <strong>replace your entire existing timetable</strong>. Substitutions will not be affected.
              </p>
              <div className="alert alert-warning" style={{ maxWidth: 500, margin: '0 auto 1.5rem', textAlign: 'left' }}>
                <AlertTriangle size={16} />
                <span>This action <strong>cannot be undone</strong> from within the app. The existing schedule will be overwritten.</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button className="btn btn-outline" onClick={() => setStep(3)}>← Back to Preview</button>
                <button className="btn btn-primary btn-lg" onClick={() => onApply(generated.schedule)}>
                  <Sparkles size={16} /> Apply Timetable
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────── */}
        <div className="modal-footer">
          {step > 1 && step < 4 && (
            <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft size={15} /> Back
            </button>
          )}
          <div style={{ flex: 1 }} />

          {step === 1 && (
            <button className="btn btn-primary" onClick={() => setStep(2)}>
              Next: Validate <ChevronRight size={15} />
            </button>
          )}
          {step === 2 && (
            <button className="btn btn-primary" disabled={!canProceedStep2 || generating} onClick={handleGenerate}>
              {generating ? '⏳ Generating…' : <><Wand2 size={15} /> Generate Timetable</>}
            </button>
          )}
          {step === 3 && (
            <>
              <button className="btn btn-outline" onClick={handleGenerate} disabled={generating}>
                <RefreshCcw size={14} /> Regenerate
              </button>
              <button className="btn btn-primary" onClick={() => setStep(4)}>
                Looks Good! <ChevronRight size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
