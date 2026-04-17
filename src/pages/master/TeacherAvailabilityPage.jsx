import React, { useState, useMemo } from 'react';
import { useApp } from '../../store/AppStore';
import { CalendarCheck, RotateCcw, CheckSquare, Square, Search } from 'lucide-react';

const DAY_IDX = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5 };

export default function TeacherAvailabilityPage() {
  const { state, dispatch } = useApp();
  const { teachers, settings, teacherAvailability = {} } = state;

  const [selectedTeacherId, setSelectedTeacherId] = useState(teachers[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);

  const activeDays = useMemo(
    () => Object.entries(settings.workingDays).filter(([, v]) => v).map(([k]) => k).sort((a,b) => DAY_IDX[a] - DAY_IDX[b]),
    [settings.workingDays]
  );
  const nonBreakPeriods = useMemo(
    () => settings.periodTimings.filter(p => !p.isBreak),
    [settings.periodTimings]
  );

  const filteredTeachers = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.department.toLowerCase().includes(search.toLowerCase())
  );

  // Get availability for the selected teacher
  // true (or absent) = available, false = not available
  const getAvail = (teacherId, dayKey, period) => {
    const val = teacherAvailability?.[teacherId]?.[dayKey]?.[period];
    return val !== false; // default to available
  };

  // Count blocked slots for a teacher
  const countBlocked = (teacherId) => {
    let count = 0;
    const avMap = teacherAvailability?.[teacherId] ?? {};
    for (const dayKey of activeDays) {
      for (const p of nonBreakPeriods) {
        if (avMap?.[dayKey]?.[p.period] === false) count++;
      }
    }
    return count;
  };

  const toast = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };

  const toggleSlot = (dayKey, period) => {
    if (!selectedTeacherId) return;
    const current = getAvail(selectedTeacherId, dayKey, period);
    // Build a fresh copy of this teacher's availability
    const teacherAvMap = { ...(teacherAvailability?.[selectedTeacherId] ?? {}) };
    const dayMap = { ...(teacherAvMap[dayKey] ?? {}) };
    dayMap[period] = !current; // flip
    teacherAvMap[dayKey] = dayMap;
    dispatch({
      type: 'SET_TEACHER_AVAILABILITY',
      payload: { teacherId: selectedTeacherId, availability: teacherAvMap }
    });
    toast();
  };

  const setAllForDay = (dayKey, value) => {
    if (!selectedTeacherId) return;
    const teacherAvMap = { ...(teacherAvailability?.[selectedTeacherId] ?? {}) };
    const dayMap = {};
    nonBreakPeriods.forEach(p => { dayMap[p.period] = value; });
    teacherAvMap[dayKey] = dayMap;
    dispatch({
      type: 'SET_TEACHER_AVAILABILITY',
      payload: { teacherId: selectedTeacherId, availability: teacherAvMap }
    });
    toast();
  };

  const resetTeacher = () => {
    if (!selectedTeacherId) return;
    dispatch({ type: 'SET_TEACHER_AVAILABILITY', payload: { teacherId: selectedTeacherId, availability: null } });
    toast();
  };

  const teacher = teachers.find(t => t.id === selectedTeacherId);
  const blocked = selectedTeacherId ? countBlocked(selectedTeacherId) : 0;
  const totalSlots = activeDays.length * nonBreakPeriods.length;

  // Avatar colour helper
  const avatarColor = (id) => ({
    bg: `hsl(${id.charCodeAt(1) * 37}, 70%, 90%)`,
    fg: `hsl(${id.charCodeAt(1) * 37}, 60%, 35%)`,
  });

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div>
          <h2>Teacher Availability</h2>
          <p>Set which periods each teacher is available on each working day. All periods are available by default.</p>
        </div>
        {saved && (
          <div className="badge badge-green" style={{ padding: '.4rem .8rem', fontSize: '.85rem' }}>
            ✓ Saved!
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>

        {/* ── LEFT: Teacher list ────────────────────────── */}
        <div className="card" style={{ width: 240, flexShrink: 0, padding: '1rem', alignSelf: 'flex-start', position: 'sticky', top: 0 }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem', padding: '.375rem .625rem', background: 'var(--bg-muted)', borderRadius: 'var(--r-md)' }}>
            <Search size={13} color="var(--tx-muted)" />
            <input
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '.82rem', flex: 1 }}
              placeholder="Filter…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem', maxHeight: 520, overflowY: 'auto' }}>
            {filteredTeachers.map(t => {
              const blk = countBlocked(t.id);
              const { bg, fg } = avatarColor(t.id);
              const isSelected = t.id === selectedTeacherId;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTeacherId(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '.625rem',
                    padding: '.5rem .625rem', borderRadius: 'var(--r-md)', border: 'none',
                    background: isSelected ? 'var(--clr-primary-l)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', transition: 'var(--ease)',
                    outline: isSelected ? '2px solid var(--clr-primary)' : 'none',
                  }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.85rem', flexShrink: 0 }}>
                    {t.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.82rem', fontWeight: 600, color: isSelected ? 'var(--clr-primary)' : 'var(--tx-default)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name.split(' ')[0]}</div>
                    <div style={{ fontSize: '.7rem', color: 'var(--tx-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.department}</div>
                  </div>
                  {blk > 0 && (
                    <span className="badge badge-red" style={{ fontSize: '.65rem', padding: '2px 5px', flexShrink: 0 }}>{blk}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Availability grid ──────────────────── */}
        <div style={{ flex: 1 }}>
          {teacher ? (
            <>
              {/* Header bar */}
              <div className="card card-body" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flex: 1 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: avatarColor(teacher.id).bg, color: avatarColor(teacher.id).fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem' }}>
                    {teacher.name[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{teacher.name}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--tx-muted)' }}>{teacher.designation} · {teacher.department}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '.625rem' }}>
                  {blocked > 0 ? (
                    <span className="badge badge-red" style={{ padding: '.35rem .75rem', fontSize: '.8rem' }}>
                      {blocked} slot{blocked !== 1 ? 's' : ''} blocked of {totalSlots}
                    </span>
                  ) : (
                    <span className="badge badge-green" style={{ padding: '.35rem .75rem', fontSize: '.8rem' }}>
                      <CalendarCheck size={12} style={{ marginRight: 4 }} />
                      Fully available
                    </span>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={resetTeacher} style={{ gap: '.375rem' }}>
                    <RotateCcw size={13} />
                    Reset
                  </button>
                </div>
              </div>

              {/* Info banner */}
              <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.82rem' }}>
                <CalendarCheck size={14} />
                <span>Click any cell to toggle availability. <strong>Green = available</strong>, <strong>Red = not available</strong>. The timetable generator will skip unavailable slots.</span>
              </div>

              {/* Grid */}
              <div className="card" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '.625rem 1rem', textAlign: 'left', fontSize: '.78rem', color: 'var(--tx-muted)', fontWeight: 600, width: 120 }}>Period</th>
                      {activeDays.map(day => (
                        <th key={day} style={{ padding: '.5rem .5rem', textAlign: 'center', fontSize: '.8rem', color: 'var(--tx-muted)', fontWeight: 600 }}>
                          <div>{day}</div>
                          {/* Day-level quick toggles */}
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '.25rem', marginTop: '.3rem' }}>
                            <button
                              title="Set all available"
                              onClick={() => setAllForDay(day, true)}
                              style={{ border: 'none', background: 'var(--clr-green-l)', cursor: 'pointer', borderRadius: 4, padding: '2px 5px', fontSize: '.65rem', color: 'var(--clr-green)', fontWeight: 700 }}
                            >All ✓</button>
                            <button
                              title="Set all unavailable"
                              onClick={() => setAllForDay(day, false)}
                              style={{ border: 'none', background: 'var(--clr-red-l)', cursor: 'pointer', borderRadius: 4, padding: '2px 5px', fontSize: '.65rem', color: 'var(--clr-red)', fontWeight: 700 }}
                            >All ✕</button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {nonBreakPeriods.map(p => (
                      <tr key={p.period} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '.5rem 1rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{p.label}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--tx-muted)' }}>{p.start} – {p.end}</div>
                        </td>
                        {activeDays.map(day => {
                          const isAvail = getAvail(selectedTeacherId, day, p.period);
                          return (
                            <td key={day} style={{ padding: '.375rem .5rem', textAlign: 'center' }}>
                              <button
                                onClick={() => toggleSlot(day, p.period)}
                                title={isAvail ? 'Click to block' : 'Click to allow'}
                                style={{
                                  width: '100%', minWidth: 72, padding: '.45rem .5rem',
                                  borderRadius: 'var(--r-md)',
                                  border: `1.5px solid ${isAvail ? '#86efac' : '#fca5a5'}`,
                                  background: isAvail ? '#f0fdf4' : '#fef2f2',
                                  color: isAvail ? 'var(--clr-green)' : 'var(--clr-red)',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', gap: '.3rem',
                                  transition: 'background .15s, border-color .15s',
                                  fontSize: '.78rem', fontWeight: 600,
                                }}
                              >
                                {isAvail
                                  ? <><CheckSquare size={13} /><span>Free</span></>
                                  : <><Square size={13} /><span>Off</span></>
                                }
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '1.25rem', marginTop: '.75rem', fontSize: '.78rem', color: 'var(--tx-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: '#f0fdf4', border: '1.5px solid #86efac', display: 'inline-block' }} />
                  Free — teacher can be scheduled
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fef2f2', border: '1.5px solid #fca5a5', display: 'inline-block' }} />
                  Off — generator will skip this slot
                </span>
              </div>
            </>
          ) : (
            <div className="card card-body" style={{ textAlign: 'center', padding: '3rem', color: 'var(--tx-muted)' }}>
              <CalendarCheck size={40} style={{ margin: '0 auto 1rem', opacity: .3 }} />
              <p>Select a teacher from the list to configure their availability.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
