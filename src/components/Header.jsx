import React, { useState } from 'react';
import { 
  ShoppingBag, Scan, Settings, Moon, Sun, LogOut, 
  Shield, User, Clock, ChevronDown, MoreVertical, Package 
} from 'lucide-react';

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
  isAdmin,
  onOpenOutboundLoans,
  outboundCount = 0
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header style={{
      background: 'var(--bg-glass)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-light)',
      paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
      paddingBottom: '0.5rem',
      paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
      paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 90,
      gap: '0.5rem'
    }}>
      {/* Brand & Store Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, flex: 1 }}>
        <div style={{
          width: '38px', height: '38px',
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', boxShadow: '0 4px 10px var(--primary-glow)',
          flexShrink: 0
        }}>
          <ShoppingBag size={20} />
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <h1 style={{ 
            fontSize: '0.95rem', 
            fontWeight: 800, 
            lineHeight: 1.2, 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            color: 'var(--text-main)'
          }}>
            {settings.store_name || 'Brushwell Books'}
          </h1>
          {session && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '1px' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                fontSize: '0.68rem', fontWeight: 700,
                color: isAdmin ? 'var(--primary)' : 'var(--accent-emerald)',
                whiteSpace: 'nowrap'
              }}>
                {isAdmin ? <Shield size={10} /> : <User size={10} />}
                {session.name}
              </span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-subtle)', fontWeight: 600 }}>
                ({isAdmin ? 'Admin' : 'Staff'})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons Group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0, position: 'relative' }}>
        {/* Quick Scan Button */}
        <button
          className="btn-primary"
          onClick={onOpenScanner}
          style={{ padding: '0.45rem 0.65rem', fontSize: '0.8rem', borderRadius: 'var(--radius-md)', flexShrink: 0 }}
          title="Scan Barcode"
        >
          <Scan size={17} />
        </button>

        {/* Outbound Loans Button */}
        {onOpenOutboundLoans && (
          <button
            type="button"
            className="btn-icon"
            onClick={onOpenOutboundLoans}
            style={{ width: '38px', height: '38px', position: 'relative', flexShrink: 0 }}
            title="Outbound Loans (Books lent to other shops)"
          >
            <Package size={17} color="var(--accent-amber)" />
            {outboundCount > 0 && (
              <span style={{
                position: 'absolute', top: '-4px', right: '-4px',
                background: 'var(--accent-amber)', color: '#fff',
                fontSize: '0.62rem', fontWeight: 800,
                width: '18px', height: '18px', borderRadius: 'var(--radius-full)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                border: '2px solid var(--bg-surface)'
              }}>
                {outboundCount}
              </span>
            )}
          </button>
        )}

        {/* Cart Shortcut */}
        <button 
          className="btn-icon" 
          onClick={onOpenCart} 
          style={{ width: '38px', height: '38px', position: 'relative', flexShrink: 0 }} 
          title="Cart"
        >
          <ShoppingBag size={17} />
          {cartCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: 'var(--accent-rose)', color: '#fff',
              fontSize: '0.62rem', fontWeight: 800,
              width: '18px', height: '18px', borderRadius: 'var(--radius-full)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              border: '2px solid var(--bg-surface)'
            }}>
              {cartCount}
            </span>
          )}
        </button>

        {/* User Profile & Quick Menu Button */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(prev => !prev)}
          style={{
            height: '38px',
            padding: '0 0.5rem',
            borderRadius: 'var(--radius-md)',
            background: isMenuOpen ? 'var(--primary-light)' : 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            color: 'var(--text-main)',
            cursor: 'pointer',
            flexShrink: 0
          }}
          title="User & Quick Menu"
        >
          <div style={{
            width: '24px', height: '24px',
            borderRadius: '50%',
            background: 'var(--primary)',
            color: '#ffffff',
            fontSize: '0.68rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {getInitials(session?.name)}
          </div>
          <ChevronDown size={14} color="var(--text-muted)" />
        </button>

        {/* Dropdown Menu Popover */}
        {isMenuOpen && (
          <>
            <div className="popover-backdrop" onClick={() => setIsMenuOpen(false)} />
            <div className="popover-menu">
              <div style={{ padding: '0.4rem 0.6rem 0.6rem 0.6rem', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {session?.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  @{session?.username} • {isAdmin ? 'Administrator' : 'Sales Attendant'}
                </div>
              </div>

              <button
                type="button"
                className="popover-menu-item"
                onClick={() => { setIsMenuOpen(false); onOpenOrderHistory(); }}
              >
                <Clock size={16} color="var(--primary)" />
                <span>Sales History</span>
              </button>

              {onOpenOutboundLoans && (
                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => { setIsMenuOpen(false); onOpenOutboundLoans(); }}
                >
                  <Package size={16} color="var(--accent-amber)" />
                  <span>Outbound Loans {outboundCount > 0 ? `(${outboundCount} open)` : ''}</span>
                </button>
              )}

              <button
                type="button"
                className="popover-menu-item"
                onClick={() => { onToggleTheme(); }}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun size={16} color="var(--accent-amber)" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon size={16} color="var(--primary)" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>

              {isAdmin && (
                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => { setIsMenuOpen(false); onOpenSettings(); }}
                >
                  <Settings size={16} color="var(--accent-purple)" />
                  <span>POS Settings</span>
                </button>
              )}

              <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '0.2rem', paddingTop: '0.35rem' }}>
                <button
                  type="button"
                  className="popover-menu-item"
                  onClick={() => { setIsMenuOpen(false); onLogout(); }}
                  style={{ color: 'var(--accent-rose)' }}
                >
                  <LogOut size={16} />
                  <span>Logout Session</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
