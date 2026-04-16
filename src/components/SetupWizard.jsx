import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../store/AppStore';
import { useAuth } from '../context/AuthContext';
import {
  Settings2, CalendarDays, Clock, Users, ShieldCheck,
  ChevronRight, ChevronLeft, Check, Save
} from 'lucide-react';

const STEPS = [
  { id: 'school',    label: 'School Profile',      icon: Settings2 },
  { id: 'days',      label: 'Working Days',         icon: CalendarDays },
  { id: 'periods',   label: 'Period Timings',       icon: Clock },
  { id: 'workload',  label: 'Workload Rules',       icon: Users },
  { id: 'sub_rules', label: 'Substitution Rules',   icon: ShieldCheck },
];

const DAY_EMOJIS = { Mon: '🌤', Tue: '☀️', Wed: '🌥', Thu: '🌤', Fri: '🎉', Sat: '📚' };

const SUB_RULES = [
  { id: 'same_dept',    label: 'Same Department First',  desc: 'Prefer teachers from the same department' },
  { id: 'same_subject', label: 'Same Subject Qualified', desc: 'Prefer teachers qualified in the subject' },
  { id: 'any_free',     label: 'Any Free Teacher',       desc: 'Fall back to any available teacher' },
];

// Add minutes to HH:MM
function addMinutes(time, mins) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function buildTimings(startTime, periodLen, breakLen, numPeriods, breakAfter) {
  const timings = [];
  let current = startTime;
  let periodNum = 1;
  let teachingCount = 0;

  for (let i = 0; i < numPeriods + breakAfter.length; i++) {
    if (breakAfter.includes(teachingCount) && teachingCount > 0) {
      const end = addMinutes(current, breakLen);
      timings.push({
        period: periodNum,
        start: current,
        end,
        label: teachingCount === breakAfter[0] ? 'Break' : 'Lunch',
        isBreak: true,
      });
      current = end;
      periodNum++;
    }

    if (teachingCount >= numPeriods) break;

    const end = addMinutes(current, periodLen);
    timings.push({
      period: periodNum,
      start: current,
      end,
      label: `Period ${teachingCount + 1}`,
      isBreak: false,
    });
    current = end;
    periodNum++;
    teachingCount++;
  }
  return timings;
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
  const [periodLen, setPeriodLen]     = useState(45);
  const [breakLen, setBreakLen]       = useState(15);
  const [lunchLen, setLunchLen]       = useState(30);
  const [numPeriods, setNumPeriods]   = useState(8);
  const [startTime, setStartTime]    = useState('08:00');
  const [breakAfter, setBreakAfter]  = useState([2, 5]); // break after 2nd and 5th teaching period

  const [timings, setTimings] = useState([]);

  // Rebuild timings whenever config changes
  useEffect(() => {
    const breaks = breakAfter.sort((a, b) => a - b);
    const result = [];
    let current = startTime;
    let periodNum = 1;
    let teachingDone = 0;

    while (teachingDone < numPeriods) {
      // Check if we need a break here
      if (breaks.includes(teachingDone) && teachingDone > 0) {
        const isLunch = breaks.indexOf(teachingDone) === 1;
        const dur = isLunch ? lunchLen : breakLen;
        const end = addMinutes(current, dur);
        result.push({ period: periodNum, start: current, end, label: isLunch ? 'Lunch' : 'Break', isBreak: true });
        current = end;
        periodNum++;
      }

      const end = addMinutes(current, periodLen);
      result.push({ period: periodNum, start: current, end, label: `Period ${teachingDone + 1}`, isBreak: false });
      current = end;
      periodNum++;
      teachingDone++;
    }

    // Add final break if configured after last period
    if (breaks.includes(teachingDone)) {
      const isLunch = breaks.indexOf(teachingDone) === 1;
      const dur = isLunch ? lunchLen : breakLen;
      const end = addMinutes(current, dur);
      result.push({ period: periodNum, start: current, end, label: isLunch ? 'Lunch' : 'Break', isBreak: true });
    }

    setTimings(result);
  }, [periodLen, breakLen, lunchLen, numPeriods, startTime, breakAfter]);

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
      // Save school profile
      dispatch({ type: 'UPDATE_SCHOOL', payload: schoolForm });

      // Save settings
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

      // Mark setup complete
      localStorage.setItem('edu_setup_done', 'true');
      onComplete();
    } finally {
      setSaving(false);
    }
  }, [schoolForm, workingDays, timings, maxPeriods, subRules, dispatch, onComplete]);

  const canNext = () => {
    if (step === 0) return schoolForm.name.trim() && schoolForm.code.trim();
    return true;
  };

  const next = () => { if (step < STEPS.length - 1) setStep(step + 1); else saveAll(); };
  const prev = () => { if (step > 0) setStep(step - 1); };

  return createPortal(
    <div className="modal-overlay" style={{ padding: 0 }}>
      <div style={{
        display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 860,
        height: '100vh', maxHeight: '100vh', background: 'var(--bg-card)',
        margin: '0 auto', boxShadow: 'var(--sh-xl)',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>🏫 School Setup</h2>
            <p style={{ margin: '.25rem 0 0', fontSize: '.82rem', color: 'var(--tx-muted)' }}>
              Configure your school in {STEPS.length} easy steps
            </p>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => { localStorage.setItem('edu_setup_done', 'true'); onComplete(); }}
          >
            Do it later
          </button>
        </div>

        {/* Step indicators */}
        <div style={{
          display: 'flex', gap: '.25rem', padding: '1rem 2rem',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
          overflowX: 'auto',
        }}>
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
                  fontSize: '.8rem', fontWeight: 600, border: 'none', cursor: i <= step ? 'pointer' : 'default',
                  background: active ? 'var(--clr-primary-l)' : done ? 'var(--clr-green-l)' : 'transparent',
                  color: active ? 'var(--clr-primary)' : done ? 'var(--clr-green)' : 'var(--tx-muted)',
                  transition: 'var(--ease)', whiteSpace: 'nowrap',
                }}
              >
                {done ? <Check size={14} /> : <Icon size={14} />}
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>

          {/* Step 1: School Profile */}
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

          {/* Step 2: Working Days */}
          {step === 1 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '1rem' }}>Working Days</h3>
              <p style={{ marginBottom: '1.5rem', fontSize: '.9rem', color: 'var(--tx-muted)' }}>
                Select which days your school operates. Disabled days won't appear in the timetable.
              </p>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {Object.entries(workingDays).map(([day, on]) => (
                  <div key={day} onClick={() => setWorkingDays(p => ({ ...p, [day]: !p[day] }))}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.75rem',
                      padding: '1.25rem 1.5rem', borderRadius: 'var(--r-xl)',
                      border: `2px solid ${on ? 'var(--clr-primary)' : 'var(--border)'}`,
                      background: on ? 'var(--clr-primary-l)' : 'var(--bg-muted)',
                      cursor: 'pointer', transition: 'var(--ease)', minWidth: 90,
                    }}>
                    <div style={{ fontSize: '1.5rem' }}>{DAY_EMOJIS[day]}</div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem', color: on ? 'var(--clr-primary)' : 'var(--tx-muted)' }}>{day}</div>
                    <div className={`badge ${on ? 'badge-indigo' : 'badge-gray'}`}>{on ? 'Active' : 'Off'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Period Timings */}
          {step === 2 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '1rem' }}>Period Timings</h3>
              <p style={{ marginBottom: '1.5rem', fontSize: '.9rem', color: 'var(--tx-muted)' }}>
                Set period length and breaks. The timetable auto-calculates in real time.
              </p>

              {/* Config controls */}
              <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                  <div className="field">
                    <label>School Starts</label>
                    <input type="time" className="input" value={startTime}
                      onChange={e => setStartTime(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Period Length</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      <input type="number" className="input" min={20} max={90} value={periodLen}
                        onChange={e => setPeriodLen(Number(e.target.value))} style={{ width: 80 }} />
                      <span style={{ fontSize: '.82rem', color: 'var(--tx-muted)' }}>min</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>Break Duration</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      <input type="number" className="input" min={5} max={30} value={breakLen}
                        onChange={e => setBreakLen(Number(e.target.value))} style={{ width: 80 }} />
                      <span style={{ fontSize: '.82rem', color: 'var(--tx-muted)' }}>min</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>Lunch Duration</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                      <input type="number" className="input" min={15} max={60} value={lunchLen}
                        onChange={e => setLunchLen(Number(e.target.value))} style={{ width: 80 }} />
                      <span style={{ fontSize: '.82rem', color: 'var(--tx-muted)' }}>min</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>Teaching Periods</label>
                    <input type="number" className="input" min={4} max={12} value={numPeriods}
                      onChange={e => setNumPeriods(Number(e.target.value))} style={{ width: 80 }} />
                  </div>
                  <div className="field">
                    <label>Break After Period</label>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                      <input type="number" className="input" min={1} max={numPeriods} value={breakAfter[0] || 2}
                        onChange={e => setBreakAfter(p => [Number(e.target.value), p[1] || 5])}
                        style={{ width: 55 }} />
                      <span style={{ fontSize: '.82rem', color: 'var(--tx-muted)' }}>&</span>
                      <input type="number" className="input" min={1} max={numPeriods} value={breakAfter[1] || 5}
                        onChange={e => setBreakAfter(p => [p[0] || 2, Number(e.target.value)])}
                        style={{ width: 55 }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <h4 style={{ marginBottom: '.75rem' }}>Preview</h4>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-muted)' }}>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600 }}>#</th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600 }}>Label</th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600 }}>Start</th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600 }}>End</th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'center', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600 }}>Duration</th>
                      <th style={{ padding: '.6rem .75rem', textAlign: 'center', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600 }}>Type</th>
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
                          <td style={{ padding: '.5rem .75rem', fontWeight: 700, color: t.isBreak ? 'var(--clr-amber)' : 'var(--clr-primary)' }}>{t.period}</td>
                          <td style={{ padding: '.5rem .75rem', fontWeight: t.isBreak ? 600 : 400, color: t.isBreak ? 'var(--clr-amber)' : 'var(--tx-main)' }}>{t.label}</td>
                          <td style={{ padding: '.5rem .75rem', fontFamily: 'monospace' }}>{t.start}</td>
                          <td style={{ padding: '.5rem .75rem', fontFamily: 'monospace' }}>{t.end}</td>
                          <td style={{ padding: '.5rem .75rem', textAlign: 'center' }}>
                            <span className={`badge ${t.isBreak ? 'badge-amber' : 'badge-indigo'}`}>{dur} min</span>
                          </td>
                          <td style={{ padding: '.5rem .75rem', textAlign: 'center' }}>
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

              <div className="alert alert-info" style={{ marginTop: '1rem', fontSize: '.82rem' }}>
                <span>💡</span>
                <span>School ends at <strong>{timings.length ? timings[timings.length - 1].end : '--:--'}</strong>. 
                Adjust period length or break times to change the schedule.</span>
              </div>
            </div>
          )}

          {/* Step 4: Workload Rules */}
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1.5rem', maxWidth: 600 }}>
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

          {/* Step 5: Substitution Rules */}
          {step === 4 && (
            <div className="anim-fade-in">
              <h3 style={{ marginBottom: '.5rem' }}>Substitution Priority Rules</h3>
              <p style={{ marginBottom: '1.5rem', fontSize: '.9rem', color: 'var(--tx-muted)' }}>
                Set the priority order for finding substitute teachers. Drag to reorder.
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
        <div style={{
          padding: '1rem 2rem', borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
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
