import React from 'react';
import { useApp as useStore } from '../store/AppStore';

export default function MasterData() {
  const { state } = useStore();

  return (
    <div className="master-data">
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Teachers Directory</h3>
          <button className="btn btn-primary">+ Add Teacher</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem' }}>Name</th>
              <th style={{ padding: '0.75rem' }}>Department</th>
              <th style={{ padding: '0.75rem' }}>Max Workload</th>
            </tr>
          </thead>
          <tbody>
            {state.teachers.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem' }}>{t.name}</td>
                <td style={{ padding: '0.75rem' }}><span className="badge badge-warning">{t.department}</span></td>
                <td style={{ padding: '0.75rem' }}>{t.maxPeriodsPerWeek} periods/wk</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Classes</h3>
          <button className="btn btn-primary">+ Add Class</button>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {state.classes.map(c => (
            <div key={c.id} className="badge badge-success" style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
              {c.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
