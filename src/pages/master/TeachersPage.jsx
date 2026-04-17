import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../store/AppStore';
import { Plus, Pencil, Trash2, Users, Search } from 'lucide-react';

const DEPTS = ['Science','Languages','Social Science','Mathematics','Arts','Sports','Technology'];
const ALL_DESIGNATIONS = ['PGT','TGT','PRT','PTI','Librarian','Counselor','Lab Technician'];

const EMPTY = { name:'', department:'', designation:'PGT', subjects:[], maxPeriods:30, phone:'', email:'', joining:'' };

export default function TeachersPage() {
  const { state, dispatch } = useApp();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | { teacher }
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState(null);

  const filtered = state.teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.department.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setForm(EMPTY); setModal('add'); };
  const openEdit = (t) => { setForm({ ...t, subjects: [...t.subjects] }); setModal(t); };

  const save = () => {
    if (!form.name.trim()) return;
    if (modal === 'add') {
      dispatch({ type:'ADD_TEACHER', payload: { ...form, id:`t_${Date.now()}`, maxPeriods:Number(form.maxPeriods) } });
    } else {
      dispatch({ type:'UPDATE_TEACHER', payload: { ...form, maxPeriods:Number(form.maxPeriods) } });
    }
    setModal(null);
  };

  const del = (id) => { dispatch({ type:'DELETE_TEACHER', payload: id }); setConfirmDel(null); };

  const toggleSubject = (subId) => {
    setForm(p => ({ ...p, subjects: p.subjects.includes(subId) ? p.subjects.filter(s=>s!==subId) : [...p.subjects, subId] }));
  };

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div><h2>Teachers</h2><p>Manage staff profiles and subject assignments</p></div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15}/> Add Teacher</button>
      </div>

      {/* Search */}
      <div className="card card-body" style={{ marginBottom:'1rem', display:'flex', gap:'.75rem', alignItems:'center' }}>
        <Search size={16} color="var(--tx-muted)"/>
        <input className="input" style={{ border:'none', boxShadow:'none', flex:1, padding:'0' }} placeholder="Search by name or department…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <span className="badge badge-indigo">{filtered.length} of {state.teachers.length}</span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Department</th><th>Designation</th><th>Subjects</th><th>Max Periods/wk</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(t => {
                const assigned = state.schedule.filter(s=>s.teacherId===t.id).length;
                const pct = Math.round((assigned/t.maxPeriods)*100);
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
                        <div style={{ width:36,height:36,borderRadius:10,background:`hsl(${t.id.charCodeAt(1)*37},70%,90%)`,color:`hsl(${t.id.charCodeAt(1)*37},60%,35%)`,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'.9rem',flexShrink:0 }}>{t.name[0]}</div>
                        <div>
                          <div style={{ fontWeight:600 }}>{t.name}</div>
                          <div style={{ fontSize:'.75rem', color:'var(--tx-muted)' }}>{t.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="badge badge-purple">{t.department}</span></td>
                    <td style={{ fontSize:'.875rem' }}>{t.designation}</td>
                    <td>
                      <div style={{ display:'flex', gap:'.25rem', flexWrap:'wrap' }}>
                        {t.subjects.map(sid => {
                          const sub = state.subjects.find(s=>s.id===sid);
                          return sub ? <span key={sid} className="badge badge-blue">{sub.code}</span> : null;
                        })}
                      </div>
                    </td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
                        <div style={{ flex:1, height:6, background:'var(--bg-muted)', borderRadius:3, minWidth:80 }}>
                          <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', borderRadius:3, background: pct>=90?'var(--clr-red)':pct>=70?'var(--clr-amber)':'var(--clr-green)' }}/>
                        </div>
                        <span style={{ fontSize:'.78rem', color:'var(--tx-muted)' }}>{assigned}/{t.maxPeriods}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:'.375rem' }}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>openEdit(t)}><Pencil size={14}/></button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setConfirmDel(t)}><Trash2 size={14} color="var(--clr-red)"/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal !== null && createPortal(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>{modal==='add'?'Add New Teacher':'Edit Teacher'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="grid-2" style={{ gap:'1rem' }}>
                <div className="field"><label>Full Name *</label><input className="input" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Ravi Sharma"/></div>
                <div className="field"><label>Department</label>
                  <select className="input" value={form.department} onChange={e=>setForm(p=>({...p,department:e.target.value}))}>
                    <option value="">— Select —</option>{DEPTS.map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="field"><label>Designation</label>
                  <select className="input" value={form.designation} onChange={e=>setForm(p=>({...p,designation:e.target.value}))}>
                    {ALL_DESIGNATIONS.map(d=><option key={d}>{d}</option>)}
                  </select>
                </div>
                <div className="field"><label>Max Periods/Week</label><input type="number" className="input" min={1} max={50} value={form.maxPeriods} onChange={e=>setForm(p=>({...p,maxPeriods:e.target.value}))}/></div>
                <div className="field"><label>Phone</label><input className="input" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="9876543210"/></div>
                <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="teacher@school.edu"/></div>
                <div className="field"><label>Date of Joining</label><input type="date" className="input" value={form.joining} onChange={e=>setForm(p=>({...p,joining:e.target.value}))}/></div>
              </div>
              <div className="divider"/>
              <div className="field">
                <label>Subject Qualifications</label>
                <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', marginTop:'.5rem' }}>
                  {state.subjects.map(sub => (
                    <button key={sub.id} type="button"
                      className={`badge ${form.subjects.includes(sub.id)?'badge-indigo':'badge-gray'}`}
                      style={{ cursor:'pointer', padding:'.35rem .75rem', fontSize:'.8rem' }}
                      onClick={()=>toggleSubject(sub.id)}
                    >
                      {sub.name} ({sub.code})
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>{modal==='add'?'Add Teacher':'Save Changes'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirm Delete */}
      {confirmDel && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:400 }}>
            <div className="modal-header"><h3>Delete Teacher?</h3></div>
            <div className="modal-body">
              <p>Are you sure you want to remove <strong>{confirmDel.name}</strong>? This will also remove all their timetable assignments.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={()=>del(confirmDel.id)}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
