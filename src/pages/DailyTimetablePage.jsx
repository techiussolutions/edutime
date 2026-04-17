import React, { useState } from 'react';
import { useApp } from '../store/AppStore';
import { CalendarClock, Printer } from 'lucide-react';

const DAY_IDX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DailyTimetablePage() {
  const { state } = useApp();
  const { settings, schedule, teachers, subjects, classes, school, substitutions = [], classAssignments = [], classPeriodSettings = {} } = state;

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState('class');
  const [selectedClass, setSelectedClass] = useState(classes[0]?.id);
  const [selectedTeacher, setSelectedTeacher] = useState(teachers[0]?.id);

  // Compute the day of week string (e.g., 'Mon')
  const dateObj = new Date(date);
  const dayKey = DAY_NAMES[dateObj.getDay()];
  const isWorkingDay = dayKey !== 'Sun' && settings.workingDays[dayKey];

  const getCellData = (classId, dayKey, period) => {
    const dIdx = DAY_IDX[dayKey];
    return schedule.find(s => s.classId === classId && s.day === dIdx && s.period === period) || null;
  };
  const getTeacherCell = (teacherId, dayKey, period) => {
    const dIdx = DAY_IDX[dayKey];
    return schedule.find(s => s.teacherId === teacherId && s.day === dIdx && s.period === period) || null;
  };

  // Resolve effective period timings: class-specific if available, else global
  const effectivePeriods = (() => {
    if (viewMode === 'class' && selectedClass) {
      const custom = classPeriodSettings[selectedClass];
      if (custom) return custom.periodTimings;
    }
    return settings.periodTimings;
  })();

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div>
          <h2>Daily Timetable</h2>
          <p>Real-time view of the day's schedule, including substitutions.</p>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          <button className="btn btn-outline no-print" onClick={() => window.print()} title="Print / Save as PDF">
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      <div className="card card-body" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="tabs" style={{ margin: 0, borderBottom: 'none' }}>
          <button className={`tab-btn ${viewMode === 'class' ? 'active' : ''}`} onClick={() => setViewMode('class')}>Class View</button>
          <button className={`tab-btn ${viewMode === 'teacher' ? 'active' : ''}`} onClick={() => setViewMode('teacher')}>Teacher View</button>
        </div>
        <div style={{ flex: 1 }} />
        {viewMode === 'class'
          ? <select className="input" style={{ width: 200 }} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          : <select className="input" style={{ width: 200 }} value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)}>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
        }
      </div>

      {/* Print header — only visible when printing */}
      <div className="print-header">
        <h2>{school?.name || 'School Timetable'}</h2>
        <p>
          {viewMode === 'class'
            ? `Class: ${classes.find(c => c.id === selectedClass)?.name || '—'}`
            : `Teacher: ${teachers.find(t => t.id === selectedTeacher)?.name || '—'}`
          }
          {' · '}{dayKey} {dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {!isWorkingDay ? (
        <div className="card card-body" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--tx-muted)' }}>
          <CalendarClock size={40} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
          <h3>No Classes Scheduled</h3>
          <p>{date} ({dayKey}) is not a working day according to the school settings.</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="tt-grid">
            <table className="tt-table">
              <thead>
                <tr>
                  <th className="day-col">PERIOD</th>
                  {effectivePeriods.map(p => (
                    <th key={p.period}>
                      {p.label}{p.isBreak ? ' 🫖' : ''}
                      <br /><span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: '.72rem' }}>{p.start}–{p.end}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="day-col" style={{ fontWeight: 600, fontSize: '.85rem', textAlign: 'center' }}>
                    {dayKey}
                    <div style={{ fontWeight: 400, fontSize: '.7rem', color: 'var(--tx-muted)', marginTop: 2 }}>
                      {dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </th>
                  {effectivePeriods.map(p => {
                    if (p.isBreak) return (
                      <td key={p.period} className="tt-cell break">
                        <div className="tt-slot"><span className="break-label">☕ {p.label}</span></div>
                      </td>
                    );

                    const slot = viewMode === 'class'
                      ? getCellData(selectedClass, dayKey, p.period)
                      : getTeacherCell(selectedTeacher, dayKey, p.period);
                    
                    const teacher = slot ? teachers.find(t => t.id === slot.teacherId) : null;
                    const originalSubject = slot ? subjects.find(s => s.id === slot.subjectId) : null;
                    const cls = slot && viewMode === 'teacher' ? classes.find(c => c.id === slot.classId) : null;

                    // Substitution logic using selected 'date' instead of 'todayIso'
                    const activeSub = slot ? substitutions.find(sub => sub.scheduleId === slot.id && sub.date === date) : null;
                    const subTeacher = activeSub ? teachers.find(t => t.id === activeSub.substituteTeacherId) : null;

                    // Compute which subject to display
                    let displaySubject = originalSubject;
                    if (activeSub && subTeacher && slot) {
                      const subAssignment = classAssignments.find(a => a.classId === slot.classId && a.teacherId === subTeacher.id);
                      if (subAssignment) {
                        displaySubject = subjects.find(s => s.id === subAssignment.subjectId) || originalSubject;
                      }
                    }

                    const isSubstituteView = viewMode === 'teacher' && activeSub && selectedTeacher === activeSub.substituteTeacherId;
                    const isAbsentTeacherView = viewMode === 'teacher' && activeSub && selectedTeacher === activeSub.absentTeacherId;

                    return (
                      <td
                        key={p.period}
                        className={`tt-cell${slot || isSubstituteView ? ' assigned' : ''}${activeSub ? ' has-sub' : ''}`}
                        style={{
                          background: activeSub ? '#eff6ff' : undefined,
                          borderColor: activeSub ? (isAbsentTeacherView ? '#fca5a5' : '#93c5fd') : undefined,
                          position: 'relative',
                        }}
                      >
                        <div className="tt-slot">
                          {(slot || isSubstituteView) ? (
                            <>
                              <span className="sub">{displaySubject?.code}</span>
                              {activeSub ? (
                                viewMode === 'class' ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '.68rem', textDecoration: 'line-through', color: 'var(--tx-muted)', marginBottom: '-2px' }}>
                                      {teacher?.name?.split(' ')[0]}
                                    </span>
                                    <span className="teacher" style={{ color: 'var(--clr-primary)', fontWeight: 700 }}>
                                      {subTeacher?.name?.split(' ')[0] ?? '—'}
                                    </span>
                                    <span style={{ fontSize: '.6rem', background: 'var(--clr-primary)', color: 'white', padding: '1px 4px', borderRadius: 3, marginTop: 2 }}>SUB</span>
                                  </div>
                                ) : isSubstituteView ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '.65rem', color: 'var(--tx-muted)' }}>Covering for</span>
                                    <span className="teacher" style={{ color: 'var(--clr-primary)', fontWeight: 700 }}>
                                      {teachers.find(t => t.id === activeSub.absentTeacherId)?.name?.split(' ')[0]}
                                    </span>
                                    <span style={{ fontSize: '.6rem', background: 'var(--clr-primary)', color: 'white', padding: '1px 4px', borderRadius: 3, marginTop: 2 }}>SUBSTITUTING</span>
                                  </div>
                                ) : isAbsentTeacherView ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '.68rem', textDecoration: 'line-through', color: 'var(--tx-muted)', marginBottom: '-2px' }}>
                                      {teacher?.name?.split(' ')[0]}
                                    </span>
                                    <span className="teacher" style={{ color: 'var(--tx-muted)' }}>
                                      {subTeacher?.name?.split(' ')[0] ?? '—'}
                                    </span>
                                    <span style={{ fontSize: '.6rem', background: '#f87171', color: 'white', padding: '1px 4px', borderRadius: 3, marginTop: 2 }}>SUB COVERING</span>
                                  </div>
                                ) : (
                                  <span className="teacher">{teacher?.name?.split(' ')[0] ?? '—'}</span>
                                )
                              ) : (
                                <span className="teacher">{teacher?.name?.split(' ')[0] ?? '—'}</span>
                              )}
                              {cls && <span className="cls">{cls.name}</span>}
                            </>
                          ) : (
                            <span style={{ fontSize: '.72rem', color: 'var(--tx-xmuted)' }}>Empty</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
