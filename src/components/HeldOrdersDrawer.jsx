// HeldOrdersDrawer.jsx — Brushwell POS
// Slide-up panel for managing multiple simultaneous customer orders.
// Cashiers can park (hold) a customer's order, serve another customer,
// then resume the held order — all without losing any items.

import React from 'react';
import { 
  PauseCircle, PlayCircle, Trash2, ShoppingCart, 
  Plus, Clock, Users, X
} from 'lucide-react';

/**
 * HeldOrdersDrawer
 * 
 * Props:
 *  isOpen         — boolean, controls visibility
 *  onClose        — fn, close the drawer
 *  heldOrders     — array of { id, label, cart, createdAt, priceMode }
 *  onResume       — fn(id), restore a held order to active cart
 *  onDelete       — fn(id), discard a held order
 *  onHoldCurrent  — fn(), park the current cart as a new held order
 *  hasActiveCart  — boolean, whether current cart has items
 *  currencySymbol — string
 */
export default function HeldOrdersDrawer({
  isOpen,
  onClose,
  heldOrders = [],
  onResume,
  onDelete,
  onHoldCurrent,
  hasActiveCart,
  currencySymbol = 'GH₵'
}) {
  if (!isOpen) return null;

  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '--:--';
    }
  };

  const getOrderTotal = (cartItems) => {
    return cartItems.reduce((sum, item) => {
      const base = item.priceMode === 'wholesale'
        ? (item.wholesale_price || 0)
        : (item.retail_price || 0);
      const disc = Math.max(0, parseFloat(item.discount) || 0);
      return sum + Math.max(0, base - disc) * (item.quantity || 1);
    }, 0);
  };

  const getItemCount = (cartItems) => 
    cartItems.reduce((s, i) => s + (i.quantity || 1), 0);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(3px)',
          zIndex: 900,
          animation: 'fadeInBg 0.2s ease'
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '80vh',
        background: 'var(--bg-surface)',
        borderRadius: '24px 24px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
        zIndex: 901,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideUpDrawer 0.28s cubic-bezier(0.32, 0.72, 0, 1)'
      }}>
        <style>{`
          @keyframes fadeInBg { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUpDrawer { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `}</style>

        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem 0 0' }}>
          <div style={{ width: '40px', height: '4px', borderRadius: '99px', background: 'var(--border-medium)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem 0.85rem',
          borderBottom: '1px solid var(--border-light)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--accent-amber), hsl(35, 90%, 45%))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 3px 10px rgba(245,158,11,0.4)'
            }}>
              <Users size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)' }}>
                Held Orders
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {heldOrders.length} parked · serve multiple customers
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-full)',
              width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>

          {/* Hold Current Cart Button */}
          <button
            onClick={() => { onHoldCurrent(); onClose(); }}
            disabled={!hasActiveCart}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              padding: '0.85rem',
              borderRadius: 'var(--radius-lg)',
              border: `2px dashed ${hasActiveCart ? 'var(--accent-amber)' : 'var(--border-light)'}`,
              background: hasActiveCart ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface-elevated)',
              color: hasActiveCart ? 'var(--accent-amber)' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: hasActiveCart ? 'pointer' : 'not-allowed',
              transition: 'all 0.18s'
            }}
          >
            <PauseCircle size={20} />
            {hasActiveCart ? 'Hold Current Order (Park for Later)' : 'No active order to hold'}
          </button>

          {/* New Empty Order Button */}
          <button
            onClick={() => { onHoldCurrent(); onClose(); }}
            disabled={!hasActiveCart && heldOrders.length === 0}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.7rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-light)',
              background: 'var(--bg-surface-elevated)',
              color: 'var(--primary)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.18s'
            }}
          >
            <Plus size={17} />
            Start New Customer (hold current first)
          </button>

          {/* Divider */}
          {heldOrders.length > 0 && (
            <div style={{ 
              fontSize: '0.72rem', fontWeight: 700, 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em',
              paddingTop: '0.25rem'
            }}>
              Parked Orders — tap to resume
            </div>
          )}

          {/* Held Order Cards */}
          {heldOrders.map((order, idx) => (
            <div
              key={order.id}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                transition: 'box-shadow 0.2s'
              }}
            >
              {/* Order header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem 0.6rem'
              }}>
                {/* Number badge */}
                <div style={{
                  width: '36px', height: '36px', flexShrink: 0,
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: '1rem',
                  boxShadow: '0 3px 8px var(--primary-glow)'
                }}>
                  {idx + 1}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    {order.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2px' }}>
                    <Clock size={11} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Held at {formatTime(order.createdAt)}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>·</span>
                    <ShoppingCart size={11} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {getItemCount(order.cart)} item{getItemCount(order.cart) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)' }}>
                    {currencySymbol}{getOrderTotal(order.cart).toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {order.priceMode}
                  </div>
                </div>
              </div>

              {/* Mini cart preview */}
              <div style={{ padding: '0 1rem 0.65rem' }}>
                <div style={{ 
                  fontSize: '0.73rem', 
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}>
                  {order.cart.slice(0, 4).map(item => 
                    `${item.product_name} ×${item.quantity}`
                  ).join(' · ')}
                  {order.cart.length > 4 && ` · +${order.cart.length - 4} more`}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{
                display: 'flex',
                borderTop: '1px solid var(--border-light)'
              }}>
                <button
                  onClick={() => { onDelete(order.id); }}
                  style={{
                    flex: '0 0 auto',
                    padding: '0.65rem 1rem',
                    background: 'transparent',
                    border: 'none',
                    borderRight: '1px solid var(--border-light)',
                    color: 'var(--accent-rose)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                >
                  <Trash2 size={14} /> Discard
                </button>
                <button
                  onClick={() => { onResume(order.id); onClose(); }}
                  style={{
                    flex: 1,
                    padding: '0.65rem 1rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-emerald)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    fontSize: '0.85rem',
                    fontWeight: 700
                  }}
                >
                  <PlayCircle size={16} /> Resume Order
                </button>
              </div>
            </div>
          ))}

          {heldOrders.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '2rem 1rem',
              color: 'var(--text-muted)'
            }}>
              <PauseCircle size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>No held orders yet</div>
              <div style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>
                Press "Hold Current Order" to park a customer's order<br />and start a new one immediately.
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
