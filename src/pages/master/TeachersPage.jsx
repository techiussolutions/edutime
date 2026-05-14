import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../store/AppStore';
import { Plus, Pencil, Trash2, Users, Search, Download, Upload, X } from 'lucide-react';

const DEPTS = ['Science','Languages','Social Science','Mathematics','Arts','Sports','Technology'];
const ALL_DESIGNATIONS = ['PGT','TGT','PRT','PTI','Librarian','Counselor','Lab Technician'];

const EMPTY = { name:'', department:'', designation:'PGT', subjects:[], maxPeriods:30, phone:'', email:'', joining:'' };

export default function TeachersPage() {
  const { state, dispatch } = useApp();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | { teacher }
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [importData, setImportData] = useState([]);    // parsed rows
  const [importErrors, setImportErrors] = useState({}); // { rowIdx: string }
  const [importDrag, setImportDrag] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importDone, setImportDone] = useState(false);
  const fileInputRef = useRef(null);

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

  const downloadTemplate = () => {
    const header = 'Name,Department,Designation,MaxPeriods,Phone,Email,Joining,Subjects';
    const example = 'Ravi Sharma,Science,PGT,30,9876543210,ravi@school.edu,2020-06-01,PHY;CHE';
    const example2 = 'Priya Nair,Mathematics,TGT,28,9123456780,priya@school.edu,2021-08-15,MTH';
    const blob = new Blob([header + '\n' + example + '\n' + example2 + '\n'], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'teachers_template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const parseAndSetFile = (file) => {
    if (!file || !file.name.endsWith('.csv')) return;
    setImportFileName(file.name);
    setImportDone(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { setImportData([]); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = lines.slice(1).map(line => {
        const cols = [];
        let cur = '', inQ = false;
        for (const ch of line) {
          if (ch === '"') inQ = !inQ;
          else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
          else cur += ch;
        }
        cols.push(cur.trim());
        const obj = {};
        headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
        return obj;
      });
      const errs = {};
      rows.forEach((r, i) => { if (!r.name?.trim()) errs[i] = 'Name required'; });
      setImportData(rows);
      setImportErrors(errs);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e) => parseAndSetFile(e.target.files[0]);

  const resolveSubjectIds = (codesStr) => {
    if (!codesStr) return [];
    return codesStr.split(';').map(c => c.trim().toUpperCase()).filter(Boolean)
      .map(code => state.subjects.find(s => s.code.toUpperCase() === code))
      .filter(Boolean).map(s => s.id);
  };

  const confirmImport = () => {
    const valid = importData.filter((_, i) => !importErrors[i]);
    valid.forEach((r, idx) => dispatch({
      type: 'ADD_TEACHER',
      payload: {
        id: `t_csv_${Date.now()}_${idx}`,
        name: r.name?.trim() || '',
        department: r.department?.trim() || '',
        designation: r.designation?.trim() || 'PGT',
        maxPeriods: Number(r.maxperiods || r.maxPeriods || 30),
        phone: r.phone?.trim() || '',
        email: r.email?.trim() || '',
        joining: r.joining?.trim() || '',
        subjects: resolveSubjectIds(r.subjects),
        active: true,
      },
    }));
    setImportDone(true);
  };

  const closeImportModal = () => {
    setImportModal(false);
    setImportData([]);
    setImportErrors({});
    setImportFileName('');
    setImportDone(false);
    setImportDrag(false);
  };

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div><h2>Teachers</h2><p>Manage staff profiles and subject assignments</p></div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => setImportModal(true)}><Upload size={15}/> Import CSV</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15}/> Add Teacher</button>
        </div>
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

      {/* Import Modal */}
      {importModal && createPortal(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&closeImportModal()}>
          <div className="modal modal-lg" style={{ maxWidth:760 }}>
            <div className="modal-header">
              <div>
                <h3>Import Teachers from CSV</h3>
                <p style={{ fontSize:'.8rem', color:'var(--tx-muted)', marginTop:'.15rem' }}>Bulk-add teachers by uploading a CSV file. Download the template to see the required format.</p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={closeImportModal}><X size={18}/></button>
            </div>

            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

              {/* Template banner */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--bg-muted)', borderRadius:10, padding:'.75rem 1rem', border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'.6rem' }}>
                  <Download size={18} color="var(--clr-indigo,#6366f1)"/>
                  <div>
                    <div style={{ fontWeight:600, fontSize:'.875rem' }}>teachers_template.csv</div>
                    <div style={{ fontSize:'.75rem', color:'var(--tx-muted)' }}>Columns: Name, Department, Designation, MaxPeriods, Phone, Email, Joining, Subjects (semicolon-separated codes)</div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={downloadTemplate} style={{ display:'flex', alignItems:'center', gap:'.4rem', whiteSpace:'nowrap' }}>
                  <Download size={13}/> Download Template
                </button>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e=>{ e.preventDefault(); setImportDrag(true); }}
                onDragLeave={()=>setImportDrag(false)}
                onDrop={e=>{ e.preventDefault(); setImportDrag(false); parseAndSetFile(e.dataTransfer.files[0]); }}
                onClick={()=>{ if(!importDone) fileInputRef.current?.click(); }}
                style={{
                  border:`2px dashed ${importDrag?'var(--clr-indigo,#6366f1)':'var(--border)'}`,
                  borderRadius:12, padding:'1.75rem', textAlign:'center',
                  cursor: importDone?'default':'pointer',
                  background: importDrag?'color-mix(in srgb,var(--clr-indigo,#6366f1) 8%,transparent)':'var(--bg-card)',
                  transition:'all .2s',
                }}
              >
                <input id="csv-file-input" type="file" accept=".csv" ref={fileInputRef} style={{ display:'none' }}
                  onChange={e=>{ handleFileUpload(e); e.target.value=''; }}/>
                {importFileName ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'.35rem' }}>
                    <Upload size={26} color="var(--clr-green,#22c55e)"/>
                    <div style={{ fontWeight:600 }}>{importFileName}</div>
                    <div style={{ fontSize:'.8rem', color:'var(--tx-muted)' }}>{importData.length} row(s) · {importData.filter((_,i)=>!importErrors[i]).length} valid</div>
                    {!importDone && <button className="btn btn-ghost btn-sm" style={{ marginTop:'.2rem' }} onClick={e=>{e.stopPropagation();setImportFileName('');setImportData([]);setImportErrors({});}}>Choose different file</button>}
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'.4rem', pointerEvents:'none' }}>
                    <Upload size={30} color="var(--tx-muted)"/>
                    <div style={{ fontWeight:600, fontSize:'.95rem' }}>Drop your CSV here</div>
                    <div style={{ fontSize:'.8rem', color:'var(--tx-muted)' }}>or click to browse</div>
                  </div>
                )}
              </div>

              {/* Preview table */}
              {importData.length > 0 && (
                <div>
                  <div style={{ fontWeight:600, fontSize:'.875rem', marginBottom:'.5rem', display:'flex', alignItems:'center', gap:'.5rem' }}>
                    Preview
                    {Object.keys(importErrors).length > 0 && <span className="badge badge-red">{Object.keys(importErrors).length} error(s)</span>}
                  </div>
                  <div className="table-wrap" style={{ maxHeight:240, overflowY:'auto', borderRadius:8, border:'1px solid var(--border)' }}>
                    <table style={{ fontSize:'.8rem' }}>
                      <thead><tr><th>#</th><th>Name</th><th>Department</th><th>Designation</th><th>Max Pd</th><th>Email</th><th>Subjects</th><th>Status</th></tr></thead>
                      <tbody>
                        {importData.map((r,i) => (
                          <tr key={i} style={{ background: importErrors[i]?'color-mix(in srgb,var(--clr-red,#ef4444) 8%,transparent)':undefined }}>
                            <td style={{ color:'var(--tx-muted)' }}>{i+1}</td>
                            <td style={{ fontWeight:600 }}>{r.name||<em style={{color:'var(--clr-red,#ef4444)'}}>missing</em>}</td>
                            <td>{r.department||'—'}</td>
                            <td>{r.designation||'—'}</td>
                            <td>{r.maxperiods||r.maxPeriods||'30'}</td>
                            <td style={{ color:'var(--tx-muted)',fontSize:'.75rem' }}>{r.email||'—'}</td>
                            <td>{r.subjects ? r.subjects.split(';').map(c=>c.trim()).filter(Boolean).map(c=><span key={c} className="badge badge-blue" style={{fontSize:'.7rem',marginRight:2}}>{c}</span>) : '—'}</td>
                            <td>{importErrors[i] ? <span className="badge badge-red" style={{fontSize:'.72rem'}}>{importErrors[i]}</span> : <span className="badge badge-green" style={{fontSize:'.72rem'}}>✓ OK</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Success banner */}
              {importDone && (
                <div style={{ display:'flex', alignItems:'center', gap:'.6rem', padding:'.75rem 1rem', borderRadius:10, background:'color-mix(in srgb,var(--clr-green,#22c55e) 12%,transparent)', border:'1px solid color-mix(in srgb,var(--clr-green,#22c55e) 30%,transparent)', color:'var(--clr-green,#22c55e)', fontWeight:600, fontSize:'.875rem' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {importData.filter((_,i)=>!importErrors[i]).length} teacher(s) imported successfully!
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeImportModal}>{importDone?'Close':'Cancel'}</button>
              {!importDone && (
                <button className="btn btn-primary"
                  disabled={importData.filter((_,i)=>!importErrors[i]).length===0}
                  style={{ opacity: importData.filter((_,i)=>!importErrors[i]).length===0?.5:1 }}
                  onClick={confirmImport}>
                  Import {importData.filter((_,i)=>!importErrors[i]).length} Teacher{importData.filter((_,i)=>!importErrors[i]).length!==1?'s':''}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

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
