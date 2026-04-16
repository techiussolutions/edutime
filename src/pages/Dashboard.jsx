import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../store/AppStore';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserMinus, AlertTriangle, CalendarCheck,
  BookOpen, TrendingUp, ArrowRight, Clock
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import SetupWizard, { isSetupComplete } from '../components/SetupWizard';

export default function Dashboard() {
  const { state, dbLoaded } = useApp();
  const { isAdmin, isSuperAdmin } = useAuth();

  // Show setup wizard on each login until required settings are configured
  const [showSetup, setShowSetup] = useState(false);
  useEffect(() => {
    if (!dbLoaded || isSuperAdmin) return;
    if (!isSetupComplete(state)) {
      setShowSetup(true);
    }
  }, [dbLoaded, isSuperAdmin, state.school, state.settings]);
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];
  const todayDay = new Date().getDay(); // 0=Sun, 1=Mon...
  const todayIdx = todayDay === 0 ? 6 : todayDay - 1; // 0=Mon...

  const todaysAbsences = useMemo(() =>
    state.absences.filter(a => a.date === today), [state.absences, today]);

  const todaysSubs = useMemo(() =>
    state.substitutions.filter(s => s.date === today), [state.substitutions, today]);

  // Teacher workload chart data
  const workloadData = useMemo(() => {
    return state.teachers.slice(0, 8).map(t => {
      const assigned = state.schedule.filter(s => s.teacherId === t.id).length;
      const pct = Math.round((assigned / t.maxPeriods) * 100);
      return { name: t.name.split(' ')[0], assigned, max: t.maxPeriods, pct };
    });
  }, [state.teachers, state.schedule]);

  const pendingCount = todaysAbsences.length > 0
    ? (todaysAbsences.length * 6) - todaysSubs.length
    : 0;

  return (
    <div className="anim-fade-up">
      {showSetup && <SetupWizard onComplete={() => setShowSetup(false)} />}
      <div className="page-header">
        <div>
          <h2>Good morning 👋</h2>
          <p>{state.school.name} • {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="card stat-card">
          <div className="stat-icon indigo"><Users size={22} /></div>
          <div>
            <div className="stat-value">{state.teachers.length}</div>
            <div className="stat-label">Total Staff</div>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon green"><CalendarCheck size={22} /></div>
          <div>
            <div className="stat-value">{state.classes.length}</div>
            <div className="stat-label">Classes</div>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon red"><UserMinus size={22} /></div>
          <div>
            <div className="stat-value" style={{ color: todaysAbsences.length > 0 ? 'var(--clr-red)' : undefined }}>
              {todaysAbsences.length}
            </div>
            <div className="stat-label">Absent Today</div>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon amber"><AlertTriangle size={22} /></div>
          <div>
            <div className="stat-value" style={{ color: pendingCount > 0 ? 'var(--clr-amber)' : undefined }}>
              {pendingCount}
            </div>
            <div className="stat-label">Pending Subs</div>
          </div>
        </div>
      </div>

      {/* Main content row */}
      <div className="dashboard-grid">

        {/* Workload Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Teacher Workload</h3>
              <p style={{ fontSize: '.8rem' }}>Periods assigned vs capacity</p>
            </div>
            <TrendingUp size={18} color="var(--tx-muted)" />
          </div>
          <div className="card-body" style={{ paddingTop: '.75rem' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={workloadData} barSize={28} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--tx-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--tx-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: '.8rem' }}
                  formatter={(v, n) => [v, n === 'assigned' ? 'Assigned Periods' : 'Capacity']}
                />
                <Bar dataKey="assigned" radius={[4,4,0,0]} name="assigned">
                  {workloadData.map((entry, i) => (
                    <Cell key={i} fill={entry.pct >= 90 ? '#ef4444' : entry.pct >= 70 ? '#f59e0b' : '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Today's Absences Panel */}
        <div className="card">
          <div className="card-header">
            <h3>Today's Absences</h3>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/substitutions')}>
              Manage <ArrowRight size={14} />
            </button>
          </div>
          <div className="card-body" style={{ padding: 0, maxHeight: 280, overflowY: 'auto' }}>
            {todaysAbsences.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <CalendarCheck size={32} style={{ margin: '0 auto .5rem', opacity: .3 }} />
                <p style={{ fontSize: '.875rem' }}>All staff present today!</p>
              </div>
            ) : (
              todaysAbsences.map(abs => {
                const t = state.teachers.find(x => x.id === abs.teacherId);
                return (
                  <div key={abs.id} style={{ padding: '.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:'var(--clr-red-l)', color:'var(--clr-red)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, flexShrink:0 }}>
                      {t?.name?.[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{t?.name}</div>
                      <div style={{ fontSize: '.76rem', color: 'var(--tx-muted)' }}>{abs.leaveType} · {abs.reason || '—'}</div>
                    </div>
                    <span className="badge badge-red">{abs.leaveType}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick today schedule preview */}
      {state.classes.length > 0 && state.schedule.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div><h3>Today's Schedule</h3><p style={{ fontSize: '.8rem' }}>{state.classes[0]?.name} · {new Date().toLocaleDateString('en-IN', { weekday: 'long' })}</p></div>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/timetable')}>
              Full Timetable <ArrowRight size={14} />
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {state.settings.periodTimings.map(p => (
                    <th key={p.period}>{p.label}<br /><span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{p.start}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {state.settings.periodTimings.map(p => {
                    if (p.isBreak) return <td key={p.period} style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--tx-muted)', background: 'var(--bg-muted)', fontStyle: 'italic' }}>Break</td>;
                    const slot = state.schedule.find(s => s.classId === state.classes[0]?.id && s.day === Math.min(todayIdx, 4) && s.period === p.period);
                    const teacher = slot ? state.teachers.find(t => t.id === slot.teacherId) : null;
                    const subject = slot ? state.subjects.find(s => s.id === slot.subjectId) : null;
                    const isAbsent = todaysAbsences.some(a => a.teacherId === slot?.teacherId);
                    const sub = todaysSubs.find(s => s.scheduleId === slot?.id);
                    return (
                      <td key={p.period} style={{ textAlign: 'center', background: isAbsent && !sub ? '#fef2f2' : undefined }}>
                        {slot ? (
                          <>
                            <div style={{ fontWeight: 600, fontSize: '.82rem', color: 'var(--clr-primary)' }}>{subject?.code}</div>
                            <div style={{ fontSize: '.75rem', color: isAbsent && !sub ? 'var(--clr-red)' : 'var(--tx-muted)', textDecoration: isAbsent && !sub ? 'line-through' : undefined }}>
                              {teacher?.name?.split(' ')[0]}
                            </div>
                            {sub && <div style={{ fontSize: '.7rem', color: 'var(--clr-green)', fontWeight: 600 }}>↳ {state.teachers.find(t => t.id === sub.substituteTeacherId)?.name?.split(' ')[0]}</div>}
                          </>
                        ) : <span style={{ color: 'var(--tx-xmuted)', fontSize: '.8rem' }}>—</span>}
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
