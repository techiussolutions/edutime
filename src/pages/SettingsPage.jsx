import React, { useState } from 'react';
import { useApp } from '../store/AppStore';
import {
  Settings2, Clock, CalendarDays, Users, ShieldCheck, Plus, Trash2, Save
} from 'lucide-react';

const TABS = [
  { id: 'school',      label: 'School Profile',    icon: Settings2 },
  { id: 'days',        label: 'Working Days',       icon: CalendarDays },
  { id: 'periods',     label: 'Period Timings',     icon: Clock },
  { id: 'workload',    label: 'Workload Rules',     icon: Users },
  { id: 'sub_rules',  label: 'Substitution Rules', icon: ShieldCheck },
];

export default function SettingsPage() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState('school');
  const [saved, setSaved] = useState(false);

  const { settings, school } = state;

  const toast = () => { setSaved(true); setTimeout(()=>setSaved(false), 2000); };

  // School form
  const [schoolForm, setSchoolForm] = useState({ ...school });
  const saveSchool = () => { dispatch({ type:'UPDATE_SCHOOL', payload: schoolForm }); toast(); };

  // Working days
  const toggleDay = (d) => {
    dispatch({ type:'UPDATE_SETTINGS', payload: {
      workingDays: { ...settings.workingDays, [d]: !settings.workingDays[d] }
    }});
    toast();
  };

  // Period actions
  const updatePeriod = (period, field, value) => {
    dispatch({ type:'UPDATE_PERIOD', payload: { period, [field]: value } });
  };
  const toggleBreak = (period) => {
    const pt = settings.periodTimings.find(p=>p.period===period);
    dispatch({ type:'UPDATE_PERIOD', payload: { period, isBreak: !pt.isBreak, label: pt.isBreak ? `Period ${period}` : 'Break' } });
    toast();
  };

  // Workload
  const [defaultMax, setDefaultMax] = useState(settings.maxDefaultPeriods);
  const saveWorkload = () => { dispatch({ type:'UPDATE_SETTINGS', payload: { maxDefaultPeriods: Number(defaultMax) } }); toast(); };

  // Sub rules
  const RULES = [
    { id: 'same_dept',    label: 'Same Department First',     desc: 'Prefer teachers from the same department as the absent teacher' },
    { id: 'same_subject', label: 'Same Subject Qualified',    desc: 'Prefer teachers qualified in the required subject' },
    { id: 'any_free',     label: 'Any Free Teacher',          desc: 'Fall back to any teacher with a free period' },
  ];
  const moveRule = (fromIdx, toIdx) => {
    const arr = [...settings.substitutionPriority];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    dispatch({ type:'UPDATE_SETTINGS', payload: { substitutionPriority: arr } });
    toast();
  };

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div><h2>Settings</h2><p>Control every aspect of your school's timetable and platform</p></div>
        {saved && <div className="badge badge-green" style={{ padding:'.4rem .8rem', fontSize:'.85rem' }}>✓ Saved!</div>}
      </div>

      <div style={{ display:'flex', gap:'1.5rem', minHeight:600 }}>
        {/* Side tabs */}
        <div className="card" style={{ width:220, flexShrink:0, padding:'1rem', alignSelf:'flex-start', position:'sticky', top:0 }}>
          {TABS.map(({ id, label, icon:Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display:'flex', alignItems:'center', gap:'.625rem', width:'100%',
                padding:'.625rem .75rem', borderRadius:'var(--r-md)', fontSize:'.875rem',
                fontWeight:500, background: tab===id ? 'var(--clr-primary-l)' : 'transparent',
                color: tab===id ? 'var(--clr-primary)' : 'var(--tx-muted)',
                border:'none', cursor:'pointer', transition:'var(--ease)', marginBottom:2
              }}
            >
              <Icon size={16}/> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1 }}>

          {/* SCHOOL PROFILE */}
          {tab==='school' && (
            <div className="card card-body anim-fade-in" style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <h3 style={{ marginBottom:'.5rem' }}>School Profile</h3>
              <div className="grid-2">
                <div className="field"><label>School Name</label>
                  <input className="input" value={schoolForm.name} onChange={e=>setSchoolForm(p=>({...p,name:e.target.value}))} />
                </div>
                <div className="field"><label>School Code</label>
                  <input className="input" value={schoolForm.code} onChange={e=>setSchoolForm(p=>({...p,code:e.target.value}))} />
                </div>
                <div className="field"><label>Board</label>
                  <select className="input" value={schoolForm.board} onChange={e=>setSchoolForm(p=>({...p,board:e.target.value}))}>
                    <option>CBSE</option><option>ICSE</option><option>State Board</option><option>IB</option>
                  </select>
                </div>
                <div className="field"><label>Academic Year</label>
                  <input className="input" value={schoolForm.academicYear} onChange={e=>setSchoolForm(p=>({...p,academicYear:e.target.value}))} placeholder="e.g. 2025-2026"/>
                </div>
                <div className="field"><label>Address</label>
                  <input className="input" value={schoolForm.address} onChange={e=>setSchoolForm(p=>({...p,address:e.target.value}))} />
                </div>
              </div>
              <div style={{marginTop:'.5rem'}}><button className="btn btn-primary" onClick={saveSchool}><Save size={15}/>Save School Profile</button></div>
            </div>
          )}

          {/* WORKING DAYS */}
          {tab==='days' && (
            <div className="card card-body anim-fade-in">
              <h3 style={{ marginBottom:'1rem' }}>Working Days</h3>
              <p style={{ marginBottom:'1.5rem', fontSize:'.9rem' }}>Toggle the days your school is operational. Disabled days will not appear in the timetable grid.</p>
              <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap' }}>
                {Object.entries(settings.workingDays).map(([day, enabled]) => (
                  <div key={day} style={{
                    display:'flex', flexDirection:'column', alignItems:'center', gap:'.75rem',
                    padding:'1.25rem 1.5rem', borderRadius:'var(--r-xl)', border:`2px solid ${enabled?'var(--clr-primary)':'var(--border)'}`,
                    background: enabled ? 'var(--clr-primary-l)' : 'var(--bg-muted)',
                    cursor:'pointer', transition:'var(--ease)', minWidth:90
                  }} onClick={() => toggleDay(day)}>
                    <div style={{ fontSize:'1.5rem' }}>
                      {day==='Mon'?'🌤':`${day==='Tue'?'☀️':day==='Wed'?'🌥':day==='Thu'?'🌤':day==='Fri'?'🎉':'📚'}`}
                    </div>
                    <div style={{ fontWeight:600, fontSize:'.9rem', color: enabled ? 'var(--clr-primary)' : 'var(--tx-muted)' }}>{day}</div>
                    <div className={`badge ${enabled?'badge-indigo':'badge-gray'}`}>{enabled?'Active':'Off'}</div>
                  </div>
                ))}
              </div>
              <div className="alert alert-info" style={{ marginTop:'1.5rem', fontSize:'.85rem' }}>
                <span>💡</span>
                <span>Changes take effect on the timetable grid immediately. Make sure period timings are configured correctly for active days.</span>
              </div>
            </div>
          )}

          {/* PERIOD TIMINGS */}
          {tab==='periods' && (
            <div className="card anim-fade-in">
              <div className="card-header">
                <div><h3>Period Timings</h3><p style={{fontSize:'.82rem'}}>Configure start/end time for each period. Mark periods as breaks.</p></div>
                <div style={{ display:'flex', gap:'.5rem' }}>
                  <button className="btn btn-outline btn-sm" onClick={()=>dispatch({type:'ADD_PERIOD'})}><Plus size={14}/>Add Period</button>
                </div>
              </div>
              <div style={{ padding:'1rem' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding:'.5rem .75rem', textAlign:'left', fontSize:'.8rem', color:'var(--tx-muted)', fontWeight:600 }}>#</th>
                      <th style={{ padding:'.5rem .75rem', textAlign:'left', fontSize:'.8rem', color:'var(--tx-muted)', fontWeight:600 }}>Label</th>
                      <th style={{ padding:'.5rem .75rem', textAlign:'left', fontSize:'.8rem', color:'var(--tx-muted)', fontWeight:600 }}>Start</th>
                      <th style={{ padding:'.5rem .75rem', textAlign:'left', fontSize:'.8rem', color:'var(--tx-muted)', fontWeight:600 }}>End</th>
                      <th style={{ padding:'.5rem .75rem', textAlign:'center', fontSize:'.8rem', color:'var(--tx-muted)', fontWeight:600 }}>Is Break?</th>
                      <th style={{ padding:'.5rem .75rem', textAlign:'center', fontSize:'.8rem', color:'var(--tx-muted)', fontWeight:600 }}>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settings.periodTimings.map(p => (
                      <tr key={p.period} style={{ borderBottom:'1px solid var(--border)', background: p.isBreak ? 'var(--bg-muted)' : undefined }}>
                        <td style={{ padding:'.5rem .75rem', fontWeight:700, color: p.isBreak ? 'var(--tx-muted)' : 'var(--clr-primary)' }}>{p.period}</td>
                        <td style={{ padding:'.5rem .75rem' }}>
                          <input className="input input-sm" value={p.label} onChange={e=>updatePeriod(p.period,'label',e.target.value)} onBlur={toast} style={{ width:140 }}/>
                        </td>
                        <td style={{ padding:'.5rem .75rem' }}>
                          <input type="time" className="input input-sm" value={p.start} onChange={e=>updatePeriod(p.period,'start',e.target.value)} onBlur={toast} style={{ width:120 }}/>
                        </td>
                        <td style={{ padding:'.5rem .75rem' }}>
                          <input type="time" className="input input-sm" value={p.end} onChange={e=>updatePeriod(p.period,'end',e.target.value)} onBlur={toast} style={{ width:120 }}/>
                        </td>
                        <td style={{ padding:'.5rem .75rem', textAlign:'center' }}>
                          <label className="toggle">
                            <input type="checkbox" checked={p.isBreak} onChange={()=>toggleBreak(p.period)}/>
                            <span className="toggle-track"/>
                          </label>
                        </td>
                        <td style={{ padding:'.5rem .75rem', textAlign:'center' }}>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>{dispatch({type:'REMOVE_PERIOD',payload:p.period});toast();}}>
                            <Trash2 size={14} color="var(--clr-red)"/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* WORKLOAD RULES */}
          {tab==='workload' && (
            <div className="card card-body anim-fade-in">
              <h3 style={{ marginBottom:'1rem' }}>Teacher Workload Rules</h3>
              <div className="field" style={{ maxWidth:320 }}>
                <label>Default Max Periods Per Week</label>
                <small>This applies to new teachers. Existing teachers can be customized in Master Data → Teachers.</small>
                <input type="number" className="input" min={1} max={50} value={defaultMax} onChange={e=>setDefaultMax(e.target.value)} style={{ marginTop:'.375rem' }}/>
              </div>
              <div style={{ marginTop:'1rem' }}>
                <button className="btn btn-primary" onClick={saveWorkload}><Save size={15}/>Save</button>
              </div>
              <div className="divider"/>
              <h4 style={{ marginBottom:'.75rem' }}>Overload Thresholds</h4>
              <div className="grid-3">
                <div style={{ padding:'1rem', borderRadius:'var(--r-lg)', background:'var(--clr-green-l)', border:'1px solid #6ee7b7' }}>
                  <div style={{ fontWeight:700, color:'var(--clr-green)' }}>Under &lt; 70%</div>
                  <div style={{ fontSize:'.8rem', color:'#065f46' }}>Normal workload. Teacher is under-utilized.</div>
                </div>
                <div style={{ padding:'1rem', borderRadius:'var(--r-lg)', background:'var(--clr-amber-l)', border:'1px solid #fcd34d' }}>
                  <div style={{ fontWeight:700, color:'var(--clr-amber)' }}>Moderate 70–90%</div>
                  <div style={{ fontSize:'.8rem', color:'#92400e' }}>Optimal. Teacher is well-utilized.</div>
                </div>
                <div style={{ padding:'1rem', borderRadius:'var(--r-lg)', background:'var(--clr-red-l)', border:'1px solid #fca5a5' }}>
                  <div style={{ fontWeight:700, color:'var(--clr-red)' }}>Overloaded &gt; 90%</div>
                  <div style={{ fontSize:'.8rem', color:'#991b1b' }}>Reduce assignments. Risk of burnout.</div>
                </div>
              </div>
            </div>
          )}

          {/* SUBSTITUTION RULES */}
          {tab==='sub_rules' && (
            <div className="card card-body anim-fade-in">
              <h3 style={{ marginBottom:'.5rem' }}>Substitution Priority Rules</h3>
              <p style={{ marginBottom:'1.5rem', fontSize:'.875rem' }}>Drag to reorder priority. The engine will follow this order when suggesting substitutes.</p>
              <div style={{ display:'flex', flexDirection:'column', gap:'.75rem', maxWidth:520 }}>
                {settings.substitutionPriority.map((ruleId, idx) => {
                  const rule = RULES.find(r=>r.id===ruleId);
                  return (
                    <div key={ruleId} style={{
                      display:'flex', alignItems:'center', gap:'.875rem',
                      padding:'1rem 1.25rem', borderRadius:'var(--r-lg)',
                      border:'1.5px solid var(--border)', background:idx===0?'var(--clr-primary-l)':idx===1?'var(--clr-amber-l)':'var(--bg-muted)',
                      borderColor: idx===0?'var(--clr-primary)':idx===1?'var(--clr-amber)':'var(--border)',
                    }}>
                      <div style={{ width:28,height:28,borderRadius:'50%',background:idx===0?'var(--clr-primary)':idx===1?'var(--clr-amber)':'var(--border)',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontWeight:700,fontSize:'.85rem',flexShrink:0 }}>
                        {idx+1}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:'.9rem' }}>{rule?.label}</div>
                        <div style={{ fontSize:'.78rem', color:'var(--tx-muted)', marginTop:'.15rem' }}>{rule?.desc}</div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'.25rem' }}>
                        {idx>0 && <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>moveRule(idx,idx-1)}>▲</button>}
                        {idx<settings.substitutionPriority.length-1 && <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>moveRule(idx,idx+1)}>▼</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
