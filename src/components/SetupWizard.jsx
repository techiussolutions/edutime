import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store/AppStore';
import { useAuth } from '../context/AuthContext';
import {
  Settings2, CalendarDays, Clock, Users, ShieldCheck,
  ChevronRight, ChevronLeft, Check, Save, RotateCcw
} from 'lucide-react';

const STEPS = [
  { id: 'school',    label: 'School Profile',      icon: Settings2,    required: true },
  { id: 'days',      label: 'Working Days',         icon: CalendarDays, required: true },
  { id: 'periods',   label: 'Period Timings',       icon: Clock,        required: true },
  { id: 'workload',  label: 'Workload Rules',       icon: Users,        required: false },
  { id: 'sub_rules', label: 'Substitution Rules',   icon: ShieldCheck,  required: false },
];

const DAY_EMOJIS = { Mon: '🌤', Tue: '☀️', Wed: '🌥', Thu: '🌤', Fri: '🎉', Sat: '📚' };

const SUB_RULES = [
  { id: 'same_dept',    label: 'Same Department First',  desc: 'Prefer teachers from the same department' },
  { id: 'same_subject', label: 'Same Subject Qualified', desc: 'Prefer teachers qualified in the subject' },
  { id: 'any_free',     label: 'Any Free Teacher',       desc: 'Fall back to any available teacher' },
];

function addMinutes(time, mins) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Check if the required setup (school profile, working days, period timings) is configured */
export function isSetupComplete(state) {
  const { school, settings } = state;
  const schoolOk = !!school?.name && !!school?.code;
  const daysOk = settings?.workingDays && Object.values(settings.workingDays).some(v => v);
  const periodsOk = settings?.periodTimings && settings.periodTimings.length >= 4
    && settings.periodTimings.some(p => !p.isBreak);
  const userSkipped = localStorage.getItem('edu_setup_skipped') === 'true';
  return userSkipped || (schoolOk && daysOk && periodsOk);
}

