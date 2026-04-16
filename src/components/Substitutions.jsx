import React, { useState } from 'react';
import { useApp as useStore } from '../store/AppStore';
import { Check, X, AlertTriangle, Settings, UserPlus } from 'lucide-react';
import { suggestSubstitutes } from '../utils/substitutionLogic';

export default function Substitutions() {
  const { state, dispatch } = useStore();
  const todayDate = new Date().toISOString().split('T')[0];
  const todayDayOfWeek = 0; // Hardcoding to Monday for mock purposes

  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [absenceReason, setAbsenceReason] = useState('');

  const todaysAbsences = state.absences.filter(a => a.date === todayDate);

  const handleMarkAbsent = () => {
    if (!selectedTeacherId) return;
    dispatch({ 
      type: 'MARK_ABSENT', 
      payload: { id: Date.now().toString(), teacherId: selectedTeacherId, date: todayDate, reason: absenceReason }
    });
    setSelectedTeacherId('');
    setAbsenceReason('');
  };

  const handleAssignSubstitute = (scheduleId, period, substituteTeacherId) => {
    dispatch({
      type: 'ASSIGN_SUBSTITUTE',
      payload: {
        id: Date.now().toString() + Math.random(),
        date: todayDate,
        day: todayDayOfWeek,
        period,
        scheduleId,
        substituteTeacherId
      }
    });
  };

  return (
    <div className="substitutions-view">
      <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
        {/* Absence Form */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            Report Absence (Today)
          </h3>
          <div className="input-group">
            <label>Select Teacher</label>
            <select 
              className="input-field" 
              value={selectedTeacherId} 
              onChange={e => setSelectedTeacherId(e.target.value)}
            >
              <option value="">-- Select Teacher --</option>
              {state.teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.department})</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label>Reason (Optional)</label>
            <input 
              type="text" 
              className="input-field" 
              value={absenceReason}
              onChange={e => setAbsenceReason(e.target.value)}
              placeholder="e.g. Sick Leave"
            />
          </div>
          <button className="btn btn-danger" style={{ width: '100%' }} onClick={handleMarkAbsent}>
            Mark Absent
          </button>
        </div>

        {/* Action Panel */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            Today's Absences & Substitutions
          </h3>
          {todaysAbsences.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No absences reported today.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {todaysAbsences.map(absent => {
                const teacher = state.teachers.find(t => t.id === absent.teacherId);
                
                // Which periods did this teacher have today?
                const classesToday = state.schedule.filter(s => s.day === todayDayOfWeek && s.teacherId === teacher.id);
                
                return (
                  <div key={absent.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div style={{ background: 'var(--bg-subtle)', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className="badge badge-danger">Absent</span>
                        <strong>{teacher.name}</strong>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{classesToday.length} periods affected</span>
                      </div>
                    </div>
                    
                    <div style={{ padding: '1rem' }}>
                      {classesToday.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No classes scheduled for today.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          {classesToday.map(c => {
                            const clsInfo = state.classes.find(cl => cl.id === c.classId);
                            const currentSub = state.substitutions.find(sub => sub.date === todayDate && sub.scheduleId === c.id);
                            
                            // Suggestions logic
                            let suggestions = [];
                            if (!currentSub) {
                              suggestions = suggestSubstitutes(state, todayDayOfWeek, c.period, teacher.id, c.classId);
                            }

                            return (
                              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <span style={{ fontWeight: 600 }}>Period {c.period}</span> — {clsInfo.name}
                                  </div>
                                  <div>
                                    {currentSub ? (
                                      <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <Check size={14} /> Assigned to {state.teachers.find(t=>t.id === currentSub.substituteTeacherId)?.name}
                                      </span>
                                    ) : (
                                      <span className="badge badge-warning">Needs Sub</span>
                                    )}
                                  </div>
                                </div>
                                
                                {!currentSub && (
                                  <div style={{ marginTop: '0.5rem' }}>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Suggested Free Teachers:</p>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                      {suggestions.slice(0, 3).map(sug => (
                                        <button 
                                          key={sug.teacher.id} 
                                          className="btn btn-outline" 
                                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                          onClick={() => handleAssignSubstitute(c.id, c.period, sug.teacher.id)}
                                        >
                                          <UserPlus size={12} /> {sug.teacher.name} ({sug.score} score)
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
