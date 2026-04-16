import React, { useState } from 'react';
import { useApp as useStore } from '../store/AppStore';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function Timetable() {
  const { state } = useStore();
  const [selectedClass, setSelectedClass] = useState(state.classes[0].id);

  // Filter schedule for selected class
  const classSchedule = state.schedule.filter(s => s.classId === selectedClass);

  const getCellData = (dayIndex, periodIndex) => {
    const entry = classSchedule.find(s => s.day === dayIndex && s.period === periodIndex);
    if (!entry) return null;
    const teacher = state.teachers.find(t => t.id === entry.teacherId);
    const subject = state.subjects.find(s => s.id === entry.subjectId);
    return { teacher, subject };
  };

  return (
    <div className="timetable-view">
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>View Timetable for:</h3>
        <select 
          className="input-field" 
          value={selectedClass} 
          onChange={(e) => setSelectedClass(e.target.value)}
          style={{ width: '200px' }}
        >
          {state.classes.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="card timetable-wrapper" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr>
              <th style={{ padding: '1rem', background: 'var(--bg-main)', border: '1px solid var(--border)' }}>Day</th>
              {Array.from({ length: state.config.periodsPerDay }).map((_, i) => (
                <th key={i} style={{ padding: '1rem', background: 'var(--bg-main)', border: '1px solid var(--border)' }}>
                  Period {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day, dIdx) => (
              <tr key={day}>
                <td style={{ padding: '1rem', fontWeight: 600, border: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>{day}</td>
                {Array.from({ length: state.config.periodsPerDay }).map((_, pIdx) => {
                  const data = getCellData(dIdx, pIdx + 1);
                  return (
                    <td key={pIdx} style={{ padding: '0.75rem', border: '1px solid var(--border)', textAlign: 'center', transition: 'var(--transition)' }} className="timetable-cell hover:bg-subtle">
                      {data ? (
                        <>
                          <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{data.subject?.code}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{data.teacher?.name}</div>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