export default function SetupWizard({ onComplete }) {
  const { state, dispatch } = useApp();
  const { school } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // ── School profile form ──────────────────────────────────
  const [schoolForm, setSchoolForm] = useState({
    name: state.school?.name || school?.name || '',
    code: state.school?.code || school?.code || '',
    board: state.school?.board || 'CBSE',
    academicYear: state.school?.academicYear || '2025-2026',
    address: state.school?.address || '',
  });

  // ── Working days ─────────────────────────────────────────
  const [workingDays, setWorkingDays] = useState(
    state.settings?.workingDays || { Mon: true, Tue: true, Wed: true, Thu: true, Fri: true, Sat: false }
  );

  // ── Period config ────────────────────────────────────────
  const [numPeriods, setNumPeriods] = useState(8);
  const [periodLen, setPeriodLen]   = useState(45);
  const [numBreaks, setNumBreaks]   = useState(2);
  const [startTime, setStartTime]   = useState('08:00');

  // Break config: each break has { afterPeriod, duration, label }
  const [breaks, setBreaks] = useState([
    { afterPeriod: 2, duration: 15, label: 'Break' },
    { afterPeriod: 5, duration: 30, label: 'Lunch' },
  ]);

  // Keep breaks array in sync with numBreaks
  useEffect(() => {
    setBreaks(prev => {
      if (prev.length === numBreaks) return prev;
      if (prev.length < numBreaks) {
        const arr = [...prev];
        for (let i = prev.length; i < numBreaks; i++) {
          const afterP = Math.min(Math.round(numPeriods / (numBreaks + 1)) * (i + 1), numPeriods);
          arr.push({ afterPeriod: afterP, duration: 15, label: i === 1 ? 'Lunch' : `Break ${i + 1}` });
        }
        return arr;
      }
      return prev.slice(0, numBreaks);
    });
  }, [numBreaks, numPeriods]);

  // ── Auto-generate timings from config ────────────────────
  const [timings, setTimings] = useState([]);

  const generateTimings = useCallback(() => {
    const breakMap = {};
    breaks.forEach(b => { breakMap[b.afterPeriod] = b; });

    const result = [];
    let current = startTime;
    let periodNum = 1;
    let teachingDone = 0;

    while (teachingDone < numPeriods) {
      if (breakMap[teachingDone] && teachingDone > 0) {
        const brk = breakMap[teachingDone];
        const end = addMinutes(current, brk.duration);
        result.push({ period: periodNum, start: current, end, label: brk.label, isBreak: true });
        current = end;
        periodNum++;
      }
      const end = addMinutes(current, periodLen);
      result.push({ period: periodNum, start: current, end, label: `Period ${teachingDone + 1}`, isBreak: false });
      current = end;
      periodNum++;
      teachingDone++;
    }

    setTimings(result);
  }, [periodLen, numPeriods, startTime, breaks]);

  // Auto-generate on config change
  useEffect(() => { generateTimings(); }, [generateTimings]);

  // ── Update individual timing row ─────────────────────────
  const updateTiming = (period, field, value) => {
    setTimings(prev => prev.map(t => t.period === period ? { ...t, [field]: value } : t));
  };

  // ── Workload ─────────────────────────────────────────────
  const [maxPeriods, setMaxPeriods] = useState(state.settings?.maxDefaultPeriods || 30);

  // ── Substitution rules ───────────────────────────────────
  const [subRules, setSubRules] = useState(
    state.settings?.substitutionPriority || ['same_dept', 'same_subject', 'any_free']
  );
  const moveRule = (from, to) => {
    const arr = [...subRules];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setSubRules(arr);
  };

  // ── Save all ─────────────────────────────────────────────
  const saveAll = useCallback(async () => {
    setSaving(true);
    try {
      dispatch({ type: 'UPDATE_SCHOOL', payload: schoolForm });
      const breakPeriods = timings.filter(t => t.isBreak).map(t => t.period);
      dispatch({
        type: 'UPDATE_SETTINGS',
        payload: {
          workingDays,
          periodsPerDay: timings.length,
          periodTimings: timings,
          breakPeriods,
          maxDefaultPeriods: Number(maxPeriods),
          substitutionPriority: subRules,
        },
      });
      localStorage.removeItem('edu_setup_skipped');
      onComplete();
    } finally {
      setSaving(false);
    }
  }, [schoolForm, workingDays, timings, maxPeriods, subRules, dispatch, onComplete]);

  const canNext = () => {
    if (step === 0) return schoolForm.name.trim() && schoolForm.code.trim();
    if (step === 1) return Object.values(workingDays).some(v => v);
    if (step === 2) return timings.length >= 4 && timings.some(t => !t.isBreak);
    return true;
  };

  const next = () => { if (step < STEPS.length - 1) setStep(step + 1); else saveAll(); };
  const prev = () => { if (step > 0) setStep(step - 1); };

  const handleSkip = () => {
    localStorage.setItem('edu_setup_skipped', 'true');
    onComplete();
  };

  return createPortal(
    <div className="modal-overlay" style={{ padding: 0 }}>
      <div className="setup-wizard-container">
        {/* Header */}
        <div className="setup-wizard-header">
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>🏫 School Setup</h2>
            <p style={{ margin: '.25rem 0 0', fontSize: '.82rem', color: 'var(--tx-muted)' }}>
              Configure your school in {STEPS.length} easy steps
              <span style={{ marginLeft: '.5rem', color: 'var(--clr-red)', fontSize: '.75rem' }}>
                * Steps 1–3 are required
              </span>
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={handleSkip}>
            Do it later
          </button>
        </div>

        {/* Step indicators */}
        <div className="setup-wizard-steps">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <button
                key={s.id}
                onClick={() => { if (i <= step) setStep(i); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '.5rem',
                  padding: '.5rem .75rem', borderRadius: 'var(--r-lg)',
                  fontSize: '.8rem', fontWeight: 600, border: 'none',
                  cursor: i <= step ? 'pointer' : 'default',
                  background: active ? 'var(--clr-primary-l)' : done ? 'var(--clr-green-l)' : 'transparent',
                  color: active ? 'var(--clr-primary)' : done ? 'var(--clr-green)' : 'var(--tx-muted)',
                  transition: 'var(--ease)', whiteSpace: 'nowrap',
                }}
              >
                {done ? <Check size={14} /> : <Icon size={14} />}
                <span className="step-label">{s.label}</span>
                {s.required && <span style={{ color: 'var(--clr-red)', fontSize: '.7rem' }}>*</span>}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="setup-wizard-content">

          {/* ─── Step 1: School Profile ─────────────────── */}
          {step === 0 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '1rem' }}>School Profile</h3>
              <p style={{ marginBottom: '1.5rem', fontSize: '.9rem', color: 'var(--tx-muted)' }}>
                Basic information about your school. You can update this later in Settings.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
                <div className="field">
                  <label>School Name <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                  <input className="input" value={schoolForm.name} autoFocus
                    onChange={e => setSchoolForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. St. Paul's Senior Secondary School" />
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>School Code <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                    <input className="input" value={schoolForm.code}
                      onChange={e => setSchoolForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                      placeholder="e.g. SPS2026" />
                  </div>
                  <div className="field">
                    <label>Board</label>
                    <select className="input" value={schoolForm.board}
                      onChange={e => setSchoolForm(p => ({ ...p, board: e.target.value }))}>
                      <option>CBSE</option><option>ICSE</option><option>State Board</option><option>IB</option>
                    </select>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="field">
                    <label>Academic Year</label>
                    <input className="input" value={schoolForm.academicYear}
                      onChange={e => setSchoolForm(p => ({ ...p, academicYear: e.target.value }))}
                      placeholder="2025-2026" />
                  </div>
                  <div className="field">
                    <label>Address</label>
                    <input className="input" value={schoolForm.address}
                      onChange={e => setSchoolForm(p => ({ ...p, address: e.target.value }))}
                      placeholder="Optional" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 2: Working Days ───────────────────── */}
          {step === 1 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '1rem' }}>Working Days</h3>
              <p style={{ marginBottom: '1.5rem', fontSize: '.9rem', color: 'var(--tx-muted)' }}>
                Select which days your school operates. Disabled days won't appear in the timetable.
              </p>
              <div className="working-days-grid">
                {Object.entries(workingDays).map(([day, on]) => (
                  <div key={day} onClick={() => setWorkingDays(p => ({ ...p, [day]: !p[day] }))}
                    className="working-day-card"
                    style={{
                      border: `2px solid ${on ? 'var(--clr-primary)' : 'var(--border)'}`,
                      background: on ? 'var(--clr-primary-l)' : 'var(--bg-muted)',
                    }}>
                    <div style={{ fontSize: '1.5rem' }}>{DAY_EMOJIS[day]}</div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem', color: on ? 'var(--clr-primary)' : 'var(--tx-muted)' }}>{day}</div>
                    <div className={`badge ${on ? 'badge-indigo' : 'badge-gray'}`}>{on ? 'Active' : 'Off'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Step 3: Period Timings ─────────────────── */}
          {step === 2 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '.5rem' }}>Period Timings</h3>
              <p style={{ marginBottom: '1.25rem', fontSize: '.9rem', color: 'var(--tx-muted)' }}>
                Configure your school day. Edit the schedule directly or change the inputs to regenerate.
              </p>

              {/* Basic config */}
              <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
                <h4 style={{ marginBottom: '1rem', fontSize: '.9rem' }}>📋 Quick Setup</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
                  <div className="field">
                    <label>Start Time</label>
                    <input type="time" className="input" value={startTime}
                      onChange={e => setStartTime(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Teaching Periods</label>
                    <input type="number" className="input" min={4} max={12} value={numPeriods}
                      onChange={e => setNumPeriods(Math.max(4, Math.min(12, Number(e.target.value))))} />
                  </div>
                  <div className="field">
                    <label>Period Duration</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      <input type="number" className="input" min={20} max={90} value={periodLen}
                        onChange={e => setPeriodLen(Math.max(20, Math.min(90, Number(e.target.value))))} style={{ width: 80 }} />
                      <span style={{ fontSize: '.82rem', color: 'var(--tx-muted)' }}>min</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>Breaks</label>
                    <input type="number" className="input" min={0} max={4} value={numBreaks}
                      onChange={e => setNumBreaks(Math.max(0, Math.min(4, Number(e.target.value))))} />
                  </div>
                </div>
              </div>

              {/* Break configuration */}
              {numBreaks > 0 && (
                <div className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
                  <h4 style={{ marginBottom: '1rem', fontSize: '.9rem' }}>☕ Break Configuration</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                    {breaks.map((brk, i) => (
                      <div key={i} className="break-config-row">
                        <div style={{ fontWeight: 700, color: 'var(--clr-amber)', fontSize: '.85rem', paddingBottom: '.35rem' }}>
                          Break {i + 1}
                        </div>
                        <div className="field" style={{ margin: 0, flex: '1 1 80px', minWidth: 80 }}>
                          <label style={{ fontSize: '.75rem' }}>Label</label>
                          <input className="input input-sm" value={brk.label}
                            onChange={e => {
                              const arr = [...breaks];
                              arr[i] = { ...arr[i], label: e.target.value };
                              setBreaks(arr);
                            }} />
                        </div>
                        <div className="field" style={{ margin: 0, flex: '0 0 75px' }}>
                          <label style={{ fontSize: '.75rem' }}>After Period</label>
                          <input type="number" className="input input-sm" min={1} max={numPeriods}
                            value={brk.afterPeriod}
                            onChange={e => {
                              const arr = [...breaks];
                              arr[i] = { ...arr[i], afterPeriod: Math.max(1, Math.min(numPeriods, Number(e.target.value))) };
                              setBreaks(arr);
                            }} />
                        </div>
                        <div className="field" style={{ margin: 0, flex: '0 0 85px' }}>
                          <label style={{ fontSize: '.75rem' }}>Duration (min)</label>
                          <input type="number" className="input input-sm" min={1}
                            value={brk.duration}
                            onChange={e => {
                              const arr = [...breaks];
                              arr[i] = { ...arr[i], duration: Math.max(1, Number(e.target.value) || 1) };
                              setBreaks(arr);
                            }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Editable Schedule */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '.5rem', margin: 0 }}>
                  📅 Schedule
                  <span style={{ fontSize: '.78rem', fontWeight: 400, color: 'var(--tx-muted)' }}>
                    (click any cell to edit)
                  </span>
                </h4>
                <button className="btn btn-ghost btn-sm" onClick={generateTimings} style={{ gap: '.35rem' }}>
                  <RotateCcw size={13} /> Regenerate
                </button>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-muted)' }}>
                        <th style={{ padding: '.6rem .5rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600, width: 36 }}>#</th>
                        <th style={{ padding: '.6rem .5rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600 }}>Label</th>
                        <th style={{ padding: '.6rem .5rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600, width: 105 }}>Start</th>
                        <th style={{ padding: '.6rem .5rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600, width: 105 }}>End</th>
                        <th style={{ padding: '.6rem .5rem', textAlign: 'center', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600, width: 60 }}>Min</th>
                        <th style={{ padding: '.6rem .5rem', textAlign: 'center', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600, width: 85 }}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timings.map(t => {
                        const [sh, sm] = t.start.split(':').map(Number);
                        const [eh, em] = t.end.split(':').map(Number);
                        const dur = (eh * 60 + em) - (sh * 60 + sm);
                        return (
                          <tr key={t.period} style={{
                            borderBottom: '1px solid var(--border)',
                            background: t.isBreak ? 'var(--clr-amber-l)' : undefined,
                          }}>
                            <td style={{ padding: '.35rem .5rem', fontWeight: 700, color: t.isBreak ? 'var(--clr-amber)' : 'var(--clr-primary)' }}>{t.period}</td>
                            <td style={{ padding: '.25rem .35rem' }}>
                              <input className="input input-sm" value={t.label}
                                onChange={e => updateTiming(t.period, 'label', e.target.value)}
                                style={{ fontWeight: t.isBreak ? 600 : 400, color: t.isBreak ? 'var(--clr-amber)' : 'var(--tx-main)', width: '100%' }} />
                            </td>
                            <td style={{ padding: '.25rem .35rem' }}>
                              <input type="time" className="input input-sm" value={t.start}
                                onChange={e => updateTiming(t.period, 'start', e.target.value)}
                                style={{ fontFamily: 'monospace', width: '100%' }} />
                            </td>
                            <td style={{ padding: '.25rem .35rem' }}>
                              <input type="time" className="input input-sm" value={t.end}
                                onChange={e => updateTiming(t.period, 'end', e.target.value)}
                                style={{ fontFamily: 'monospace', width: '100%' }} />
                            </td>
                            <td style={{ padding: '.35rem .5rem', textAlign: 'center' }}>
                              <span className={`badge ${t.isBreak ? 'badge-amber' : 'badge-indigo'}`}>{dur} min</span>
                            </td>
                            <td style={{ padding: '.35rem .5rem', textAlign: 'center' }}>
                              <span className={`badge ${t.isBreak ? 'badge-amber' : 'badge-green'}`}>
                                {t.isBreak ? '☕ Break' : '📚 Teaching'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="alert alert-info" style={{ marginTop: '1rem', fontSize: '.82rem' }}>
                <span>💡</span>
                <span>School ends at <strong>{timings.length ? timings[timings.length - 1].end : '--:--'}</strong>.
                Edit any cell directly or use Regenerate to reset from the config above.</span>
              </div>
            </div>
          )}

          {/* ─── Step 4: Workload Rules ─────────────────── */}
          {step === 3 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '1rem' }}>Workload Rules</h3>
              <p style={{ marginBottom: '1.5rem', fontSize: '.9rem', color: 'var(--tx-muted)' }}>
                Set the default maximum periods per week for teachers. Individual teachers can be adjusted later.
              </p>
              <div className="card" style={{ padding: '1.5rem', maxWidth: 400 }}>
                <div className="field">
                  <label>Default Max Periods Per Week</label>
                  <input type="number" className="input" min={10} max={50} value={maxPeriods}
                    onChange={e => setMaxPeriods(Number(e.target.value))}
                    style={{ width: 120, marginTop: '.375rem' }} />
                  <small style={{ marginTop: '.375rem', display: 'block', color: 'var(--tx-muted)' }}>
                    Recommended: 25–35 periods for full-time teachers
                  </small>
                </div>
              </div>
              <div className="setup-workload-grid">
                <div style={{ padding: '1rem', borderRadius: 'var(--r-lg)', background: 'var(--clr-green-l)', border: '1px solid #6ee7b7' }}>
                  <div style={{ fontWeight: 700, color: 'var(--clr-green)' }}>Under &lt; 70%</div>
                  <div style={{ fontSize: '.8rem', color: '#065f46' }}>Under-utilized</div>
                </div>
                <div style={{ padding: '1rem', borderRadius: 'var(--r-lg)', background: 'var(--clr-amber-l)', border: '1px solid #fcd34d' }}>
                  <div style={{ fontWeight: 700, color: 'var(--clr-amber)' }}>Moderate 70–90%</div>
                  <div style={{ fontSize: '.8rem', color: '#92400e' }}>Optimal workload</div>
                </div>
                <div style={{ padding: '1rem', borderRadius: 'var(--r-lg)', background: 'var(--clr-red-l)', border: '1px solid #fca5a5' }}>
                  <div style={{ fontWeight: 700, color: 'var(--clr-red)' }}>Overloaded &gt; 90%</div>
                  <div style={{ fontSize: '.8rem', color: '#991b1b' }}>Risk of burnout</div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 5: Substitution Rules ─────────────── */}
          {step === 4 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '.5rem' }}>Substitution Priority Rules</h3>
              <p style={{ marginBottom: '1.5rem', fontSize: '.9rem', color: 'var(--tx-muted)' }}>
                Set the priority order for finding substitute teachers.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', maxWidth: 520 }}>
                {subRules.map((ruleId, idx) => {
                  const rule = SUB_RULES.find(r => r.id === ruleId);
                  return (
                    <div key={ruleId} style={{
                      display: 'flex', alignItems: 'center', gap: '.875rem',
                      padding: '1rem 1.25rem', borderRadius: 'var(--r-lg)',
                      border: `1.5px solid ${idx === 0 ? 'var(--clr-primary)' : idx === 1 ? 'var(--clr-amber)' : 'var(--border)'}`,
                      background: idx === 0 ? 'var(--clr-primary-l)' : idx === 1 ? 'var(--clr-amber-l)' : 'var(--bg-muted)',
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: 'white',
                        fontWeight: 700, fontSize: '.85rem', flexShrink: 0,
                        background: idx === 0 ? 'var(--clr-primary)' : idx === 1 ? 'var(--clr-amber)' : 'var(--border)',
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{rule?.label}</div>
                        <div style={{ fontSize: '.78rem', color: 'var(--tx-muted)', marginTop: '.15rem' }}>{rule?.desc}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                        {idx > 0 && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => moveRule(idx, idx - 1)}>▲</button>}
                        {idx < subRules.length - 1 && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => moveRule(idx, idx + 1)}>▼</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="setup-wizard-footer">
          <div style={{ fontSize: '.82rem', color: 'var(--tx-muted)' }}>
            Step {step + 1} of {STEPS.length}
          </div>
          <div style={{ display: 'flex', gap: '.75rem' }}>
            {step > 0 && (
              <button className="btn btn-outline" onClick={prev}>
                <ChevronLeft size={15} /> Back
              </button>
            )}
            <button className="btn btn-primary" onClick={next} disabled={!canNext() || saving}>
              {step === STEPS.length - 1 ? (
                <>{saving ? 'Saving…' : <><Save size={15} /> Finish Setup</>}</>
              ) : (
                <>Next <ChevronRight size={15} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
