import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { School, Plus, Edit2, ToggleLeft, ToggleRight, CheckCircle2, XCircle, Zap, Info } from 'lucide-react';

const DEFAULT_FEATURES = {
  timetable:      { label: 'Master Timetable',   desc: 'View and edit class timetables' },
  dailyTimetable: { label: 'Daily Timetable',    desc: "Today's scheduled periods view" },
  substitutions:  { label: 'Substitutions',      desc: 'Manage teacher absences & substitutions' },
  masterData:     { label: 'Master Data',         desc: 'Manage teachers, classes and subjects' },
  wizard:         { label: 'Timetable Wizard',    desc: 'Auto-generate timetables with AI assist' },
  reports:        { label: 'Reports & Analytics', desc: 'Advanced reporting (Pro+ feature)' },
};

const TIER_BADGE = {
  free:       'badge-gray',
  pro:        'badge-indigo',
  enterprise: 'badge-purple',
};

const BLANK_FORM = {
  code: '', name: '', board: 'CBSE', academic_year: '2025-2026',
  address: '', logo: '🏫', subscription_tier: 'free', status: 'active'
};

export default function SchoolsManagementPage() {
  const { listAllSchools, createTenantSchool, updateSchool } = useAuth();

  const [schools, setSchools]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [toast, setToast]                   = useState('');
  const [error, setError]                   = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [activeTab, setActiveTab]           = useState('details');
  const [actionLoading, setActionLoading]   = useState(''); // key of feature or 'status'

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]           = useState(BLANK_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await listAllSchools();
    if (err) setError(err.message);
    else {
      setSchools(data || []);
      // Refresh selected school if still exists
      if (selectedSchool) {
        const refreshed = (data || []).find(s => s.id === selectedSchool.id);
        setSelectedSchool(refreshed || null);
      }
    }
    setLoading(false);
  }, [selectedSchool]);

  useEffect(() => { load(); }, []); // initial load only

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const openCreate = () => {
    setIsEditing(false);
    setEditTarget(null);
    setForm(BLANK_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (school, e) => {
    e?.stopPropagation();
    setIsEditing(true);
    setEditTarget(school);
    setForm({
      code: school.code,
      name: school.name,
      board: school.board,
      academic_year: school.academic_year,
      address: school.address || '',
      logo: school.logo,
      subscription_tier: school.subscription_tier || 'free',
      status: school.status || 'active',
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    if (isEditing && editTarget) {
      const { error: err } = await updateSchool(editTarget.id, form);
      if (err) { setError(err.message); setSubmitting(false); return; }
      showToast('School updated successfully.');
      // Update selected school panel if it was the one being edited
      if (selectedSchool?.id === editTarget.id) {
        setSelectedSchool({ ...editTarget, ...form });
      }
    } else {
      const { data, error: err } = await createTenantSchool(form);
      if (err) { setError(err.message); setSubmitting(false); return; }
      showToast(`School "${data.name}" provisioned!`);
    }

    setSubmitting(false);
    setShowModal(false);

    // Reload list
    const { data: fresh } = await listAllSchools();
    setSchools(fresh || []);
  };

  const toggleFeature = async (featureKey) => {
    if (!selectedSchool || actionLoading) return;
    setActionLoading(featureKey);
    setError('');
    try {
      const current = selectedSchool.features?.[featureKey] ?? true;
      const newFeatures = { ...(selectedSchool.features || {}), [featureKey]: !current };
      const { error: err } = await updateSchool(selectedSchool.id, { features: newFeatures });
      if (err) { setError(err.message); return; }
      const updated = { ...selectedSchool, features: newFeatures };
      setSelectedSchool(updated);
      setSchools(prev => prev.map(s => s.id === selectedSchool.id ? updated : s));
      showToast(`${DEFAULT_FEATURES[featureKey].label} ${!current ? 'enabled' : 'disabled'}.`);
    } finally {
      setActionLoading('');
    }
  };

  const toggleStatus = async (school, e) => {
    e?.stopPropagation();
    if (actionLoading) return;
    setActionLoading('status_' + school.id);
    setError('');
    try {
      const newStatus = school.status === 'active' ? 'suspended' : 'active';
      const { error: err } = await updateSchool(school.id, { status: newStatus });
      if (err) { setError(err.message); return; }
      showToast(`School ${newStatus === 'active' ? 'reactivated' : 'suspended'}.`);
      setSchools(prev => prev.map(s => s.id === school.id ? { ...s, status: newStatus } : s));
      if (selectedSchool?.id === school.id) setSelectedSchool(prev => ({ ...prev, status: newStatus }));
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="anim-fade-up">
      <div className="page-header">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <School size={22} className="text-primary" /> School Management
          </h2>
          <p>Add new schools, manage subscriptions, and control feature access per school.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Add School
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

      {/* Two-panel layout */}
      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>

        {/* School Table */}
        <div className="card table-wrap" style={{ flex: 1, minWidth: 0, transition: 'all .3s ease' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading schools…</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>School</th>
                  <th>Code</th>
                  <th>Board / Year</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schools.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => {
                      setSelectedSchool(selectedSchool?.id === s.id ? null : s);
                      setActiveTab('details');
                    }}
                    style={{
                      cursor: 'pointer',
                      background: selectedSchool?.id === s.id ? 'var(--clr-primary-l)' : '',
                      borderLeft: selectedSchool?.id === s.id ? '3px solid var(--clr-primary)' : '3px solid transparent',
                    }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                        <span style={{
                          fontSize: '1.25rem', width: 36, height: 36, borderRadius: 8,
                          background: selectedSchool?.id === s.id ? 'white' : 'var(--bg-muted)',
                          display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'center', flexShrink: 0,
                          boxShadow: selectedSchool?.id === s.id ? 'var(--sh-sm)' : 'none',
                        }}>{s.logo}</span>
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.name}</div>
                          <div style={{ fontSize: '.74rem', color: 'var(--tx-muted)' }}>{s.address || 'No address'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '.85rem', fontWeight: 600 }}>{s.code}</td>
                    <td style={{ fontSize: '.85rem' }}>
                      {s.board}
                      <span style={{ color: 'var(--tx-muted)', marginLeft: 4 }}>· {s.academic_year}</span>
                    </td>
                    <td>
                      <span className={`badge ${TIER_BADGE[s.subscription_tier] || 'badge-gray'}`}>
                        {s.subscription_tier}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${
                        s.status === 'active' ? 'badge-green' :
                        s.status === 'suspended' ? 'badge-red' : 'badge-amber'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '.35rem' }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => openEdit(s, e)} title="Edit School">
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => toggleStatus(s, e)}
                          title={s.status === 'active' ? 'Suspend School' : 'Reactivate School'}
                        >
                          {s.status === 'active'
                            ? <XCircle size={14} color="var(--clr-amber)" />
                            : <CheckCircle2 size={14} color="var(--clr-green)" />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {schools.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--tx-muted)' }}>
                    No schools yet. Click "Add School" to get started.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Side Panel */}
        {selectedSchool && (
          <div className="card anim-fade-up" style={{ flex: '0 0 340px', overflow: 'hidden' }}>
            {/* Panel Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                <span style={{ fontSize: '1.6rem' }}>{selectedSchool.logo}</span>
                <div>
                  <div style={{ fontWeight: 700, color: 'white', fontSize: '.95rem' }}>{selectedSchool.name}</div>
                  <div style={{ fontSize: '.75rem', color: '#a5b4fc', marginTop: 2 }}>{selectedSchool.code}</div>
                </div>
              </div>
              <button
                style={{ background: 'rgba(255,255,255,.15)', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 8px', color: 'white', fontSize: '.8rem' }}
                onClick={() => setSelectedSchool(null)}
              >✕</button>
            </div>

            {/* Tabs */}
            <div className="tabs" style={{ padding: '0 1rem', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
              <button className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
                onClick={() => setActiveTab('details')}>
                <Info size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Details
              </button>
              <button className={`tab-btn ${activeTab === 'features' ? 'active' : ''}`}
                onClick={() => setActiveTab('features')}>
                <Zap size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Features
              </button>
            </div>

            {activeTab === 'details' && (
              <div style={{ padding: '1.25rem 1.5rem' }}>
                {[
                  ['Board', selectedSchool.board],
                  ['Academic Year', selectedSchool.academic_year],
                  ['Plan', selectedSchool.subscription_tier],
                  ['Status', selectedSchool.status],
                  ['Address', selectedSchool.address || '—'],
                  ['School ID', selectedSchool.id],
                ].map(([label, val]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '.625rem 0', borderBottom: '1px solid var(--border)', fontSize: '.875rem', gap: '1rem'
                  }}>
                    <span style={{ color: 'var(--tx-muted)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
                    <span style={{
                      color: 'var(--tx-main)', textAlign: 'right',
                      fontFamily: label === 'School ID' ? 'monospace' : 'inherit',
                      fontSize: label === 'School ID' ? '.72rem' : 'inherit',
                      wordBreak: 'break-all'
                    }}>{val}</span>
                  </div>
                ))}
                <button
                  className="btn btn-outline"
                  style={{ marginTop: '1rem', width: '100%' }}
                  onClick={() => openEdit(selectedSchool)}
                >
                  <Edit2 size={14} /> Edit School
                </button>
              </div>
            )}

            {activeTab === 'features' && (
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <p style={{ fontSize: '.8rem', color: 'var(--tx-muted)', marginBottom: '1rem' }}>
                  Toggle which modules this school has access to. Changes apply immediately.
                </p>
                {Object.entries(DEFAULT_FEATURES).map(([key, { label, desc }]) => {
                  const enabled = selectedSchool.features?.[key] ?? true;
                  return (
                    <div key={key} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '.75rem', borderRadius: 8, marginBottom: '.5rem',
                      background: enabled ? 'var(--clr-green-l)' : 'var(--bg-muted)',
                      border: `1px solid ${enabled ? '#6ee7b7' : 'var(--border)'}`,
                      transition: 'all .2s',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '.85rem', color: 'var(--tx-main)' }}>{label}</div>
                        <div style={{ fontSize: '.73rem', color: 'var(--tx-muted)', marginTop: 1 }}>{desc}</div>
                      </div>
                      <button
                        onClick={() => toggleFeature(key)}
                        style={{
                          background: 'none', border: 'none', flexShrink: 0,
                          cursor: actionLoading === key ? 'wait' : 'pointer',
                          padding: '2px 4px', display: 'flex', alignItems: 'center', marginLeft: '1rem',
                          opacity: actionLoading && actionLoading !== key ? 0.4 : 1,
                        }}
                        disabled={!!actionLoading}
                        title={enabled ? 'Disable feature' : 'Enable feature'}
                      >
                        {actionLoading === key ? (
                          <span style={{ fontSize: '.7rem', color: 'var(--tx-muted)' }}>…</span>
                        ) : enabled
                          ? <ToggleRight size={30} color="var(--clr-green)" />
                          : <ToggleLeft size={30} color="var(--tx-muted)" />
                        }
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add / Edit School Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>{isEditing ? `Edit School` : 'Add New School'}</h3>
                <p style={{ margin: '.125rem 0 0', fontSize: '.8rem' }}>
                  {isEditing ? `Updating details for ${editTarget?.name}` : 'Register a new school on the platform.'}
                </p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                {error && (
                  <div className="alert alert-danger" style={{ fontSize: '.85rem' }}>⚠️ {error}</div>
                )}

                <div className="field">
                  <label>School Name <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                  <input className="input" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. St. Paul's Senior Secondary School"
                    required autoFocus />
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>Unique Code <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                    <input className="input" value={form.code}
                      onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="e.g. SPS-DELHI"
                      required />
                    <small>Used as a short identifier. Cannot be changed later.</small>
                  </div>
                  <div className="field">
                    <label>Logo / Emoji</label>
                    <input className="input" value={form.logo}
                      onChange={e => setForm({ ...form, logo: e.target.value })}
                      placeholder="🏫" />
                  </div>
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>Board <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                    <input className="input" value={form.board}
                      onChange={e => setForm({ ...form, board: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label>Academic Year <span style={{ color: 'var(--clr-red)' }}>*</span></label>
                    <input className="input" value={form.academic_year}
                      onChange={e => setForm({ ...form, academic_year: e.target.value })} required />
                  </div>
                </div>

                <div className="field">
                  <label>Address</label>
                  <input className="input" value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                    placeholder="School address (optional)" />
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>Subscription Plan</label>
                    <select className="input" value={form.subscription_tier}
                      onChange={e => setForm({ ...form, subscription_tier: e.target.value })}>
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select className="input" value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="trial">Trial</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : (isEditing ? 'Save Changes' : 'Add School')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
