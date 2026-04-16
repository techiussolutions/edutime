import React from 'react';
import { useApp as useStore } from '../store/AppStore';
import { Users, AlertCircle, CalendarCheck, Clock, UserMinus } from 'lucide-react';

export default function Dashboard() {
  const { state } = useStore();
  const { teachers, classes, absences, substitutions } = state;

  const todayDate = new Date().toISOString().split('T')[0];
  const todaysAbsences = absences.filter(a => a.date === todayDate) || [];
  
  // The unassigned count is number of absences * periods - substitutions formed
  // For simplicity, let's just show raw counts
  
  return (
    <div className="dashboard">
      <div className="dashboard-grid">
        <div className="card stat-card primary">
          <div className="stat-icon"><Users /></div>
          <div className="stat-info">
            <h3>Total Teachers</h3>
            <p>{teachers.length}</p>
          </div>
        </div>
        
        <div className="card stat-card danger">
          <div className="stat-icon"><UserMinus /></div>
          <div className="stat-info">
            <h3>Staff Absent Today</h3>
            <p>{todaysAbsences.length}</p>
          </div>
        </div>
        
        <div className="card stat-card warning">
          <div className="stat-icon"><AlertCircle /></div>
          <div className="stat-info">
            <h3>Unassigned Substitutions</h3>
            <p>{todaysAbsences.length > 0 ? 'Action Needed' : '0'}</p>
          </div>
        </div>
      </div>

      <div className="dashboard-content" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        <div className="card">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarCheck size={18} className="text-primary" /> Today's Overview
          </h3>
          {todaysAbsences.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No absences reported for today. All classes covered!
            </div>
          ) : (
            <div className="absent-list">
               {/* List absences here */}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} className="text-primary" /> Quick Actions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button className="btn btn-outline" style={{width: '100%', justifyContent: 'flex-start'}}>+ Mark Teacher Absent</button>
            <button className="btn btn-outline" style={{width: '100%', justifyContent: 'flex-start'}}>Print Daily Roster</button>
          </div>
        </div>
      </div>
    </div>
  );
}
