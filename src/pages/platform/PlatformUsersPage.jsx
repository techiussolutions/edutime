import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Users, UserPlus, Search, KeyRound, Edit2, Trash2,
  CheckCircle2, XCircle, Shield, School, PlusCircle, ChevronDown, ChevronUp
} from 'lucide-react';

const ROLE_BADGE = {
  super_admin: 'badge-purple',
  admin: 'badge-indigo',
  teacher: 'badge-gray',
  viewer: 'badge-blue',
};

const EMPTY_SCHOOL_FORM = {
  code: '', name: '', board: 'CBSE', academic_year: '2025-2026',
  address: '', logo: '🏫', subscription_tier: 'free', status: 'active'
};

export default function PlatformUsersPage() {
  const {
    listAllUsers, listAllSchools, createUser, updateUser,
    deleteUser, resetPassword, createTenantSchool, profile, ROLE_DEFAULTS
  } = useAuth();

  const [users, setUsers]     = useState([]);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [toast, setToast]     = useState('');
  const [error, setError]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showModal, setShowModal]         = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'admin',
    active: true, schoolId: ''
  });

  // Inline new school creation state
  const [showNewSchool, setShowNewSchool]   = useState(false);
  const [schoolForm, setSchoolForm]         = useState(EMPTY_SCHOOL_FORM);
  const [creatingSchool, setCreatingSchool] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: u }, { data: s }] = await Promise.all([listAllUsers(), listAllSchools()]);
    setUsers(u || []);
    setSchools(s || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 5000); };

  const openAdd = () => {
    setEditingUserId(null);
    setForm({ name: '', email: '', password: '', role: 'admin', active: true, schoolId: '' });
    setShowNewSchool(false);
    setSchoolForm(EMPTY_SCHOOL_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditingUserId(u.id);
    setForm({ name: u.name, email: '', password: '', role: u.role, active: u.active, schoolId: u.school_id || '' });
    setShowNewSchool(false);
    setError('');
    setShowModal(true);
  };

  const handleCreateSchool = async () => {
    if (!schoolForm.name || !schoolForm.code) {
      setError('School name and code are required.');
      return;
    }
    setCreatingSchool(true);
    setError('');
    try {
      const { data, error: err } = await createTenantSchool(schoolForm);
      if (err) { setError(err.message); return; }
      // Reload schools and auto-select the new one
      const { data: newSchools, error: loadErr } = await listAllSchools();
      if (loadErr) { setError(loadErr.message); return; }
      setSchools(newSchools || []);
      setForm(prev => ({ ...prev, schoolId: data.id }));
      setShowNewSchool(false);
      setSchoolForm(EMPTY_SCHOOL_FORM);
      showToast(`School "${data.name}" created and selected!`);
    } finally {
      setCreatingSchool(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    if (editingUserId) {
      const { error: err } = await updateUser(editingUserId, {
        name: form.name,
        role: form.role,
        active: form.active,
        school_id: form.schoolId || null,
        permissions: ROLE_DEFAULTS[form.role] || ROLE_DEFAULTS.viewer,
      });
      if (err) { setError(err.message); setSubmitting(false); return; }
      showToast('User updated successfully.');
    } else {
      const pwd = form.password || (Math.random().toString(36).slice(-8) + 'A1!');
      const { error: err } = await createUser({
        email: form.email, password: pwd, name: form.name,
        role: form.role, schoolId: form.schoolId || null,
      });
      if (err) { setError(err.message); setSubmitting(false); return; }
      showToast(`User created! Temp password: ${pwd}`);
    }

    setSubmitting(false);
    setShowModal(false);
    load();
  };

  const handleToggleActive = async (u) => {
    const { error: err } = await updateUser(u.id, { active: !u.active });
    if (err) { showToast(`Error: ${err.message}`); return; }
    load();
  };

  const handleDelete = async (u) => {
    if (u.id === profile.id) { setError('You cannot delete your own account.'); return; }
    if (!confirm(`Permanently delete ${u.name}? This cannot be undone.`)) return;
    const { error: err } = await deleteUser(u.id);
    if (err) { setError(err.message); return; }
    showToast(`${u.name} has been deleted.`);
    load();
  };

  const handleResetPassword = async (u) => {
    const email = prompt(`Enter the email address for ${u.name}:`);
    if (!email) return;
    const { error: err } = await resetPassword(email);
    if (err) { setError(err.message); return; }
    showToast(`Password reset email sent to ${email}`);
  };

  const filtered = users.filter(u => {
    const matchSearch = u.name?.toLowerCase().includes(search.toLowerCase());
    const matchSchool = filterSchool ? u.school_id === filterSchool : true;
    return matchSearch && matchSchool;
  });

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <Users size={22} className="text-primary" /> Global User Management
          </h2>
          <p>Manage all users across every school. Create, assign roles, update and reset passwords.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <UserPlus size={16} /> Add User
        </button>
      </div>

      {toast && (
        <div className="alert alert-success" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {toast}</span>
          <button onClick={() => setToast('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem' }}>✕</button>
        </div>
      )}
      {error && !showModal && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>⚠️ {error}</div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-muted)', pointerEvents: 'none' }} />
          <input
            className="input input-sm"
            style={{ paddingLeft: '2rem' }}
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input input-sm"
          style={{ flex: '0 0 auto', minWidth: 200 }}
          value={filterSchool}
          onChange={e => setFilterSchool(e.target.value)}
        >
          <option value="">All Schools</option>
          {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div style={{ color: 'var(--tx-muted)', fontSize: '.85rem', marginLeft: 'auto', flexShrink: 0 }}>
          {filtered.length} of {users.length} users
        </div>
      </div>

      <div className="card table-wrap">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading users…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>School</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '.85rem', fontWeight: 700, color: 'white', flexShrink: 0
                      }}>{u.name?.[0]?.toUpperCase() || '?'}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.name}</div>
                        <div style={{ fontSize: '.73rem', color: 'var(--tx-muted)', fontFamily: 'monospace' }}>{u.id.slice(0, 14)}…</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {u.schools ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }}>
                        <School size={13} style={{ color: 'var(--tx-muted)', flexShrink: 0 }} />
                        <span>{u.schools.name}</span>
                      </div>
                    ) : (
                      <span className="badge badge-purple" style={{ fontSize: '.72rem' }}>
                        <Shield size={10} /> Platform
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'}`}>{u.role}</span>
                  </td>
                  <td>
                    {u.active
                      ? <span className="badge badge-green"><CheckCircle2 size={11} /> Active</span>
                      : <span className="badge badge-red"><XCircle size={11} /> Inactive</span>
                    }
                  </td>
                  <td style={{ fontSize: '.8rem', color: 'var(--tx-muted)' }}>
                    {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleResetPassword(u)} title="Reset Password">
                        <KeyRound size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)} title="Edit">
                        <Edit2 size={14} />
                      </button>
                      {u.id !== profile.id && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(u)}
                            title={u.active ? 'Deactivate' : 'Activate'}>
                            {u.active
                              ? <XCircle size={14} color="var(--clr-amber)" />
                              : <CheckCircle2 size={14} color="var(--clr-green)" />
                            }
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(u)} title="Delete">
                            <Trash2 size={14} color="var(--clr-red)" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--tx-muted)' }}>
                  {search || filterSchool ? 'No users match your filters.' : 'No users found.'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add / Edit User Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>{editingUserId ? 'Edit User' : 'Create New User'}</h3>
                <p style={{ margin: '.125rem 0 0', fontSize: '.8rem' }}>
                  {editingUserId ? 'Update user details and school assignment.' : 'Fill in the details below to create a new platform user.'}
                </p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {error && (
                  <div className="alert alert-danger" style={{ fontSize: '.85rem' }}>⚠️ {error}</div>
                )}

                {/* Name */}
                <div className="field">
                  <label>Full Name <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                  <input className="input" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. John Smith"
                    required autoFocus />
                </div>

                {/* Email + Password (only on create) */}
                {!editingUserId && (
                  <div className="grid-2">
                    <div className="field">
                      <label>Email Address <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                      <input className="input" type="email" value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        placeholder="user@school.edu"
                        required />
                      <small>Used to sign in to the platform.</small>
                    </div>
                    <div className="field">
                      <label>Temporary Password</label>
                      <input className="input" type="text" value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        placeholder="Auto-generate if blank" />
                      <small>Share this with the user after creation.</small>
                    </div>
                  </div>
                )}

                {/* Role */}
                <div className="field">
                  <label>Role <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                  <select className="input" value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="super_admin">🛡️ Super Admin — Full platform control</option>
                    <option value="admin">🏫 School Admin — Full access within one school</option>
                    <option value="teacher">👨‍🏫 Teacher — View timetable and mark absences</option>
                    <option value="viewer">👁️ Viewer — Read-only access</option>
                  </select>
                </div>

                {/* School Assignment */}
                <div style={{
                  background: 'var(--bg-muted)', borderRadius: 10,
                  border: '1px solid var(--border)', overflow: 'hidden'
                }}>
                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Assign to School</span>
                        {!editingUserId && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '.78rem', gap: '.3rem', padding: '.25rem .5rem' }}
                            onClick={() => { setShowNewSchool(!showNewSchool); setError(''); }}
                          >
                            <PlusCircle size={13} />
                            {showNewSchool ? 'Cancel' : 'Add New School'}
                            {showNewSchool ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        )}
                      </label>
                      <select className="input" value={form.schoolId}
                        onChange={e => setForm({ ...form, schoolId: e.target.value })}>
                        <option value="">— Platform Level (no school) —</option>
                        {schools.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.logo} {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Inline New School Form */}
                  {showNewSchool && (
                    <div style={{
                      padding: '1rem',
                      borderTop: '1px dashed var(--border)',
                      background: 'var(--bg-card)',
                      display: 'flex', flexDirection: 'column', gap: '1rem'
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '.5rem',
                        color: 'var(--clr-primary)', fontWeight: 600, fontSize: '.875rem'
                      }}>
                        <School size={15} /> Create New School
                      </div>

                      <div className="grid-2">
                        <div className="field">
                          <label>School Name <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                          <input className="input" value={schoolForm.name}
                            onChange={e => setSchoolForm({ ...schoolForm, name: e.target.value })}
                            placeholder="St. Paul's School" />
                        </div>
                        <div className="field">
                          <label>Unique Code <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                          <input className="input" value={schoolForm.code}
                            onChange={e => setSchoolForm({ ...schoolForm, code: e.target.value.toUpperCase() })}
                            placeholder="SPS-2026" />
                        </div>
                      </div>

                      <div className="grid-2">
                        <div className="field">
                          <label>Board</label>
                          <input className="input" value={schoolForm.board}
                            onChange={e => setSchoolForm({ ...schoolForm, board: e.target.value })} />
                        </div>
                        <div className="field">
                          <label>Academic Year</label>
                          <input className="input" value={schoolForm.academic_year}
                            onChange={e => setSchoolForm({ ...schoolForm, academic_year: e.target.value })} />
                        </div>
                      </div>

                      <div className="grid-2">
                        <div className="field">
                          <label>Logo Emoji</label>
                          <input className="input" value={schoolForm.logo}
                            onChange={e => setSchoolForm({ ...schoolForm, logo: e.target.value })}
                            placeholder="🏫" />
                        </div>
                        <div className="field">
                          <label>Subscription</label>
                          <select className="input" value={schoolForm.subscription_tier}
                            onChange={e => setSchoolForm({ ...schoolForm, subscription_tier: e.target.value })}>
                            <option value="free">Free</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-success"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={handleCreateSchool}
                        disabled={creatingSchool}
                      >
                        {creatingSchool ? 'Creating…' : <><School size={14} /> Create & Select School</>}
                      </button>
                    </div>
                  )}
                </div>

                {/* Active toggle (edit only) */}
                {editingUserId && profile.id !== editingUserId && (
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '.75rem',
                    cursor: 'pointer', padding: '.75rem', background: 'var(--bg-muted)',
                    borderRadius: 8, border: '1px solid var(--border)'
                  }}>
                    <span className="toggle">
                      <input type="checkbox" checked={form.active}
                        onChange={e => setForm({ ...form, active: e.target.checked })} />
                      <span className="toggle-track" />
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '.9rem' }}>Active Account</div>
                      <div style={{ fontSize: '.8rem', color: 'var(--tx-muted)' }}>
                        Inactive users cannot log in.
                      </div>
                    </div>
                  </label>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : (editingUserId ? 'Save Changes' : 'Create User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
