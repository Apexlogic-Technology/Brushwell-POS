import React from 'react';
import { X, Printer, Bluetooth, Share2, Download, Check } from 'lucide-react';
import { printBluetoothReceipt, printSystemWebReceipt } from '../services/printerService';

export default function ReceiptModal({ isOpen, onClose, order, settings }) {
  const [btStatus, setBtStatus] = React.useState('idle');

  if (!isOpen || !order) return null;

  const handleBluetoothPrint = async () => {
    setBtStatus('printing');
    try {
      await printBluetoothReceipt(order, settings);
      setBtStatus('done');
      setTimeout(() => setBtStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setBtStatus('error');
      setTimeout(() => setBtStatus('idle'), 4000);
    }
  };

  const handleWebPrint = () => {
    printSystemWebReceipt(order, settings);
  };

  const handleShare = async () => {
    const text = `🧾 Receipt #${order.order_id}\nDate: ${new Date(order.timestamp).toLocaleString()}\nTotal: $${order.total.toFixed(2)}\nPayment: ${order.payment_method}\n\n${order.items.map(i => `• ${i.product_name} x${i.quantity} = $${(i.price * i.quantity).toFixed(2)}`).join('\n')}\n\nThank you! - ${settings.store_name || 'Brushwell Books'}`;
    if (navigator.share) {
      await navigator.share({ title: `Receipt ${order.order_id}`, text });
    } else {
      await navigator.clipboard.writeText(text);
      alert('Receipt copied to clipboard!');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Check size={20} color="var(--accent-emerald)" />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Sale Complete</h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Order #{order.order_id}</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          
          {/* Receipt Preview */}
          <div style={{
            background: '#ffffff',
            color: '#000',
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: '12px',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            border: '1px solid #ddd',
            marginBottom: '1rem'
          }}>
            {/* Header */}
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #999', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold' }}>{settings.store_name || 'BRUSHWELL BOOKS'}</div>
              <div style={{ fontSize: '10px', color: '#555' }}>Bookshop Mobile POS</div>
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <div>Order #: <strong>{order.order_id}</strong></div>
              <div>Date: {new Date(order.timestamp).toLocaleString()}</div>
              <div>Cashier: {order.cashier_name}</div>
              <div>Tier: <strong>{order.price_mode === 'wholesale' ? 'WHOLESALE' : 'RETAIL'}</strong></div>
            </div>

            <div style={{ borderTop: '1px dashed #999', borderBottom: '1px dashed #999', padding: '0.4rem 0', margin: '0.4rem 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Item</th>
                    <th style={{ textAlign: 'center' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i}>
                      <td style={{ paddingTop: '3px', maxWidth: '140px' }}>{item.product_name}</td>
                      <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>${(item.price * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ textAlign: 'right', marginTop: '0.4rem' }}>
              <div>Subtotal: ${order.subtotal.toFixed(2)}</div>
              {order.discount > 0 && <div>Discount: -${order.discount.toFixed(2)}</div>}
              {order.apply_tax && order.tax_amount > 0 && (
                <div>VAT / Tax ({order.tax_rate_pct}%): +${order.tax_amount.toFixed(2)}</div>
              )}
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>TOTAL: ${order.total.toFixed(2)}</div>
              <div style={{ fontSize: '11px' }}>Paid ({order.payment_method}): ${(order.cash_given || order.total).toFixed(2)}</div>
              {order.change_due > 0 && <div style={{ fontSize: '11px' }}>Change Due: ${order.change_due.toFixed(2)}</div>}
            </div>

            <div style={{ textAlign: 'center', borderTop: '1px dashed #999', marginTop: '0.5rem', paddingTop: '0.5rem', fontSize: '10px' }}>
              Thank you for reading with us!<br />
              Brushwell Books Management
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <button
              className="btn-primary"
              onClick={handleBluetoothPrint}
              disabled={btStatus === 'printing'}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {btStatus === 'printing' ? (
                <><Bluetooth size={18} style={{ animation: 'spin 1s linear infinite' }} /> Printing...</>
              ) : btStatus === 'done' ? (
                <><Check size={18} /> Printed via Bluetooth!</>
              ) : btStatus === 'error' ? (
                <><X size={18} /> Bluetooth Error – Retry</>
              ) : (
                <><Bluetooth size={18} /> Print via Bluetooth (ESC/POS)</>
              )}
            </button>

            <button className="btn-secondary" onClick={handleWebPrint} style={{ width: '100%', justifyContent: 'center' }}>
              <Printer size={18} />
              Print via WiFi / System Printer
            </button>

            <button className="btn-accent" onClick={handleShare} style={{ width: '100%', justifyContent: 'center' }}>
              <Share2 size={18} />
              Share Digital Receipt
            </button>
          </div>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
