import React, { useState, useEffect } from 'react';
import { BookOpen, Lock, AlertCircle, Database, Eye, EyeOff, CheckCircle, Loader, RefreshCw } from 'lucide-react';
import { getUsers, loginWithPin, getLockoutStatus } from '../services/authService';
import {
  getSettings, saveSettings, resetSupabaseClient, testSupabaseConnection
} from '../services/supabaseService';

const DEFAULT_FALLBACK_USER = {
  id: 'admin-001',
  name: 'Admin',
  username: 'admin',
  role: 'admin',
  active: true
};

// ─── First-time Setup Step ─────────────────────────────────────────────────────
function SetupStep({ onSetupComplete }) {
  const saved = getSettings();
  const [url,  setUrl]  = useState(saved.supabase_url  || '');
  const [key,  setKey]  = useState(saved.supabase_anon_key || '');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus]   = useState('idle'); // idle | loading | ok | error
  const [msg,    setMsg]      = useState('');

  const handleConnect = async () => {
    if (!url.trim() || !key.trim()) {
      setStatus('error');
      setMsg('Please enter both Supabase URL and Anon Key.');
      return;
    }

    setStatus('loading');
    setMsg('');

    // Temporarily save so the client can be built and tested
    const current = getSettings();
    saveSettings({ ...current, supabase_url: url.trim(), supabase_anon_key: key.trim() });
    resetSupabaseClient();

    const result = await testSupabaseConnection();
    if (result.ok) {
      setStatus('ok');
      setMsg('Connected! Loading your staff…');
      setTimeout(() => onSetupComplete(), 800);
    } else {
      // Revert bad credentials
      saveSettings({ ...current, supabase_url: '', supabase_anon_key: '' });
      resetSupabaseClient();
      setStatus('error');
      setMsg(result.error || 'Connection failed. Check your URL and Anon Key.');
    }
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-lg)',
      padding: '1.5rem',
      width: '100%',
      maxWidth: '340px',
      boxShadow: 'var(--shadow-lg)',
      zIndex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          <Database size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Connect to Database</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>One-time setup for this device</div>
        </div>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
        Enter your Supabase credentials to load staff accounts and products.
        Find them in <strong>Supabase → Project Settings → API</strong>.
      </p>

      {/* URL */}
      <div>
        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
          Project URL
        </label>
        <input
          type="url"
          className="form-control"
          placeholder="https://xxxx.supabase.co"
          value={url}
          onChange={e => { setUrl(e.target.value); setStatus('idle'); setMsg(''); }}
          style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      {/* Anon Key */}
      <div>
        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
          Anon / Public Key
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            className="form-control"
            placeholder="eyJhbGciOi..."
            value={key}
            onChange={e => { setKey(e.target.value); setStatus('idle'); setMsg(''); }}
            style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', paddingRight: '2.5rem' }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey(s => !s)}
            style={{
              position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)',
              padding: '4px', display: 'flex'
            }}
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      {/* Status Message */}
      {msg && (
        <div style={{
          padding: '0.6rem 0.75rem',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.78rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: status === 'ok'    ? 'var(--accent-emerald-light)' :
                      status === 'error' ? 'var(--accent-rose-light)'    : 'var(--bg-surface-elevated)',
          border: `1px solid ${
            status === 'ok'    ? 'var(--accent-emerald)' :
            status === 'error' ? 'var(--accent-rose)'    : 'var(--border-light)'
          }`,
          color: status === 'ok'    ? 'var(--accent-emerald)' :
                 status === 'error' ? 'var(--accent-rose)'    : 'var(--text-muted)'
        }}>
          {status === 'ok'      && <CheckCircle size={14} />}
          {status === 'error'   && <AlertCircle size={14} />}
          {msg}
        </div>
      )}

      {/* Connect Button */}
      <button
        type="button"
        className="btn-primary"
        onClick={handleConnect}
        disabled={status === 'loading' || status === 'ok'}
        style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', display: 'flex', alignItems: 'center' }}
      >
        {status === 'loading' ? (
          <>
            <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
            Testing Connection…
          </>
        ) : status === 'ok' ? (
          <><CheckCircle size={16} /> Connected!</>
        ) : (
          <><Database size={16} /> Connect & Load Staff</>
        )}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main Login Screen ─────────────────────────────────────────────────────────
