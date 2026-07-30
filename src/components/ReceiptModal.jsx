import React, { useState, useEffect } from 'react';
import { X, Printer, Bluetooth, Share2, Check, MessageSquare, Phone, Home, ArrowLeft } from 'lucide-react';
import { printBluetoothReceipt, printSystemWebReceipt } from '../services/printerService';

export default function ReceiptModal({ isOpen, onClose, order, settings }) {
  const [btStatus, setBtStatus] = useState('idle');
  const [phoneInput, setPhoneInput] = useState('');

  useEffect(() => {
    if (order) {
      setPhoneInput(order.customer_phone || '');
    }
  }, [order]);

  if (!isOpen || !order) return null;

  const currencySymbol = settings.currency_symbol || 'GH₵';

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

  const generateReceiptText = () => {
    const dateStr = new Date(order.timestamp || order.created_at || Date.now()).toLocaleString();
    const itemsStr = (order.items || []).map(i => `• ${i.product_name} (x${i.quantity}) = ${currencySymbol}${(i.price * i.quantity).toFixed(2)}`).join('\n');
    const custName = order.customer_name || 'Customer';

    return `🧾 *RECEIPT #${order.order_id}*\n*${settings.store_name || 'BRUSHWELL BOOKS'}*\n\nCustomer: ${custName}\nDate: ${dateStr}\nCashier: ${order.cashier_name || 'Staff'}\nTier: ${order.price_mode === 'wholesale' ? 'WHOLESALE' : 'RETAIL'}\n\n*ITEMS:*\n${itemsStr}\n\nSubtotal: ${currencySymbol}${Number(order.subtotal || 0).toFixed(2)}\n${order.discount ? `Discount: -${currencySymbol}${Number(order.discount).toFixed(2)}\n` : ''}${order.apply_tax || order.tax_applied ? `Tax: +${currencySymbol}${Number(order.tax_total || order.tax_amount || 0).toFixed(2)}\n` : ''}*TOTAL PAID: ${currencySymbol}${Number(order.total || 0).toFixed(2)}*\nPayment Method: ${order.payment_method || 'Cash'}\n\nThank you for shopping with ${settings.store_name || 'Brushwell Books'}!`;
  };

  const cleanPhoneForWhatsApp = (rawPhone) => {
    if (!rawPhone) return '';
    let digits = rawPhone.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 10) {
      digits = '233' + digits.substring(1);
    }
    return digits;
  };

  const handleWhatsAppShare = () => {
    const text = generateReceiptText();
    const targetPhone = cleanPhoneForWhatsApp(phoneInput);

    if (targetPhone) {
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank');
    } else {
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank');
    }
  };

  const handleShare = async () => {
    const text = generateReceiptText();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Receipt ${order.order_id}`, text });
      } catch (e) {}
    } else {
      await navigator.clipboard.writeText(text);
      alert('Receipt copied to clipboard!');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Check size={20} color="var(--accent-emerald)" />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Sale Completed & Saved</h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Order #{order.order_id}</div>
            </div>
          </div>

          <button 
            type="button" 
            className="btn-secondary" 
            onClick={onClose}
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', gap: '0.3rem' }}
          >
            <ArrowLeft size={14} /> Close
          </button>
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
              <div>Date: {new Date(order.timestamp || order.created_at || Date.now()).toLocaleString()}</div>
              <div>Customer: <strong>{order.customer_name || 'Walk-in Customer'}</strong></div>
              {order.customer_phone && <div>Phone: {order.customer_phone}</div>}
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
                  {(order.items || []).map((item, i) => (
                    <tr key={i}>
                      <td style={{ paddingTop: '3px', maxWidth: '140px' }}>{item.product_name}</td>
                      <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{currencySymbol}{(item.price * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Subtotal, Multi-Tax Breakdown & Total */}
            <div style={{ textAlign: 'right', marginTop: '0.4rem' }}>
              <div>Subtotal: {currencySymbol}{Number(order.subtotal || 0).toFixed(2)}</div>
              {order.discount > 0 && <div>Discount: -{currencySymbol}{Number(order.discount).toFixed(2)}</div>}
              {(order.apply_tax || order.tax_applied) && order.tax_breakdown && order.tax_breakdown.length > 0 ? (
                order.tax_breakdown.map((t, idx) => (
                  <div key={idx}>{t.name} ({t.rate_pct}%): +{currencySymbol}{t.amount.toFixed(2)}</div>
                ))
              ) : (order.apply_tax || order.tax_applied) && (order.tax_amount || order.tax_total) > 0 ? (
                <div>VAT / Tax: +{currencySymbol}{Number(order.tax_total || order.tax_amount).toFixed(2)}</div>
              ) : null}
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '3px' }}>TOTAL: {currencySymbol}{Number(order.total || 0).toFixed(2)}</div>
              <div style={{ fontSize: '11px' }}>Paid ({order.payment_method || 'Cash'}): {currencySymbol}{Number(order.amount_tendered || order.cash_given || order.total || 0).toFixed(2)}</div>
              {(order.change_given || order.change_due) > 0 && <div style={{ fontSize: '11px' }}>Change Due: {currencySymbol}{Number(order.change_given || order.change_due).toFixed(2)}</div>}
            </div>

            <div style={{ textAlign: 'center', borderTop: '1px dashed #999', marginTop: '0.5rem', paddingTop: '0.5rem', fontSize: '10px' }}>
              Thank you for reading with us!<br />
              {settings.store_name || 'Brushwell Books'} Management
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>

            {/* Instant WhatsApp Share */}
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid #25D366',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#25D366', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Phone size={14} /> Send Directly to WhatsApp (No Contact Save Needed)
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="Enter customer WhatsApp # (e.g. 0241234567)"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  style={{ fontSize: '0.85rem', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleWhatsAppShare}
                  style={{
                    background: '#25D366',
                    color: '#ffffff',
                    padding: '0.5rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(37, 211, 102, 0.3)'
                  }}
                >
                  <MessageSquare size={16} /> Send
                </button>
              </div>
            </div>

            {/* Printing Options */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleBluetoothPrint}
                disabled={btStatus === 'printing'}
                style={{ justifyContent: 'center', fontSize: '0.78rem', padding: '0.6rem 0.5rem' }}
              >
                {btStatus === 'printing' ? (
                  <><Bluetooth size={16} style={{ animation: 'spin 1s linear infinite' }} /> Printing...</>
                ) : (
                  <><Bluetooth size={16} /> Bluetooth Print</>
                )}
              </button>

              <button
                type="button"
                className="btn-secondary"
                onClick={handleWebPrint}
                style={{ justifyContent: 'center', fontSize: '0.78rem', padding: '0.6rem 0.5rem' }}
              >
                <Printer size={16} /> System Print
              </button>
            </div>

            <button type="button" className="btn-secondary" onClick={handleShare} style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem' }}>
              <Share2 size={16} /> Copy / System Share Text
            </button>

            {/* Prominent Large Return to Home / Done Button */}
            <button
              type="button"
              className="btn-accent"
              onClick={onClose}
              style={{
                width: '100%',
                justifyContent: 'center',
                fontSize: '0.95rem',
                fontWeight: 800,
                padding: '0.85rem 1rem',
                marginTop: '0.25rem',
                background: 'linear-gradient(135deg, var(--primary), #3b82f6)',
                color: '#ffffff',
                boxShadow: '0 4px 15px var(--primary-glow)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <Home size={18} />
              Done & Return to Sales Screen
            </button>
          </div>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
