import React, { useState, useMemo } from 'react';
import { useApp } from '../store/AppStore';
import { useAuth } from '../context/AuthContext';
import { getSuggestedSubstitutes } from '../utils/engine';
import { UserMinus, Check, Clock, RotateCcw, Printer } from 'lucide-react';

const LEAVE_TYPES = ['Sick Leave','Casual Leave','Comp Off','Training','Personal Leave'];
const DAY_IDX = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5 };

export default function SubstitutionPage() {
  const { state, dispatch } = useApp();
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const todayDayKey = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()];
  const todayIdx = DAY_IDX[todayDayKey] ?? 0;

  const [tab, setTab] = useState('today');  // today | audit
  const [absentForm, setAbsentForm] = useState({ teacherId:'', leaveType:'Sick Leave', reason:'' });
  const [expanded, setExpanded] = useState(null);

  const todaysAbsences = state.absences.filter(a => a.date === today);
  const auditLog = [...state.substitutions].reverse();

  const handleMarkAbsent = () => {
    if (!absentForm.teacherId) return;
    if (todaysAbsences.some(a => a.teacherId === absentForm.teacherId)) {
      alert('This teacher is already marked absent today.');
      return;
    }
    dispatch({ type:'MARK_ABSENT', payload: {
      id: `abs_${Date.now()}`, date: today,
      teacherId: absentForm.teacherId,
      leaveType: absentForm.leaveType,
      reason: absentForm.reason
    }});
    setAbsentForm(p => ({ ...p, teacherId:'', reason:'' }));
  };

  const handleAssign = (scheduleId, period, substituteTeacherId, absentTeacherId) => {
    dispatch({ type:'ASSIGN_SUBSTITUTE', payload: {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      date: today, day: todayIdx, period, scheduleId,
      absentTeacherId, substituteTeacherId,
      assignedBy: user?.name ?? 'Admin',
      timestamp: new Date().toISOString()
    }});
  };

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div><h2>Substitution Management</h2><p>Manage daily absences and assign substitute teachers</p></div>
        <button className="btn btn-outline" onClick={()=>window.print()}>
          <Printer size={15}/> Print Roster
        </button>
      </div>

      {/* Absence form */}
      <div className="card card-body" style={{ marginBottom:'1.5rem', background:'linear-gradient(135deg,#fef2f2,#fff)' }}>
        <h3 style={{ marginBottom:'.875rem', color:'var(--clr-red)', display:'flex', alignItems:'center', gap:'.5rem' }}>
          <UserMinus size={18}/> Report Today's Absence
        </h3>
        <div style={{ display:'flex', gap:'.75rem', flexWrap:'wrap', alignItems:'flex-end' }}>
          <div className="field" style={{ minWidth:220, flex:1 }}>
            <label>Teacher</label>
            <select className="input" value={absentForm.teacherId} onChange={e=>setAbsentForm(p=>({...p,teacherId:e.target.value}))}>
              <option value="">— Select Teacher —</option>
              {state.teachers.map(t=>(
                <option key={t.id} value={t.id} disabled={todaysAbsences.some(a=>a.teacherId===t.id)}>
                  {t.name} ({t.department}){todaysAbsences.some(a=>a.teacherId===t.id)?' ✓ Absent':''}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth:160 }}>
            <label>Leave Type</label>
            <select className="input" value={absentForm.leaveType} onChange={e=>setAbsentForm(p=>({...p,leaveType:e.target.value}))}>
              {LEAVE_TYPES.map(lt=><option key={lt}>{lt}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth:200, flex:1 }}>
            <label>Reason (optional)</label>
            <input className="input" placeholder="e.g. Fever, Family emergency…" value={absentForm.reason} onChange={e=>setAbsentForm(p=>({...p,reason:e.target.value}))}/>
          </div>
          <button className="btn btn-danger" style={{ height:42 }} onClick={handleMarkAbsent} disabled={!absentForm.teacherId}>
            <UserMinus size={15}/> Mark Absent
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs"><button className={`tab-btn ${tab==='today'?'active':''}`} onClick={()=>setTab('today')}>Today's Schedule</button><button className={`tab-btn ${tab==='audit'?'active':''}`} onClick={()=>setTab('audit')}>Audit Log ({auditLog.length})</button></div>

      {tab==='today' && (
        todaysAbsences.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Check size={38} style={{ margin:'0 auto .75rem', opacity:.3 }} />
              <h3 style={{ marginBottom:'.5rem' }}>All Clear!</h3>
              <p>No absentees reported today. Classes are running normally.</p>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {todaysAbsences.map(abs => {
              const teacher = state.teachers.find(t=>t.id===abs.teacherId);
              const affectedSlots = state.schedule.filter(s => s.day===todayIdx && s.teacherId===abs.teacherId);
              const isExpanded = expanded===abs.id;
              return (
                <div key={abs.id} className="card anim-fade-up">
                  <div className="card-header" style={{ cursor:'pointer' }} onClick={()=>setExpanded(isExpanded?null:abs.id)}>
                    <div style={{ display:'flex', alignItems:'center', gap:'.875rem' }}>
                      <div style={{ width:40,height:40,borderRadius:12,background:'var(--clr-red-l)',color:'var(--clr-red)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700 }}>
                        {teacher?.name?.[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight:600 }}>{teacher?.name}</div>
                        <div style={{ fontSize:'.8rem', color:'var(--tx-muted)' }}>{teacher?.department} · {abs.leaveType}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:.75 }}>
                      <span className="badge badge-red">{affectedSlots.length} periods</span>
                      <span style={{ fontSize:'1.2rem', marginLeft:'.5rem', color:'var(--tx-muted)' }}>{isExpanded?'▲':'▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:'.75rem' }}>
                      {affectedSlots.length === 0 ? (
                        <p style={{ color:'var(--tx-muted)', fontSize:'.875rem', padding:'.5rem' }}>No classes scheduled today for this teacher.</p>
                      ) : affectedSlots.map(slot => {
                        const cls = state.classes.find(c=>c.id===slot.classId);
                        const sub = state.subjects.find(s=>s.id===slot.subjectId);
                        const periodInfo = state.settings.periodTimings.find(p=>p.period===slot.period);
                        const assigned = state.substitutions.find(s=>s.date===today&&s.scheduleId===slot.id);
                        const assignedTeacher = assigned ? state.teachers.find(t=>t.id===assigned.substituteTeacherId) : null;
                        
                        let displaySub = sub;
                        if (assignedTeacher) {
                          const subAssignment = state.classAssignments.find(a => a.classId === slot.classId && a.teacherId === assignedTeacher.id);
                          if (subAssignment) {
                            displaySub = state.subjects.find(s => s.id === subAssignment.subjectId) || sub;
                          }
                        }

                        const suggestions = !assigned ? getSuggestedSubstitutes(state, todayIdx, slot.period, abs.teacherId) : [];

                        return (
                          <div key={slot.id} style={{ border:'1px solid var(--border)', borderRadius:'var(--r-lg)', overflow:'hidden', background: assigned ? '#f0fdf4' : '#fff' }}>
                            <div style={{ padding:'.75rem 1rem', background: assigned?'#dcfce7':'var(--bg-muted)', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
                                <div style={{ fontSize:'.75rem', fontWeight:700, padding:'.25rem .5rem', background: assigned?'var(--clr-green)':'var(--clr-amber)', color:'white', borderRadius:6 }}>
                                  P{slot.period}
                                </div>
                                <div>
                                  <span style={{ fontWeight:600, fontSize:'.875rem' }}>{periodInfo?.start} – {periodInfo?.end}</span>
                                  <span style={{ color:'var(--tx-muted)', fontSize:'.8rem', marginLeft:'.5rem' }}>· {cls?.name} · {displaySub?.name}</span>
                                </div>
                              </div>
                              {assigned ? (
                                <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
                                  <span className="badge badge-green"><Check size={11}/> {assignedTeacher?.name}</span>
                                  <button className="btn btn-ghost btn-sm btn-icon" title="Undo" onClick={()=>dispatch({type:'REMOVE_SUBSTITUTE',payload:assigned.id})}>
                                    <RotateCcw size={13}/>
                                  </button>
                                </div>
                              ) : (
                                <span className="badge badge-amber"><Clock size={11}/> Needs sub</span>
                              )}
                            </div>
                            {!assigned && suggestions.length > 0 && (
                              <div style={{ padding:'.75rem 1rem' }}>
                                <div style={{ fontSize:'.78rem', fontWeight:600, color:'var(--tx-muted)', marginBottom:'.5rem' }}>SUGGESTED FREE TEACHERS</div>
                                <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap' }}>
                                  {suggestions.slice(0,5).map(sug => (
                                    <button
                                      key={sug.teacher.id}
                                      className="btn btn-outline btn-sm"
                                      style={{ fontSize:'.78rem' }}
                                      onClick={()=>handleAssign(slot.id, slot.period, sug.teacher.id, abs.teacherId)}
                                      title={sug.reasons.join(' · ')}
                                    >
                                      {sug.teacher.name.split(' ')[0]}
                                    </button>
                                  ))}
                                </div>
                                {suggestions.length===0 && <p style={{ fontSize:'.82rem', color:'var(--clr-red)' }}>⚠ No free teachers available this period.</p>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div style={{ display:'flex', justifyContent:'flex-end' }}>
                        <button className="btn btn-outline btn-sm" style={{ color:'var(--clr-red)', borderColor:'var(--clr-red)' }}
                          onClick={()=>dispatch({type:'REMOVE_ABSENCE',payload:abs.id})}>
                          Remove Absence
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab==='audit' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Period</th><th>Absent Teacher</th><th>Substitute</th><th>Assigned By</th><th>Time</th></tr></thead>
              <tbody>
                {auditLog.length===0 ? (
                  <tr><td colSpan={6} style={{ textAlign:'center', padding:'2rem', color:'var(--tx-muted)' }}>No substitutions recorded yet.</td></tr>
                ) : auditLog.map(log => {
                  const absent = state.teachers.find(t=>t.id===log.absentTeacherId);
                  const sub = state.teachers.find(t=>t.id===log.substituteTeacherId);
                  return (
                    <tr key={log.id}>
                      <td>{log.date}</td>
                      <td><span className="badge badge-indigo">P{log.period}</span></td>
                      <td>{absent?.name ?? '—'}</td>
                      <td><strong>{sub?.name ?? '—'}</strong></td>
                      <td>{log.assignedBy}</td>
                      <td style={{ fontSize:'.8rem', color:'var(--tx-muted)' }}>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