export default function LoginScreen({ onLogin }) {
  const [step, setStep]                     = useState('check');   // 'check' | 'setup' | 'login'
  const [users, setUsers]                   = useState([DEFAULT_FALLBACK_USER]);
  const [selectedUser, setSelectedUser]     = useState(null);
  const [pin, setPin]                       = useState('');
  const [error, setError]                   = useState('');
  const [isShaking, setIsShaking]           = useState(false);
  const [lockRemaining, setLockRemaining]   = useState(0);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // ── Determine initial step ────────────────────────────────────────────────
  useEffect(() => {
    // Check if opened via QR setup link: #setup=BASE64
    const hash = window.location.hash;
    if (hash.startsWith('#setup=')) {
      try {
        const encoded = hash.slice(7);
        const decoded = JSON.parse(atob(encoded));
        if (decoded.u && decoded.k) {
          const current = getSettings();
          saveSettings({ ...current, supabase_url: decoded.u, supabase_anon_key: decoded.k });
          resetSupabaseClient();
          // Clear the hash so credentials don't stay in browser history
          window.history.replaceState(null, '', window.location.pathname);
          loadUsersAndLogin();
          return;
        }
      } catch (e) {
        console.warn('Invalid setup QR link', e);
      }
    }

    const settings = getSettings();
    if (!settings.supabase_url || !settings.supabase_anon_key) {
      setStep('setup');
    } else {
      loadUsersAndLogin();
    }
  }, []);

  const loadUsersAndLogin = async () => {
    setStep('login');
    setIsLoadingUsers(true);
    setError('');
    try {
      const uList       = await getUsers();
      const activeUsers = (Array.isArray(uList) ? uList : []).filter(u => u && u.active !== false);
      const finalUsers  = activeUsers.length > 0 ? activeUsers : [DEFAULT_FALLBACK_USER];
      setUsers(finalUsers);
      setSelectedUser(finalUsers[0]);
    } catch (err) {
      console.error('Failed to load users:', err);
      setUsers([DEFAULT_FALLBACK_USER]);
      setSelectedUser(DEFAULT_FALLBACK_USER);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Called when SetupStep successfully connects
  const handleSetupComplete = () => {
    loadUsersAndLogin();
  };

  // ── Lockout timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedUser) return;
    const checkLock = () => {
      const lock = getLockoutStatus(selectedUser.username);
      setLockRemaining(lock.locked ? lock.remainingSec : 0);
    };
    checkLock();
    const id = setInterval(checkLock, 1000);
    return () => clearInterval(id);
  }, [selectedUser]);

  const handlePadPress = (val) => {
    if (lockRemaining > 0) return;
    setError('');
    if (pin.length < 4) {
      const next = pin + val;
      setPin(next);
      if (next.length === 4) setTimeout(() => attemptLogin(next), 150);
    }
  };

  const handleDelete = () => {
    if (lockRemaining > 0) return;
    setError('');
    setPin(p => p.slice(0, -1));
  };

  const attemptLogin = async (pinValue) => {
    if (!selectedUser) { setError('Please select a user first.'); setPin(''); triggerShake(); return; }
    try {
      const session = await loginWithPin(selectedUser.username, pinValue);
      if (session) onLogin(session);
    } catch (err) {
      setError(err.message);
      setPin('');
      triggerShake();
      const lock = getLockoutStatus(selectedUser.username);
      if (lock.locked) setLockRemaining(lock.remainingSec);
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const PAD_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-app)',
      padding: '1.5rem', gap: '1.5rem', overflow: 'hidden'
    }}>
      {/* Decorative Glow */}
      <div style={{
        position: 'fixed', top: '-20%', left: '50%', transform: 'translateX(-50%)',
        width: '400px', height: '400px',
        background: 'radial-gradient(circle, hsla(222,89%,56%,0.15) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0
      }} />

      {/* Logo */}
      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '22px',
          background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 0.85rem', boxShadow: '0 12px 30px var(--primary-glow)'
        }}>
          <BookOpen size={36} color="#fff" />
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Brushwell Books</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Secure Point of Sale
        </p>
      </div>

      {/* ── SETUP STEP ─────────────────────────────────────────────────────── */}
      {step === 'setup' && (
        <SetupStep onSetupComplete={handleSetupComplete} />
      )}

      {/* ── CHECK STEP (brief spinner before redirect) ───────────────────── */}
      {step === 'check' && (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          <Loader size={24} style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      )}

      {/* ── LOGIN STEP ─────────────────────────────────────────────────────── */}
      {step === 'login' && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-lg)', padding: '1.5rem',
          width: '100%', maxWidth: '320px', boxShadow: 'var(--shadow-lg)',
          zIndex: 1, display: 'flex', flexDirection: 'column', gap: '1.1rem'
        }}>

          {/* User Selector */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
              Select User
            </label>

            {isLoadingUsers ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)', background: 'var(--bg-surface-elevated)',
                color: 'var(--text-muted)', fontSize: '0.85rem'
              }}>
                <Loader size={16} style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                Loading staff accounts…
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <select
                  className="form-control"
                  value={selectedUser?.id || ''}
                  onChange={e => {
                    const found = users.find(u => u.id === e.target.value);
                    if (found) { setSelectedUser(found); setPin(''); setError(''); }
                  }}
                  style={{
                    width: '100%', padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)',
                    background: 'var(--bg-surface-elevated)', color: 'var(--text-main)',
                    fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
                    appearance: 'auto'
                  }}
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({(u.role || 'attendant').toUpperCase()})
                    </option>
                  ))}
                </select>

                {/* Re-fetch button */}
                <button
                  type="button"
                  onClick={loadUsersAndLogin}
                  title="Refresh staff list"
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-subtle)', padding: '4px', display: 'flex',
                    pointerEvents: 'auto', zIndex: 2
                  }}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            )}
          </div>

          {/* PIN Dots */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: '0.5rem' }}>
              Enter 4-Digit Security PIN
            </div>
            <div className={isShaking ? 'shake' : ''} style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', margin: '0.2rem 0' }}>
              {[0,1,2,3].map(idx => (
                <div key={idx} style={{
                  width: '14px', height: '14px', borderRadius: 'var(--radius-full)',
                  border: '2px solid ' + (pin.length > idx ? 'var(--primary)' : 'var(--border-light)'),
                  background: pin.length > idx ? 'var(--primary)' : 'transparent',
                  boxShadow: pin.length > idx ? '0 0 10px var(--primary-glow)' : 'none',
                  transition: 'all 0.15s ease'
                }} />
              ))}
            </div>
          </div>

          {/* Lock / Error */}
          {lockRemaining > 0 ? (
            <div style={{
              background: 'var(--accent-amber-light)', border: '1px solid var(--accent-amber)',
              borderRadius: 'var(--radius-md)', padding: '0.6rem', color: 'var(--accent-amber)',
              fontSize: '0.78rem', textAlign: 'center', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
            }}>
              <Lock size={15} /> Locked. Try again in {lockRemaining}s
            </div>
          ) : error ? (
            <div style={{
              background: 'var(--accent-rose-light)', border: '1px solid var(--accent-rose)',
              borderRadius: 'var(--radius-md)', padding: '0.6rem', color: 'var(--accent-rose)',
              fontSize: '0.78rem', textAlign: 'center', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
            }}>
              <AlertCircle size={15} /> {error}
            </div>
          ) : null}

          {/* Numpad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.2rem' }}>
            {PAD_KEYS.map((key, idx) => {
              if (key === '') return <div key={idx} />;
              const isDelete = key === '⌫';
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => isDelete ? handleDelete() : handlePadPress(key)}
                  disabled={lockRemaining > 0 || isLoadingUsers}
                  style={{
                    height: '52px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-surface-elevated)',
                    color: isDelete ? 'var(--accent-rose)' : 'var(--text-main)',
                    fontSize: isDelete ? '1.1rem' : '1.3rem',
                    fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: (lockRemaining > 0 || isLoadingUsers) ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s, transform 0.1s',
                    userSelect: 'none'
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>

          {/* Switch device link — lets user re-enter credentials if wrong database */}
          <button
            type="button"
            onClick={() => setStep('setup')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-subtle)', fontSize: '0.72rem', textAlign: 'center',
              textDecoration: 'underline', marginTop: '-0.25rem'
            }}
          >
            ⚙ Change database connection
          </button>

        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
