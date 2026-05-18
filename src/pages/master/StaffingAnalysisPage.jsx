import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../store/AppStore';
import { analyzeStaffing, mergeNewSubjects, getDefaultRequirements } from '../../utils/generator';
import { ClipboardList, AlertTriangle, Check, ArrowRight, UserPlus, ShieldAlert } from 'lucide-react';

export default function StaffingAnalysisPage() {
  const { state } = useApp();
  const navigate = useNavigate();

  const { settings, teachers, subjects, classes, classAssignments = [], periodsConfig = {} } = state;
  const activeDayCount = Object.values(settings.workingDays).filter(Boolean).length;

  // Compute the classSubjectMap configured in the wizard
  const classSubjectMap = useMemo(() => {
    if (periodsConfig && Object.keys(periodsConfig).length > 0) {
      return mergeNewSubjects(periodsConfig, classes, classAssignments);
    }
    return getDefaultRequirements(classes, subjects, activeDayCount, classAssignments);
  }, [periodsConfig, classes, subjects, activeDayCount, classAssignments]);

  // Analyze staffing loads across all classes
  const staffingAnalysis = useMemo(
    () => analyzeStaffing(state, classSubjectMap),
    [state, classSubjectMap]
  );

  // Overall Statistics
  const stats = useMemo(() => {
    let totalPeriods = 0;
    let criticalTeachers = 0;
    let warnedTeachers = 0;
    let okTeachers = 0;

    // We can also calculate overloaded teachers across all subjects
    const teacherStats = {};
    staffingAnalysis.forEach(sub => {
      totalPeriods += sub.totalPeriodsNeeded;
      sub.teachers.forEach(t => {
        if (!teacherStats[t.teacherId]) {
          teacherStats[t.teacherId] = t.status;
        } else if (t.status === 'critical') {
          teacherStats[t.teacherId] = 'critical';
        } else if (t.status === 'warn' && teacherStats[t.teacherId] !== 'critical') {
          teacherStats[t.teacherId] = 'warn';
        }
      });
    });

    Object.values(teacherStats).forEach(status => {
      if (status === 'critical') criticalTeachers++;
      else if (status === 'warn') warnedTeachers++;
      else okTeachers++;
    });

    return {
      totalPeriods,
      criticalTeachers,
      warnedTeachers,
      okTeachers,
      distinctTeachers: Object.keys(teacherStats).length
    };
  }, [staffingAnalysis]);

  return (
    <div className="anim-fade-up">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2>Staffing & Teacher Load</h2>
          <p>Analyze teacher workload, class schedules, and subject allocations across the school.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/timetable/wizard')} style={{ gap: '.375rem' }}>
          Configure Periods <ArrowRight size={14} />
        </button>
      </div>

      {/* Overview Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--clr-primary)' }}>
          <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.25rem' }}>Total Periods Mapped</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-primary)' }}>{stats.totalPeriods}</div>
          <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)', marginTop: '.25rem' }}>periods allocated per week</div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--clr-red)' }}>
          <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.25rem' }}>Overloaded Staff</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-red)' }}>{stats.criticalTeachers}</div>
          <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)', marginTop: '.25rem' }}>exceeding max weekly periods</div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--clr-amber)' }}>
          <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.25rem' }}>Close to Capacity</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-amber)' }}>{stats.warnedTeachers}</div>
          <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)', marginTop: '.25rem' }}>at 80%+ of maximum load</div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--clr-green)' }}>
          <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.25rem' }}>Active Teachers</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-green)' }}>{stats.distinctTeachers} / {teachers.length}</div>
          <div style={{ fontSize: '.75rem', color: 'var(--tx-muted)', marginTop: '.25rem' }}>assigned to at least one class</div>
        </div>
      </div>

      {/* Staffing List by Subject */}
      <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        <ClipboardList size={18} color="var(--clr-primary)" /> Subject Allocation & Workload Breakdown
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {staffingAnalysis.map(sub => {
          const statusColor = sub.status === 'critical' ? 'var(--clr-red)' : sub.status === 'warn' ? 'var(--clr-amber)' : 'var(--clr-green)';
          const statusBg = sub.status === 'critical' ? '#fef2f2' : sub.status === 'warn' ? '#fefce8' : '#f0fdf4';
          
          return (
            <div key={sub.subjectId} style={{ 
              border: `1.5px solid ${sub.status === 'critical' ? 'var(--clr-red)' : 'var(--border)'}`, 
              borderRadius: 'var(--r-lg)', 
              overflow: 'hidden', 
              background: 'var(--bg-card)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              {/* Header block */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '.75rem', 
                padding: '.875rem 1.25rem', 
                background: statusBg, 
                borderBottom: `1px solid ${sub.status === 'critical' ? 'var(--clr-red)' : 'var(--border)'}`,
                flexWrap: 'wrap'
              }}>
                <div style={{ fontWeight: 700, fontSize: '.92rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <span style={{ 
                    background: sub.status === 'critical' ? 'var(--clr-red)' : 'var(--clr-primary)', 
                    color: '#fff', 
                    borderRadius: 6, 
                    padding: '2px 8px', 
                    fontSize: '.72rem', 
                    fontWeight: 800 
                  }}>{sub.subjectCode}</span>
                  {sub.subjectName}
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', flex: 1, fontSize: '.82rem', color: 'var(--tx-muted)', flexWrap: 'wrap' }}>
                  <span>Total periods: <strong>{sub.totalPeriodsNeeded}</strong> per week</span>
                  <span>Assigned: <strong>{sub.currentTeachers}</strong> teacher{sub.currentTeachers !== 1 ? 's' : ''}</span>
                </div>

                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  {sub.currentTeachers < sub.recommendedTeachers && (
                    <span style={{ 
                      fontSize: '.75rem', 
                      background: 'var(--clr-amber)', 
                      color: '#fff', 
                      borderRadius: 20, 
                      padding: '3px 12px', 
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '.25rem'
                    }}>
                      <UserPlus size={12} /> Understaffed (Rec: {sub.recommendedTeachers})
                    </span>
                  )}
                  {sub.status === 'critical' && (
                    <span style={{ 
                      fontSize: '.75rem', 
                      background: 'var(--clr-red)', 
                      color: '#fff', 
                      borderRadius: 20, 
                      padding: '3px 12px', 
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '.25rem'
                    }}>
                      <AlertTriangle size={12} /> Overload Warning
                    </span>
                  )}
                  {sub.status === 'ok' && (
                    <span style={{ 
                      fontSize: '.75rem', 
                      background: 'var(--clr-green)', 
                      color: '#fff', 
                      borderRadius: 20, 
                      padding: '3px 12px', 
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '.25rem'
                    }}>
                      <Check size={12} /> Healthy
                    </span>
                  )}
                </div>
              </div>

              {/* Teachers load breakdown */}
              <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
                {sub.teachers.map((t, idx) => {
                  const pct = Math.min(100, Math.round((t.periodsAssigned / t.maxPeriods) * 100));
                  const barColor = t.status === 'critical' ? 'var(--clr-red)' : t.status === 'warn' ? 'var(--clr-amber)' : 'var(--clr-green)';
                  const loadBg = t.status === 'critical' ? '#fef2f2' : t.status === 'warn' ? '#fffbeb' : '#f0fdf4';
                  
                  return (
                    <div key={t.teacherId} style={{ 
                      flex: '1 1 240px', 
                      padding: '1rem 1.25rem', 
                      borderRight: idx < sub.teachers.length - 1 ? '1px solid var(--border)' : 'none',
                      borderBottom: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '.85rem' }}>{t.teacherName}</div>
                        <span className="badge" style={{ 
                          fontSize: '.7rem', 
                          background: loadBg, 
                          color: barColor, 
                          borderColor: barColor,
                          fontWeight: 700
                        }}>{pct}% Load</span>
                      </div>
                      
                      <div style={{ fontSize: '.76rem', color: 'var(--tx-muted)', marginBottom: '.625rem', minHeight: '34px', lineHeight: 1.4 }}>
                        <strong>Classes:</strong> {t.classes.join(', ') || 'None'}<br />
                        <strong>Configured:</strong> {t.periodsAssigned} of {t.maxPeriods} max periods/week
                      </div>
                      
                      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width .3s' }}/>
                      </div>
                    </div>
                  );
                })}

                {sub.teachers.length === 0 && (
                  <div style={{ padding: '1.5rem', fontSize: '.85rem', color: 'var(--clr-red)', display: 'flex', alignItems: 'center', gap: '.5rem', width: '100%' }}>
                    <AlertTriangle size={15} />
                    <span><strong>No teachers assigned</strong> to this subject in any classes. Assign them in master data.</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {staffingAnalysis.length === 0 && (
          <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--tx-muted)' }}>
            <ClipboardList size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
            <h4>No Configured Subjects</h4>
            <p style={{ fontSize: '.85rem', marginTop: '.25rem' }}>Go to Timetable Wizard to allocate periods per week to subjects.</p>
          </div>
        )}
      </div>

      {/* Workload Legend */}
      <div style={{ 
        display: 'flex', 
        gap: '2rem', 
        marginTop: '1.5rem', 
        padding: '1rem 1.25rem', 
        borderRadius: 'var(--r-lg)', 
        background: 'var(--bg-muted)', 
        border: '1px solid var(--border)',
        flexWrap: 'wrap', 
        fontSize: '.82rem' 
      }}>
        <div style={{ fontWeight: 700, color: 'var(--tx-muted)', minWidth: 100 }}>Load Status Legend:</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--clr-green)' }} />
          <span><strong>Healthy (&lt;80%)</strong> — Teacher has plenty of available slots.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--clr-amber)' }} />
          <span><strong>Optimal (80%-100%)</strong> — Well-balanced weekly teaching workload.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--clr-red)' }} />
          <span><strong>Overloaded (&gt;100%)</strong> — Exceeds the teacher's maximum periods cap!</span>
        </div>
      </div>
    </div>
  );
}
