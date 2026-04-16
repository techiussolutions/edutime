import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Users, UserPlus, Mail, Shield, CheckCircle2, XCircle, MoreVertical, Trash2, KeyRound } from 'lucide-react';

export default function UserManagementPage() {
  const { listUsers, createUser, updateUser, deleteUser, resetPassword, profile } = useAuth();
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Form modal
  const [showModal, setShowModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'teacher', active: true });

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error: err } = await listUsers();
    if (err) setError(err.message);
    else setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openAdd = () => {
    setEditingUserId(null);
    setForm({ name: '', email: '', role: 'teacher', active: true });
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditingUserId(user.id);
    setForm({ name: user.name, email: user.email || '', role: user.role, active: user.active });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (editingUserId) {
      // Update
      const { error: err } = await updateUser(editingUserId, { name: form.name, role: form.role, active: form.active });
      if (err) setError(err.message);
      else {
        setToast('User updated successfully');
        setShowModal(false);
        fetchUsers();
      }
    } else {
      // Create
      // Provide a default password for invitees, they should reset it via email
      const defaultPassword = Math.random().toString(36).slice(-8) + 'A1!'; 
      const { error: err } = await createUser({
        email: form.email,
        password: defaultPassword,
        name: form.name,
        role: form.role
      });
      if (err) setError(err.message);
      else {
        setToast(`User created. Temporary password: ${defaultPassword}`);
        setShowModal(false);
        fetchUsers();
      }
    }
  };

  const handleToggleActive = async (user) => {
    const { error: err } = await updateUser(user.id, { active: !user.active });
    if (!err) fetchUsers();
  };

  const handleDelete = async (user) => {
    if (user.id === profile.id) return alert('You cannot delete yourself.');
    if (confirm(`Are you sure you want to permanently delete ${user.name}?`)) {
      const { error: err } = await deleteUser(user.id);
      if (!err) fetchUsers();
      else alert(err.message);
    }
  };

  const handleResetPassword = async (user) => {
    if (!user.email && user.id !== profile.id) return alert('Email required for password reset.');
    // Since email isn't in user_profiles unless stored, we actually need to get it from auth.users,
    // which requires backend. For now, assume email is known or use the reset endpoint on the auth context if available.
    // Supposing we have the email:
    const emailToReset = prompt(`Enter email for ${user.name} to send reset link:`, user.name.toLowerCase().replace(' ','')+'@school.edu');
    if(emailToReset) {
      const { error: err } = await resetPassword(emailToReset);
      if(err) alert(err.message);
      else setToast(`Password reset email sent to ${emailToReset}`);
    }
  };

  return (
    <div className="anim-fade-up">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <Shield className="text-primary" /> User Management
          </h2>
          <p>Manage access, roles, and staff accounts for your school.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <UserPlus size={16} /> Add User
        </button>
      </div>

      {toast && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>✅ {toast}</span>
          <button onClick={() => setToast('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>⚠️ {error}</div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading users...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem', color: 'var(--tx-muted)', fontWeight: 600, fontSize: '.85rem' }}>Name</th>
                <th style={{ padding: '1rem', color: 'var(--tx-muted)', fontWeight: 600, fontSize: '.85rem' }}>Role</th>
                <th style={{ padding: '1rem', color: 'var(--tx-muted)', fontWeight: 600, fontSize: '.85rem' }}>Status</th>
                <th style={{ padding: '1rem', color: 'var(--tx-muted)', fontWeight: 600, fontSize: '.85rem' }}>Last Login</th>
                <th style={{ padding: '1rem', textAlign: 'right', color: 'var(--tx-muted)', fontWeight: 600, fontSize: '.85rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--tx-body)' }}>{u.name}</div>
                    <div style={{ fontSize: '.8rem', color: 'var(--tx-muted)' }}>{u.id}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span className={`badge ${u.role === 'admin' ? 'badge-indigo' : u.role === 'teacher' ? 'badge-gray' : ''}`}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {u.active ? (
                      <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12}/> Active</span>
                    ) : (
                      <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><XCircle size={12}/> Inactive</span>
                    )}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '.85rem', color: 'var(--tx-muted)' }}>
                    {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '.5rem' }}>
                       <button className="btn btn-ghost btn-sm" onClick={() => handleResetPassword(u)} title="Reset Password">
                        <KeyRound size={16} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Edit</button>
                      {u.id !== profile.id && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(u)} title={u.active ? 'Deactivate' : 'Activate'}>
                            {u.active ? <XCircle size={16} color="var(--clr-amber)" /> : <CheckCircle2 size={16} color="var(--clr-green)" />}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(u)} title="Delete">
                            <Trash2 size={16} color="var(--clr-red)" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--tx-muted)' }}>No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
        }}>
          <div className="card anim-fade-up" style={{ width: 440, padding: 0, overflow: 'hidden' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <h3 style={{ margin: 0 }}>{editingUserId ? 'Edit User' : 'Add New User'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="field">
                <label>Full Name</label>
                <input className="input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required autoFocus />
              </div>
              
              {!editingUserId && (
                <div className="field">
                  <label>Email Address</label>
                  <input className="input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
                  <small style={{ color: 'var(--tx-muted)' }}>They will use this to sign in.</small>
                </div>
              )}

              <div className="field">
                <label>Role</label>
                <select className="input" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                  <option value="admin">Administrator (Full Access)</option>
                  <option value="teacher">Teacher (View Timetable, Mark Absences)</option>
                  <option value="viewer">Viewer (Read-only)</option>
                </select>
              </div>

              {editingUserId && profile.id !== editingUserId && (
                <label className="toggle" style={{ marginTop: '.5rem', display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                  <input type="checkbox" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})} />
                  <span className="toggle-track"/>
                  <span style={{ fontWeight: 500 }}>Active Account</span>
                </label>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editingUserId ? 'Save Changes' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
