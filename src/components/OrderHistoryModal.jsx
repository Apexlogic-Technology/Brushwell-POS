import React, { useState } from 'react';
import { X, Search, Clock, Printer, RotateCcw, FileText, CheckCircle2, ChevronRight } from 'lucide-react';
import { fetchOrders } from '../services/supabaseService';

export default function OrderHistoryModal({ isOpen, onClose, onSelectReprintOrder, onSelectRefundOrder, isAdmin }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchOrders({ limit: 200 }).then(data => { setSales(data); setLoading(false); });
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredSales = sales.filter(s => {
    const matchesSearch = (s.order_id||'').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (s.cashier_name && s.cashier_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (s.items && s.items.some(i => (i.product_name||'').toLowerCase().includes(searchQuery.toLowerCase())));
    if (!matchesSearch) return false;

    const ts = s.created_at || s.timestamp;
    if (filterPeriod === 'today') {
      const todayStr = new Date().toISOString().split('T')[0];
      return ts && ts.startsWith(todayStr);
    }
    if (filterPeriod === 'week') {
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
      return new Date(ts) >= weekStart;
    }

    return true;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={20} color="var(--primary)" />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Past Sales History & Orders</h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Search transactions & reprint receipts</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          
          {/* Search & Period Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input 
                type="text"
                className="form-control"
                placeholder="Search order ID, book title or cashier..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.1rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[
                { key: 'all', label: `All Orders (${sales.length})` },
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'This Week' }
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilterPeriod(f.key)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    background: filterPeriod === f.key ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                    color: filterPeriod === f.key ? '#fff' : 'var(--text-muted)',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Orders List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '350px', overflowY: 'auto' }}>
            {filteredSales.map(order => {
              const isSelected = selectedOrder?.order_id === order.order_id;
              const isRefund = order.is_refund;

              return (
                <div
                  key={order.order_id}
                  style={{
                    background: isRefund ? 'var(--accent-rose-light)' : 'var(--bg-surface-elevated)',
                    border: isSelected
                      ? '2px solid var(--primary)'
                      : `1px solid ${isRefund ? 'var(--accent-rose)' : 'var(--border-light)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => setSelectedOrder(isSelected ? null : order)}
                >
                  {/* Summary Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>#{order.order_id}</span>
                        {isRefund && (
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 800,
                            padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)',
                            background: 'var(--accent-rose)', color: '#fff'
                          }}>REFUND</span>
                        )}
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700,
                          padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)',
                          background: 'var(--primary-light)', color: 'var(--primary)'
                        }}>
                          {order.payment_method}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {new Date(order.timestamp).toLocaleString()} • Cashier: {order.cashier_name || 'Main Cashier'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontWeight: 900,
                        fontSize: '1.05rem',
                        color: isRefund ? 'var(--accent-rose)' : 'var(--accent-emerald)'
                      }}>
                        GH₵{order.total.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                        {order.items.reduce((a, b) => a + b.quantity, 0)} books
                      </div>
                    </div>
                  </div>

                  {/* Expanded Itemized Detail View */}
                  {isSelected && (
                    <div style={{
                      marginTop: '0.4rem',
                      paddingTop: '0.6rem',
                      borderTop: '1px dashed var(--border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem'
                    }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        Itemized Books:
                      </div>
                      {order.items.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                          <span>{item.product_name} × {item.quantity}</span>
                          <span style={{ fontWeight: 700 }}>GH₵{(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}

                      {/* Tax & Discount Breakdown if applied */}
                      {(order.discount > 0 || order.apply_tax) && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', borderTop: '1px dotted var(--border-subtle)', paddingTop: '4px', marginTop: '2px' }}>
                          {order.discount > 0 && <div>Discount: -GH₵{order.discount.toFixed(2)}</div>}
                          {order.apply_tax && <div>VAT ({order.tax_rate_pct}%): +GH₵{order.tax_amount.toFixed(2)}</div>}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                        <button
                          className="btn-primary"
                          style={{ flex: 1, padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectReprintOrder(order);
                          }}
                        >
                          <Printer size={14} /> Reprint Receipt
                        </button>

                        {isAdmin && !isRefund && (
                          <button
                            className="btn-danger"
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectRefundOrder(order);
                            }}
                          >
                            <RotateCcw size={14} /> Refund
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}

            {filteredSales.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                <FileText size={36} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                <div style={{ fontWeight: 700 }}>No Orders Found</div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>Complete a transaction to view sales history here.</div>
              </div>
            )}
          </div>

        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
