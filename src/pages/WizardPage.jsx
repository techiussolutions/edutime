import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../store/AppStore';
import { useNavigate } from 'react-router-dom';
import { generateTimetable, getDefaultRequirements, analyzeStaffing } from '../utils/generator';
import {
  Wand2, ChevronRight, ChevronLeft, Check, AlertTriangle,
  Settings2, ClipboardList, Eye, Sparkles, RefreshCcw,
  Lock, Unlock, ArrowLeft, Info
} from 'lucide-react';

const STEPS = [
  { id: 1, icon: Settings2,    label: 'Configure',  desc: 'Set periods per subject & class' },
  { id: 2, icon: ClipboardList,label: 'Validate',   desc: 'Review teacher availability' },
  { id: 3, icon: Eye,          label: 'Preview',    desc: 'Check generated schedule' },
  { id: 4, icon: Sparkles,     label: 'Apply',      desc: 'Apply to timetable' },
];

const DAY_IDX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };

export default function WizardPage() {
  const { state, dispatch, dbLoaded } = useApp();
  const navigate = useNavigate();

  const { settings, teachers, subjects, classes, schedule, lockedSlots, classAssignments = [], periodsConfig = {}, classPeriodSettings = {} } = state;
  const activeDayCount = Object.values(settings.workingDays).filter(Boolean).length;
  const activeDayKeys = Object.entries(settings.workingDays).filter(([, v]) => v).map(([k]) => k);
  const nonBreakPeriods = settings.periodTimings.filter(p => !p.isBreak);

  // Per-class helper: resolve the effective period timings for a class
  const getClassPeriods = (classId) => {
    const custom = classPeriodSettings[classId];
    return custom ? custom.periodTimings : settings.periodTimings;
  };
  const getClassNonBreakCount = (classId) => getClassPeriods(classId).filter(p => !p.isBreak).length;

  const [step, setStep] = useState(1);
  const [selectedClass, setSelectedClass] = useState(classes[0]?.id ?? '');
  const [previewClass, setPreviewClass] = useState(classes[0]?.id ?? '');
  const [classSubjectMap, setClassSubjectMap] = useState(() => {
    // Restore from persisted periodsConfig if available, else compute default
    if (periodsConfig && Object.keys(periodsConfig).length > 0) return periodsConfig;
    return getDefaultRequirements(classes, subjects, activeDayCount, classAssignments);
  });
  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [genMode, setGenMode] = useState('all'); // 'all' or 'selected'
  const [selectedClassIds, setSelectedClassIds] = useState(() => classes.map(c => c.id));

  // Recompute when DB data arrives (initial state is empty before HYDRATE)
  useEffect(() => {
    if (!dbLoaded || classes.length === 0) return;
    // Update selectedClass/previewClass if not yet set
    setSelectedClass(prev => prev || classes[0]?.id || '');
    setPreviewClass(prev => prev || classes[0]?.id || '');
    setSelectedClassIds(classes.map(c => c.id));
    // Recompute classSubjectMap from periodsConfig or defaults
    setClassSubjectMap(prev => {
      if (periodsConfig && Object.keys(periodsConfig).length > 0) return periodsConfig;
      // Only recompute if current map is empty (avoid overwriting user edits)
      if (Object.keys(prev).length > 0) return prev;
      return getDefaultRequirements(classes, subjects, activeDayCount, classAssignments);
    });
  }, [dbLoaded, classes.length, subjects.length, classAssignments.length]);

  // ── helpers ──────────────────────────────────────────
  const slotId = (classId, dayKey, period) => `sch_${classId}_${DAY_IDX[dayKey]}_${period}`;
  const isLocked = (classId, dayKey, period) => lockedSlots.includes(slotId(classId, dayKey, period));

  const toggleLock = (classId, dayKey, period) => {
    const id = slotId(classId, dayKey, period);
    dispatch({ type: lockedSlots.includes(id) ? 'UNLOCK_SLOT' : 'LOCK_SLOT', payload: id });
  };

  const getCellData = (sch, classId, dayKey, period) => {
    const dayIdx = DAY_IDX[dayKey];
    const entry = sch.find(s => s.classId === classId && s.day === dayIdx && s.period === period);
    if (!entry) return null;
    return {
      teacher: teachers.find(t => t.id === entry.teacherId),
      subject: subjects.find(s => s.id === entry.subjectId),
    };
  };

  const updatePeriods = (classId, subjectId, delta) => {
    setClassSubjectMap(prev => {
      const next = {
        ...prev,
        [classId]: prev[classId].map(s =>
          s.subjectId === subjectId ? { ...s, periodsPerWeek: Math.max(0, Math.min(10, s.periodsPerWeek + delta)) } : s
        )
      };
      // Persist immediately so it survives navigation
      dispatch({ type: 'SET_PERIODS_CONFIG', payload: next });
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await new Promise(r => setTimeout(r, 500));
      const opts = { classSubjectMap };
      if (genMode === 'selected') opts.selectedClassIds = selectedClassIds;
      const result = generateTimetable(state, opts);
      setGenerated(result);
      setStep(prev => (prev < 3 ? 3 : prev));
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = () => {
    if (genMode === 'selected') {
      // Merge: remove old slots for selected classes, keep others, add generated
      const existingOther = schedule.filter(s => !selectedClassIds.includes(s.classId));
      dispatch({ type: 'BULK_SET_SCHEDULE', payload: [...existingOther, ...generated.schedule] });
    } else {
      dispatch({ type: 'BULK_SET_SCHEDULE', payload: generated.schedule });
    }
    setSaved(true);
    setTimeout(() => navigate('/timetable'), 1200);
  };

  // Validation
  const validation = useMemo(() => {
    const issues = [];
    classes.forEach(cls => {
      const classNonBreak = getClassNonBreakCount(cls.id);
      const totalSlots = classNonBreak * activeDayCount;
      const total = (classSubjectMap[cls.id] || []).reduce((s, r) => s + r.periodsPerWeek, 0);
      if (total > totalSlots) issues.push({ type: 'error', msg: `${cls.name}: needs ${total} periods but only ${totalSlots} slots available (${classNonBreak} periods/day × ${activeDayCount} days).` });
      else if (total < totalSlots) issues.push({ type: 'warn', msg: `${cls.name}: ${totalSlots - total} slot(s) will remain unassigned.` });
    });
    classes.forEach(cls => {
      (classSubjectMap[cls.id] || []).filter(r => r.periodsPerWeek > 0).forEach(req => {
        const hasAssignment = classAssignments.some(
          a => a.classId === cls.id && a.subjectId === req.subjectId
        );
        if (!hasAssignment) {
          const sub = subjects.find(s => s.id === req.subjectId);
          issues.push({ type: 'error', msg: `${cls.name}: no teacher assigned for ${sub?.name ?? req.subjectId}. Assign in Master Data → Classes.` });
        }
      });
    });
    return issues;
  }, [classSubjectMap, classes, classAssignments, subjects, classPeriodSettings, activeDayCount]);

  const staffingAnalysis = useMemo(
    () => analyzeStaffing(state, classSubjectMap),
    [state, classSubjectMap]
  );

  const canGenerate = validation.filter(v => v.type === 'error').length === 0;

  // ── render helpers ────────────────────────────────────
  const StepDot = ({ s }) => {
    const done = step > s.id;
    const active = step === s.id;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem', padding: '.625rem .875rem', borderRadius: 'var(--r-md)', background: active ? 'var(--clr-primary-l)' : done ? '#f0fdf4' : 'transparent', cursor: done ? 'pointer' : 'default', marginBottom: 2 }}
        onClick={() => done && setStep(s.id)}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--clr-green)' : active ? 'var(--clr-primary)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: done || active ? 'white' : 'var(--tx-muted)' }}>
          {done ? <Check size={14} /> : <s.icon size={14} />}
        </div>
        <div className="wizard-step-text">
          <div style={{ fontWeight: active ? 700 : 500, fontSize: '.85rem', color: active ? 'var(--clr-primary)' : done ? 'var(--clr-green-dark, #15803d)' : 'var(--tx-muted)' }}>{s.label}</div>
          <div style={{ fontSize: '.72rem', color: 'var(--tx-muted)' }}>{s.desc}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="wizard-layout">

      {/* ── LEFT SIDEBAR ───────────────────────────────── */}
      <div className="wizard-sidebar">
        <button className="btn btn-ghost btn-sm wizard-back-btn" style={{ justifyContent: 'flex-start', marginBottom: '1.5rem', gap: '.375rem', color: 'var(--tx-muted)' }} onClick={() => navigate('/timetable')}>
          <ArrowLeft size={15} /> Back to Timetable
        </button>

        <div className="wizard-title" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wand2 size={16} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '.9rem' }}>Timetable Wizard</div>
            <div style={{ fontSize: '.7rem', color: 'var(--tx-muted)' }}>Auto-generation</div>
          </div>
        </div>

        <div className="wizard-steps" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {STEPS.map(s => <StepDot key={s.id} s={s} />)}
        </div>

        <div style={{ flex: 1 }} />

        {/* Lock info */}
        <div className="wizard-lock-info" style={{ background: lockedSlots.length > 0 ? '#fef3c7' : 'var(--bg-muted)', border: `1px solid ${lockedSlots.length > 0 ? '#fcd34d' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', padding: '.875rem', fontSize: '.78rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem', fontWeight: 600, marginBottom: '.375rem', color: lockedSlots.length > 0 ? '#92400e' : 'var(--tx-muted)' }}>
            <Lock size={13} /> {lockedSlots.length} slot{lockedSlots.length !== 1 ? 's' : ''} locked
          </div>
          <div style={{ color: 'var(--tx-muted)', lineHeight: 1.4 }}>Locked slots are preserved during regeneration.</div>
          {lockedSlots.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: '.5rem', color: 'var(--clr-amber)', fontSize: '.75rem', padding: '.25rem .5rem' }}
              onClick={() => dispatch({ type: 'UNLOCK_ALL_SLOTS' })}>
              <Unlock size={12} /> Clear all locks
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT ───────────────────────────────── */}
      <div className="wizard-main">

        {/* ── STEP 1: CONFIGURE ── */}
        {step === 1 && (
          <div className="anim-fade-in">
            <div className="page-header" style={{ marginBottom: '1.25rem' }}>
              <div><h2>Configure Subjects</h2><p>Set how many periods per week each subject gets for each class.</p></div>
              <button className="btn btn-primary" onClick={() => setStep(2)}>
                Next: Validate <ChevronRight size={15} />
              </button>
            </div>

            {/* Class tabs */}
            <div className="tabs">
              {classes.map(cls => (
                <button key={cls.id} className={`tab-btn ${selectedClass === cls.id ? 'active' : ''}`} onClick={() => setSelectedClass(cls.id)}>
                  {cls.name}
                </button>
              ))}
            </div>

            {selectedClass && (
              <div className="card" style={{ marginTop: '.75rem' }}>
                <div className="card-header">
                  <div>
                    <h3 style={{ fontSize: '.95rem' }}>{classes.find(c => c.id === selectedClass)?.name} — Periods per Week</h3>
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--tx-muted)' }}>
                    <strong>{nonBreakPeriods.length * activeDayCount}</strong> total slots/week ({activeDayCount} days × {nonBreakPeriods.length} periods)
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th style={{ textAlign: 'center', width: 180 }}>Periods / Week</th>
                        <th>Assigned Teacher</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(classSubjectMap[selectedClass] || []).map(req => {
                        const sub = subjects.find(s => s.id === req.subjectId);
                        const totalReq = (classSubjectMap[selectedClass] || []).reduce((s, r) => s + r.periodsPerWeek, 0);
                        const over = totalReq > nonBreakPeriods.length * activeDayCount;
                        return (
                          <tr key={req.subjectId}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{sub?.name}</div>
                              <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)' }}>{sub?.code}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}>
                                <button className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: 8 }}
                                  onClick={() => updatePeriods(selectedClass, req.subjectId, -1)}>−</button>
                                <span style={{ fontWeight: 700, fontSize: '1.05rem', minWidth: 22, textAlign: 'center', color: over && req.periodsPerWeek > 0 ? 'var(--clr-red)' : undefined }}>
                                  {req.periodsPerWeek}
                                </span>
                                <button className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: 8 }}
                                  onClick={() => updatePeriods(selectedClass, req.subjectId, 1)}>+</button>
                              </div>
                            </td>
                            <td>
                              {(() => {
                                const asgn = classAssignments.find(
                                  a => a.classId === selectedClass && a.subjectId === req.subjectId
                                );
                                const t = asgn ? teachers.find(t => t.id === asgn.teacherId) : null;
                                return t
                                  ? <span className="badge badge-green">{t.name.split(' ')[0]}</span>
                                  : <span style={{ color: 'var(--clr-red)', fontSize: '.8rem' }}>⚠ Not assigned</span>;
                              })()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Footer totals */}
                <div style={{ padding: '.625rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg-muted)', display: 'flex', justifyContent: 'flex-end', gap: '2rem', fontSize: '.82rem' }}>
                  {(() => {
                    const req = (classSubjectMap[selectedClass] || []).reduce((s, r) => s + r.periodsPerWeek, 0);
                    const avail = nonBreakPeriods.length * activeDayCount;
                    return (
                      <>
                        <span>Requested: <strong style={{ color: req > avail ? 'var(--clr-red)' : req === avail ? 'var(--clr-green)' : undefined }}>{req}</strong></span>
                        <span>Available: <strong>{avail}</strong></span>
                        <span>Remaining: <strong style={{ color: avail - req < 0 ? 'var(--clr-red)' : undefined }}>{avail - req}</strong></span>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: VALIDATE ── */}
        {step === 2 && (
          <div className="anim-fade-in">
            <div className="page-header" style={{ marginBottom: '1.25rem' }}>
              <div><h2>Validation Report</h2><p>Check your configuration before generating the timetable.</p></div>
              <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)}><ChevronLeft size={15} /> Back</button>
                <button className="btn btn-primary" disabled={!canGenerate || generating} onClick={handleGenerate}>
                  {generating ? '⏳ Generating…' : <><Wand2 size={15} /> Generate Timetable</>}
                </button>
              </div>
            </div>

            {/* Generation scope selector */}
            <div className="card" style={{ marginBottom: '1rem', padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: genMode === 'selected' ? '.75rem' : 0 }}>
                <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Generate for:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer', fontSize: '.84rem' }}>
                  <input type="radio" name="genMode" checked={genMode === 'all'} onChange={() => { setGenMode('all'); setSelectedClassIds(classes.map(c => c.id)); }} />
                  All Classes
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer', fontSize: '.84rem' }}>
                  <input type="radio" name="genMode" checked={genMode === 'selected'} onChange={() => setGenMode('selected')} />
                  Selected Classes Only
                </label>
              </div>
              {genMode === 'selected' && (
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  {classes.map(cls => (
                    <label key={cls.id} style={{
                      display: 'flex', alignItems: 'center', gap: '.35rem', cursor: 'pointer',
                      padding: '.35rem .75rem', borderRadius: 'var(--r-lg)', fontSize: '.82rem',
                      border: `1.5px solid ${selectedClassIds.includes(cls.id) ? 'var(--clr-primary)' : 'var(--border)'}`,
                      background: selectedClassIds.includes(cls.id) ? 'var(--clr-primary-l)' : 'transparent',
                    }}>
                      <input type="checkbox" checked={selectedClassIds.includes(cls.id)}
                        onChange={e => {
                          setSelectedClassIds(prev =>
                            e.target.checked ? [...prev, cls.id] : prev.filter(id => id !== cls.id)
                          );
                        }} />
                      {cls.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {lockedSlots.length > 0 && (
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                <Lock size={16} />
                <span><strong>{lockedSlots.length} slot(s) are locked</strong> and will be preserved exactly as-is during generation.</span>
              </div>
            )}

            {validation.length === 0 ? (
              <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                <Check size={18} /> All checks passed! Ready to generate.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginBottom: '1.25rem' }}>
                {validation.map((v, i) => (
                  <div key={i} className={`alert ${v.type === 'error' ? 'alert-danger' : 'alert-warning'}`}>
                    <AlertTriangle size={15} /> {v.msg}
                  </div>
                ))}
              </div>
            )}

            {/* ── Staffing Analysis ── */}
            <h4 style={{ margin: '1rem 0 .75rem', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              Staffing Analysis
              <span className="badge badge-gray" style={{ fontSize: '.7rem', fontWeight: 500 }}>per subject across all classes</span>
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {staffingAnalysis.map(sub => {
                const statusColor = sub.status === 'critical' ? 'var(--clr-red)' : sub.status === 'warn' ? 'var(--clr-amber)' : 'var(--clr-green)';
                const statusBg = sub.status === 'critical' ? '#fef2f2' : sub.status === 'warn' ? '#fefce8' : '#f0fdf4';
                return (
                  <div key={sub.subjectId} style={{ border: `1.5px solid ${statusColor}`, borderRadius: 'var(--r-lg)', overflow: 'hidden', background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.625rem 1rem', background: statusBg, borderBottom: `1px solid ${statusColor}` }}>
                      <div style={{ fontWeight: 700, fontSize: '.875rem', minWidth: 80 }}>
                        <span style={{ background: statusColor, color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: '.7rem', marginRight: '.4rem' }}>{sub.subjectCode}</span>
                        {sub.subjectName}
                      </div>
                      <div style={{ display: 'flex', gap: '1.25rem', flex: 1, fontSize: '.78rem', color: 'var(--tx-muted)' }}>
                        <span>Total periods/week: <strong>{sub.totalPeriodsNeeded}</strong></span>
                        <span>Currently by: <strong>{sub.currentTeachers}</strong> teacher{sub.currentTeachers !== 1 ? 's' : ''}</span>
                      </div>
                      {sub.currentTeachers < sub.recommendedTeachers && (
                        <div style={{ fontSize: '.75rem', background: statusColor, color: '#fff', borderRadius: 20, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                          ⚡ Need {sub.recommendedTeachers} teacher{sub.recommendedTeachers !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
                      {sub.teachers.map((t, i) => {
                        const pct = Math.min(100, Math.round((t.periodsAssigned / t.maxPeriods) * 100));
                        const barColor = t.status === 'critical' ? 'var(--clr-red)' : t.status === 'warn' ? 'var(--clr-amber)' : 'var(--clr-green)';
                        return (
                          <div key={t.teacherId} style={{ flex: '1 1 200px', padding: '.625rem 1rem', borderRight: i < sub.teachers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ fontWeight: 600, fontSize: '.82rem' }}>{t.teacherName}</div>
                            <div style={{ fontSize: '.72rem', color: 'var(--tx-muted)', marginBottom: '.35rem' }}>
                              {t.classes.join(', ')} · {t.periodsAssigned}/{t.maxPeriods} periods/wk
                            </div>
                            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width .3s' }}/>
                            </div>
                            <div style={{ fontSize: '.68rem', color: barColor, marginTop: '.2rem', fontWeight: 600 }}>{pct}% load</div>
                          </div>
                        );
                      })}
                      {sub.teachers.length === 0 && (
                        <div style={{ padding: '.625rem 1rem', fontSize: '.8rem', color: 'var(--clr-red)' }}>⚠ No teachers assigned for this subject in any class.</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STEP 3: PREVIEW ── */}
        {step === 3 && generated && (
          <div className="anim-fade-in">
            <div className="page-header" style={{ marginBottom: '1rem' }}>
              <div><h2>Preview Generated Timetable</h2><p>{generated.schedule.length} slots across {classes.length} classes</p></div>
              <div style={{ display: 'flex', gap: '.75rem' }}>
                <button className="btn btn-ghost" onClick={() => setStep(2)}><ChevronLeft size={15} /> Back</button>
                <button className="btn btn-outline" onClick={handleGenerate} disabled={generating}><RefreshCcw size={14} /> Regenerate</button>
                <button className="btn btn-primary" onClick={() => setStep(4)}>Looks Good! <ChevronRight size={15} /></button>
              </div>
            </div>

            {/* Warnings strip */}
            {generated.warnings.length > 0 && (
              <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '.375rem' }}>
                {generated.warnings.slice(0, 5).map((w, i) => (
                  <div key={i} className="alert alert-warning" style={{ padding: '.5rem .875rem', fontSize: '.8rem' }}>
                    <AlertTriangle size={13} />{w}
                  </div>
                ))}
                {generated.warnings.length > 5 && (
                  <div style={{ fontSize: '.78rem', color: 'var(--tx-muted)', paddingLeft: '.5rem' }}>…and {generated.warnings.length - 5} more</div>
                )}
              </div>
            )}

            {/* Class selector */}
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
              <span style={{ fontSize: '.82rem', color: 'var(--tx-muted)' }}>Previewing:</span>
              {classes.map(cls => (
                <button key={cls.id} onClick={() => setPreviewClass(cls.id)}
                  className={`badge ${previewClass === cls.id ? 'badge-indigo' : 'badge-gray'}`}
                  style={{ cursor: 'pointer', padding: '.35rem .75rem' }}>
                  {cls.name}
                </button>
              ))}
            </div>

            <div className="card">
              <div style={{ overflowX: 'auto' }}>
                <table className="tt-table" style={{ fontSize: '.8rem' }}>
                  <thead>
                    <tr>
                      <th className="day-col">Day</th>
                      {settings.periodTimings.map(p => (
                        <th key={p.period}>{p.label}<br /><span style={{ fontWeight: 400, fontSize: '.7rem' }}>{p.start}</span></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeDayKeys.map(dayKey => {
                      const dayIdx = DAY_IDX[dayKey];
                      return (
                        <tr key={dayKey}>
                          <th className="day-col" style={{ textAlign: 'center', fontSize: '.8rem' }}>{dayKey}</th>
                          {settings.periodTimings.map(p => {
                            if (p.isBreak) return (
                              <td key={p.period} className="tt-cell break"><span style={{ fontSize: '.7rem', fontStyle: 'italic', color: 'var(--tx-muted)' }}>Break</span></td>
                            );
                            const locked = lockedSlots.includes(slotId(previewClass, dayKey, p.period));
                            const data = !locked
                              ? getCellData(generated.schedule, previewClass, dayKey, p.period)
                              : getCellData(schedule, previewClass, dayKey, p.period);
                            return (
                              <td key={p.period} className={`tt-cell${data ? ' assigned' : ''}`} style={{ background: locked ? '#fffbeb' : undefined, position: 'relative' }}>
                                {locked && (
                                  <div style={{ position: 'absolute', top: 3, right: 3 }}>
                                    <Lock size={9} color="#d97706" />
                                  </div>
                                )}
                                {data ? (
                                  <div className="tt-slot">
                                    <span className="sub" style={{ fontSize: '.76rem' }}>{data.subject?.code}</span>
                                    <span className="teacher" style={{ fontSize: '.68rem' }}>{data.teacher?.name?.split(' ')[0]}</span>
                                    {locked && <span style={{ fontSize: '.62rem', color: '#d97706' }}>locked</span>}
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
            </div>

            <div style={{ marginTop: '.75rem', display: 'flex', gap: '.75rem', fontSize: '.8rem', alignItems: 'center' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: '#fffbeb', border: '1px solid #fcd34d' }} />
              <span style={{ color: 'var(--tx-muted)' }}>Yellow = locked slot (kept from current timetable)</span>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: '#f0fdf4', border: '1px solid #86efac' }} />
              <span style={{ color: 'var(--tx-muted)' }}>Green = newly generated slot</span>
            </div>
          </div>
        )}

        {/* ── STEP 4: APPLY ── */}
        {step === 4 && (
          <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, textAlign: 'center' }}>
            {saved ? (
              <>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
                <h2>Timetable Applied!</h2>
                <p style={{ color: 'var(--tx-muted)' }}>Redirecting to Timetable…</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '3.5rem', marginBottom: '1.25rem' }}>🎉</div>
                <h2 style={{ marginBottom: '.5rem' }}>Ready to Apply!</h2>
                <p style={{ maxWidth: 420, margin: '0 auto 1.5rem', color: 'var(--tx-muted)', lineHeight: 1.6 }}>
                  <strong>{generated?.schedule.length}</strong> slots generated across <strong>{genMode === 'selected' ? selectedClassIds.length : classes.length}</strong> class{(genMode === 'selected' ? selectedClassIds.length : classes.length) !== 1 ? 'es' : ''}.
                  {lockedSlots.length > 0 && <> <strong>{lockedSlots.length}</strong> locked slot(s) will be preserved.</>}
                  {genMode === 'selected' && <><br />Only selected classes will be updated. Other classes remain untouched.</>}
                  <br />Unlocked existing slots will be replaced.
                </p>
                <div className="alert alert-warning" style={{ maxWidth: 420, textAlign: 'left', marginBottom: '1.5rem' }}>
                  <AlertTriangle size={16} />
                  <span>All <strong>unlocked</strong> slots in the current timetable will be overwritten.</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="btn btn-ghost btn-lg" onClick={() => setStep(3)}><ChevronLeft size={15} /> Back to Preview</button>
                  <button className="btn btn-primary btn-lg" onClick={handleApply}>
                    <Sparkles size={16} /> Apply Timetable
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
