import React, { useState } from 'react';
import { X, RotateCcw, Search, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { getSalesHistory, processRefund } from '../services/n8nService';

export default function RefundModal({ isOpen, onClose, onRefundSuccess }) {
  const [orderQuery, setOrderQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [returnItems, setReturnItems] = useState({});
  const [reason, setReason] = useState('Customer Return');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const sales = getSalesHistory();
  const matchedOrders = sales.filter(s => 
    !s.is_refund &&
    (s.order_id.toLowerCase().includes(orderQuery.toLowerCase()) ||
     (s.cashier_name && s.cashier_name.toLowerCase().includes(orderQuery.toLowerCase())))
  );

  const selectOrder = (order) => {
    setSelectedOrder(order);
    const initialReturns = {};
    order.items.forEach(item => {
      initialReturns[item.id] = item.quantity;
    });
    setReturnItems(initialReturns);
  };

  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setIsSubmitting(true);

    const itemsToRefund = selectedOrder.items.map(item => {
      const qtyToReturn = parseInt(returnItems[item.id], 10) || 0;
      if (qtyToReturn <= 0) return null;
      return {
        id: item.id,
        product_name: item.product_name,
        barcode: item.barcode,
        price: item.price,
        quantity: qtyToReturn
      };
    }).filter(Boolean);

    if (itemsToRefund.length === 0) {
      alert('Please select at least 1 item quantity to refund.');
      setIsSubmitting(false);
      return;
    }

    const refundSubtotal = itemsToRefund.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const refundTotal = refundSubtotal;

    const refundPayload = {
      order_id: 'REF-' + Math.floor(100000 + Math.random() * 900000),
      original_order_id: selectedOrder.order_id,
      timestamp: new Date().toISOString(),
      is_refund: true,
      reason: reason,
      items: itemsToRefund,
      subtotal: -refundSubtotal,
      total: -refundTotal,
      payment_method: selectedOrder.payment_method,
      cashier_name: selectedOrder.cashier_name
    };

    try {
      await processRefund(refundPayload);
      setSelectedOrder(null);
      setOrderQuery('');
      onRefundSuccess(refundPayload);
      onClose();
    } catch (err) {
      console.error('Refund error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RotateCcw size={20} color="var(--accent-rose)" />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Process Book Return & Refund</h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Restore stock & record refund log</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleRefundSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Search Order */}
            {!selectedOrder && (
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                  Search Original Order ID
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                  <input 
                    type="text"
                    className="form-control"
                    placeholder="Enter order ID e.g. ORD-123456"
                    value={orderQuery}
                    onChange={e => setOrderQuery(e.target.value)}
                    style={{ paddingLeft: '2.1rem' }}
                  />
                </div>

                {/* Sales List Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {matchedOrders.slice(0, 5).map(order => (
                    <div
                      key={order.order_id}
                      onClick={() => selectOrder(order)}
                      style={{
                        padding: '0.6rem 0.8rem',
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>#{order.order_id}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {new Date(order.timestamp).toLocaleString()} • {order.items.length} items
                        </div>
                      </div>
                      <span style={{ fontWeight: 800, color: 'var(--accent-emerald)' }}>${order.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Order Return Items */}
            {selectedOrder && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{
                  background: 'var(--accent-rose-light)',
                  border: '1px solid var(--accent-rose)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.65rem 0.85rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--accent-rose)' }}>
                      Refunding Order #{selectedOrder.order_id}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Original Total: ${selectedOrder.total.toFixed(2)}
                    </div>
                  </div>
                  <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => setSelectedOrder(null)}>
                    Change Order
                  </button>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label>Return Reason</label>
                  <select className="form-control" value={reason} onChange={e => setReason(e.target.value)}>
                    <option value="Customer Return">Customer Return</option>
                    <option value="Damaged Copy">Damaged / Defective Copy</option>
                    <option value="Wrong Book Purchased">Wrong Book Purchased</option>
                  </select>
                </div>

                {/* Items Qty Select */}
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                    Select Items & Quantity to Refund
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {selectedOrder.items.map(item => (
                      <div key={item.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--bg-surface-elevated)',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-light)'
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{item.product_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>${item.price.toFixed(2)} each</div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Qty to return:</span>
                          <input 
                            type="number"
                            min="0"
                            max={item.quantity}
                            className="form-control"
                            value={returnItems[item.id] ?? item.quantity}
                            onChange={e => setReturnItems({ ...returnItems, [item.id]: parseInt(e.target.value, 10) || 0 })}
                            style={{ width: '60px', padding: '0.3rem', textAlign: 'center' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-danger" disabled={isSubmitting || !selectedOrder}>
              {isSubmitting ? <RefreshCw className="animate-spin" size={16} /> : <RotateCcw size={16} />}
              Confirm & Issue Refund
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
