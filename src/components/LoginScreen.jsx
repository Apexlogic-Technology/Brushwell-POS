import React, { useState, useEffect } from 'react';
import { BookOpen, Delete, LogIn, AlertCircle, ChevronDown, Lock } from 'lucide-react';
import { getUsers, loginWithPin, getLockoutStatus } from '../services/authService';

export default function LoginScreen({ onLogin }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);

  const users = getUsers().filter(u => u.active);

  // Lockout Countdown Timer
  useEffect(() => {
    if (!selectedUser) return;
    const checkLock = () => {
      const lock = getLockoutStatus(selectedUser.username);
      if (lock.locked) {
        setLockRemaining(lock.remainingSec);
      } else {
        setLockRemaining(0);
      }
    };

    checkLock();
    const interval = setInterval(checkLock, 1000);
    return () => clearInterval(interval);
  }, [selectedUser]);

  const handlePadPress = (val) => {
    if (lockRemaining > 0) return;
    setError('');
    if (pin.length < 4) {
      const newPin = pin + val;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => attemptLogin(newPin), 150);
      }
    }
  };

  const handleDelete = () => {
    if (lockRemaining > 0) return;
    setError('');
    setPin(prev => prev.slice(0, -1));
  };

  const attemptLogin = async (pinValue) => {
    if (!selectedUser) {
      setError('Please select a user first.');
      setPin('');
      triggerShake();
      return;
    }

    try {
      const session = await loginWithPin(selectedUser.username, pinValue);
      if (session) {
        onLogin(session);
      }
    } catch (err) {
      setError(err.message);
      setPin('');
      triggerShake();
      const lock = getLockoutStatus(selectedUser.username);
      if (lock.locked) {
        setLockRemaining(lock.remainingSec);
      }
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const PAD_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-app)',
      padding: '1.5rem',
      gap: '1.5rem',
      overflow: 'hidden'
    }}>
      {/* Decorative Glow */}
      <div style={{
        position: 'fixed',
        top: '-20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, hsla(222,89%,56%,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* Logo Header */}
      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '22px',
          background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 0.85rem',
          boxShadow: '0 12px 30px var(--primary-glow)'
        }}>
          <BookOpen size={36} color="#fff" />
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Brushwell Books</h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          Secure Point of Sale
        </p>
      </div>

      {/* Login Card */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        width: '100%',
        maxWidth: '320px',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.1rem'
      }}>

        {/* User Selector */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
            Select User
          </label>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserList(!showUserList)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-surface-elevated)',
                color: selectedUser ? 'var(--text-main)' : 'var(--text-subtle)',
                fontSize: '0.92rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left'
              }}
            >
              <span>
                {selectedUser ? (
                  <span>
                    {selectedUser.name}
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      background: selectedUser.role === 'admin' ? 'var(--primary-light)' : 'var(--accent-emerald-light)',
                      color: selectedUser.role === 'admin' ? 'var(--primary)' : 'var(--accent-emerald)',
                      textTransform: 'uppercase'
                    }}>
                      {selectedUser.role}
                    </span>
                  </span>
                ) : 'Choose who\'s signing in...'}
              </span>
              <ChevronDown size={18} color="var(--text-subtle)" style={{ transition: 'transform 0.2s', transform: showUserList ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            {/* Dropdown */}
            {showUserList && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 100,
                overflow: 'hidden'
              }}>
                {users.map(user => (
                  <button
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user);
                      setShowUserList(false);
                      setPin('');
                      setError('');
                    }}
                    style={{
                      width: '100%',
                      padding: '0.7rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: selectedUser?.id === user.id ? 'var(--primary-light)' : 'transparent',
                      color: 'var(--text-main)',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      borderBottom: '1px solid var(--border-subtle)',
                      textAlign: 'left'
                    }}
                  >
                    <span>{user.name}</span>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      background: user.role === 'admin' ? 'var(--primary-light)' : 'var(--accent-emerald-light)',
                      color: user.role === 'admin' ? 'var(--primary)' : 'var(--accent-emerald)',
                      textTransform: 'uppercase'
                    }}>
                      {user.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lockout Countdown Alert */}
        {lockRemaining > 0 ? (
          <div style={{
            background: 'var(--accent-rose-light)',
            border: '1px solid var(--accent-rose)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem',
            textAlign: 'center',
            color: 'var(--accent-rose)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.3rem'
          }}>
            <Lock size={20} />
            <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Account Locked</div>
            <div style={{ fontSize: '0.8rem' }}>Please wait <strong>{lockRemaining}s</strong> before retrying.</div>
          </div>
        ) : (
          /* PIN Dots Indicator */
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.6rem' }}>
              Enter 4-Digit PIN
            </label>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '0.85rem',
                animation: isShaking ? 'shake 0.4s ease' : 'none'
              }}
            >
              {[0,1,2,3].map(i => (
                <div
                  key={i}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: pin.length > i ? 'var(--primary)' : 'var(--border-light)',
                    boxShadow: pin.length > i ? '0 0 10px var(--primary-glow)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && lockRemaining === 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.6rem 0.8rem',
            background: 'var(--accent-rose-light)',
            border: '1px solid var(--accent-rose)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.82rem',
            color: 'var(--accent-rose)',
            fontWeight: 600
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        {/* Number Pad */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.5rem',
          opacity: lockRemaining > 0 ? 0.4 : 1,
          pointerEvents: lockRemaining > 0 ? 'none' : 'auto'
        }}>
          {PAD_KEYS.map((key, i) => {
            if (key === '') return <div key={i} />;
            const isDelete = key === '⌫';
            return (
              <button
                key={i}
                onClick={() => isDelete ? handleDelete() : handlePadPress(key)}
                style={{
                  height: '54px',
                  borderRadius: 'var(--radius-md)',
                  background: isDelete ? 'var(--accent-rose-light)' : 'var(--bg-surface-elevated)',
                  color: isDelete ? 'var(--accent-rose)' : 'var(--text-main)',
                  border: '1px solid var(--border-light)',
                  fontSize: isDelete ? '1rem' : '1.35rem',
                  fontWeight: 700,
                  transition: 'all 0.1s',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                {isDelete ? <Delete size={18} /> : key}
              </button>
            );
          })}
        </div>

        {/* Login Button */}
        <button
          className="btn-primary"
          onClick={() => attemptLogin(pin)}
          disabled={pin.length < 4 || !selectedUser || lockRemaining > 0}
          style={{
            width: '100%',
            justifyContent: 'center',
            padding: '0.85rem',
            fontSize: '1rem',
            opacity: (pin.length < 4 || !selectedUser || lockRemaining > 0) ? 0.5 : 1
          }}
        >
          <LogIn size={20} />
          Sign In
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', zIndex: 1 }}>
        🔒 Protected by SHA-256 PIN & Lockout System
      </p>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
