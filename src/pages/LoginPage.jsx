import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: err } = await signIn(form.email.trim(), form.password);
      if (err) {
        if (err.message?.toLowerCase().includes('auth status') ||
            err.message?.toLowerCase().includes('network') ||
            err.message?.toLowerCase().includes('fetch')) {
          setError('Server is unavailable. It may be starting up — wait 30 seconds and try again.');
        } else {
          setError(err.message || 'Invalid email or password.');
        }
      }
    } catch (err) {
      setError('Connection failed. Please check your internet and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', background: 'linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#4338ca 100%)',
      alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      {/* Decorative blobs */}
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: '400px', height: '400px', background: 'rgba(99,102,241,.3)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-10%', left: '-5%', width: '500px', height: '500px', background: 'rgba(139,92,246,.2)', borderRadius: '50%', filter: 'blur(100px)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: '440px', position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 20, background: 'rgba(255,255,255,.1)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,.2)', fontSize: '2rem', marginBottom: '1rem' }}>
            🎓
          </div>
          <h1 style={{ color: 'white', fontSize: '2rem', fontWeight: 800 }}>EduTime</h1>
          <p style={{ color: '#a5b4fc', marginTop: '.25rem', fontSize: '.95rem' }}>Indian School Management Platform</p>
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(255,255,255,.08)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 20, padding: '2rem', boxShadow: '0 25px 50px rgba(0,0,0,.3)' }}>
          <h2 style={{ color: 'white', marginBottom: '1.5rem', fontSize: '1.25rem' }}>Sign in to your school</h2>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="field">
              <label style={{ color: '#c7d2fe' }}>Email</label>
              <input
                className="input" type="email" placeholder="you@school.edu"
                value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                style={{ background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.2)', color: 'white' }}
                required autoComplete="email"
              />
            </div>
            <div className="field">
              <label style={{ color: '#c7d2fe' }}>Password</label>
              <input
                className="input" type="password" placeholder="Password"
                value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                style={{ background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.2)', color: 'white' }}
                required autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="alert alert-danger" style={{ fontSize: '.85rem' }}>⚠️ {error}</div>
            )}
            <button className="btn btn-primary btn-lg" style={{ marginTop: '.5rem', width: '100%', fontSize: '1rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', border: 'none' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,.05)', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)' }}>
            <p style={{ color: '#a5b4fc', fontSize: '.8rem', marginBottom: '.5rem', fontWeight: 600 }}>🔒 Secure Login</p>
            <p style={{ color: '#c7d2fe', fontSize: '.78rem' }}>Contact your school administrator if you don't have an account or need to reset your password.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
