import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../store/AppStore';
import { Plus, Pencil, Trash2, BookOpen, Users } from 'lucide-react';

const EMPTY = { name:'', code:'', applicableClasses:[], concurrent: false };

export default function SubjectsPage() {
  const { state, dispatch } = useApp();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState(null);

  const openAdd = () => { setForm({ ...EMPTY, applicableClasses:[] }); setModal('add'); };
  const openEdit = (s) => { setForm({ ...s, applicableClasses: s.applicableClasses ? [...s.applicableClasses] : [] }); setModal(s); };

  const save = () => {
    if (!form.name.trim()) return;
    if (modal==='add') {
      dispatch({ type:'ADD_SUBJECT', payload: { ...form, id:`sub_${Date.now()}` } });
    } else {
      dispatch({ type:'UPDATE_SUBJECT', payload: form });
    }
    setModal(null);
  };

  const toggleClass = (cId) => {
    setForm(p => ({ ...p, applicableClasses: p.applicableClasses.includes(cId) ? p.applicableClasses.filter(x=>x!==cId) : [...p.applicableClasses, cId] }));
  };

  // Sort classes for display in modal
  const sortedClasses = [...state.classes].sort((a, b) => {
    const ga = parseInt(a.grade, 10) || 0;
    const gb = parseInt(b.grade, 10) || 0;
    if (ga !== gb) return ga - gb;
    return (a.section || '').localeCompare(b.section || '');
  });

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div><h2>Subjects</h2><p>Manage subjects and assign them to specific classes</p></div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15}/> Add Subject</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'1rem' }}>
        {state.subjects.map((sub, i) => {
          const COLOR_PAIRS = [['#eef2ff','#4f46e5'],['#ecfdf5','#059669'],['#fffbeb','#d97706'],['#fef2f2','#dc2626'],['#f5f3ff','#7c3aed'],['#eff6ff','#2563eb'],['#fdf4ff','#a21caf'],['#fff7ed','#ea580c']];
          const [bg, fg] = COLOR_PAIRS[i % COLOR_PAIRS.length];
          return (
            <div key={sub.id} className="card" style={{ padding:'1.25rem' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'.75rem' }}>
                <div style={{ width:40, height:40, borderRadius:12, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', fontWeight:800, color:fg }}>
                  {sub.code.slice(0,2)}
                </div>
                <div style={{ display:'flex', gap:'.25rem' }}>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>openEdit(sub)}><Pencil size={13}/></button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setConfirmDel(sub)}><Trash2 size={13} color="var(--clr-red)"/></button>
                </div>
              </div>
              <h4 style={{ marginBottom:'.25rem' }}>{sub.name}</h4>
              <div style={{ fontSize:'.78rem', color:'var(--tx-muted)', marginBottom:'.5rem' }}>Code: {sub.code}</div>
              {sub.concurrent && (
                <div style={{ display:'flex', alignItems:'center', gap:'.3rem', fontSize:'.72rem',
                  color:'#7c3aed', background:'#f5f3ff', border:'1px solid #c4b5fd',
                  borderRadius:'var(--r-md)', padding:'.2rem .5rem', marginBottom:'.5rem', width:'fit-content' }}>
                  <Users size={10}/> Concurrent
                </div>
              )}
              <div style={{ display:'flex', gap:'.25rem', flexWrap:'wrap' }}>
                {(() => {
                  const knownClasses = (sub.applicableClasses || [])
                    .map(cid => state.classes.find(c => c.id === cid))
                    .filter(Boolean);
                  return knownClasses.length > 0
                    ? knownClasses.map(cls => (
                        <span key={cls.id} className="badge badge-gray" style={{ fontSize:'.7rem' }}>{cls.name}</span>
                      ))
                    : <span className="badge badge-gray" style={{ fontSize:'.7rem', fontStyle: 'italic' }}>No classes assigned</span>;
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {modal !== null && createPortal(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{modal==='add'?'Add Subject':'Edit Subject'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div className="grid-2">
                <div className="field"><label>Subject Name *</label><input className="input" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Mathematics"/></div>
                <div className="field"><label>Subject Code *</label><input className="input" value={form.code} onChange={e=>setForm(p=>({...p,code:e.target.value.toUpperCase()}))} placeholder="e.g. MATH" maxLength={6}/></div>
              </div>
              <div className="field">
                <label style={{ display:'flex', alignItems:'center', gap:'.5rem', cursor:'pointer', userSelect:'none' }}>
                  <input type="checkbox" checked={!!form.concurrent}
                    onChange={e => setForm(p => ({ ...p, concurrent: e.target.checked }))}/>
                  <span>Concurrent subject</span>
                </label>
                <p style={{ fontSize:'.75rem', color:'var(--tx-muted)', marginTop:'.25rem' }}>
                  When enabled, this subject can be assigned to multiple classes at the same period without causing a teacher clash
                  (e.g. Assembly, Morning Prayer, PE where all classes participate simultaneously).
                </p>
              </div>
              <div className="field">
                <label>Applicable Classes</label>
                {sortedClasses.length === 0 ? (
                  <div style={{ fontSize: '.8rem', color: 'var(--tx-muted)' }}>No classes available. Please add classes first.</div>
                ) : (
                  <div style={{ display:'flex', gap:'.5rem', flexWrap:'wrap', marginTop:'.35rem' }}>
                    {sortedClasses.map(c => (
                      <button key={c.id} type="button"
                        className={`btn btn-sm ${(form.applicableClasses || []).includes(c.id) ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding:'.35rem .85rem', fontSize:'.8rem', fontWeight:600, borderRadius:'var(--r-md)', minWidth:'60px', textAlign:'center' }}
                        onClick={()=>toggleClass(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>{modal==='add'?'Add Subject':'Save'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmDel && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth:380 }}>
            <div className="modal-header"><h3>Delete Subject?</h3></div>
            <div className="modal-body"><p>Remove <strong>{confirmDel.name}</strong>? This won't remove it from existing timetable slots but teachers won't be linked to it.</p></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={()=>{dispatch({type:'DELETE_SUBJECT',payload:confirmDel.id});setConfirmDel(null);}}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
