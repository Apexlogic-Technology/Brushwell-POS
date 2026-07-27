import React from 'react';
import { ShoppingBag, Scan, Settings, Moon, Sun, LogOut, Shield, User, Clock } from 'lucide-react';

export default function Header({
  settings,
  onOpenSettings,
  onOpenScanner,
  onOpenOrderHistory,
  theme,
  onToggleTheme,
  cartCount,
  onOpenCart,
  session,
  onLogout,
  isAdmin
}) {
  return (
    <header style={{
      background: 'var(--bg-glass)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-light)',
      padding: '0.55rem 1rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 90
    }}>
      {/* Brand & Session Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <div style={{
          width: '36px', height: '36px',
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', boxShadow: '0 4px 10px var(--primary-glow)'
        }}>
          <ShoppingBag size={20} />
        </div>
        <div>
          <h1 style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.1 }}>
            {settings.store_name || 'Brushwell Books'}
          </h1>
          {session && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '2px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                fontSize: '0.68rem', fontWeight: 700,
                color: isAdmin ? 'var(--primary)' : 'var(--accent-emerald)'
              }}>
                {isAdmin ? <Shield size={10} /> : <User size={10} />}
                {session.name}
              </div>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-subtle)' }}>
                · {isAdmin ? 'Admin' : 'Attendant'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {/* Quick Scan button */}
        <button
          className="btn-primary"
          onClick={onOpenScanner}
          style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem', borderRadius: 'var(--radius-md)' }}
          title="Scan Barcode"
        >
          <Scan size={17} />
          <span style={{ display: 'none' }}>Scan</span>
        </button>

        {/* Past Sales History Shortcut */}
        <button
          className="btn-icon"
          onClick={onOpenOrderHistory}
          title="Past Sales History"
        >
          <Clock size={19} />
        </button>

        {/* Cart shortcut */}
        <button className="btn-icon" onClick={onOpenCart} style={{ position: 'relative' }} title="Cart">
          <ShoppingBag size={19} />
          {cartCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: 'var(--accent-rose)', color: '#fff',
              fontSize: '0.65rem', fontWeight: 800,
              width: '17px', height: '17px', borderRadius: 'var(--radius-full)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
            }}>{cartCount}</span>
          )}
        </button>

        {/* Theme Toggle */}
        <button className="btn-icon" onClick={onToggleTheme} title="Toggle Theme">
          {theme === 'dark'
            ? <Sun size={17} color="var(--accent-amber)" />
            : <Moon size={17} />}
        </button>

        {/* Settings — Admin only */}
        {isAdmin && (
          <button className="btn-icon" onClick={onOpenSettings} title="Settings">
            <Settings size={17} />
          </button>
        )}

        {/* Logout */}
        <button
          className="btn-icon"
          onClick={onLogout}
          title="Sign out"
          style={{ borderColor: 'var(--accent-rose-light)' }}
        >
          <LogOut size={17} color="var(--accent-rose)" />
        </button>
      </div>
    </header>
  );
}
