import React, { useState, useEffect } from 'react';
import { X, Printer, Bluetooth, Share2, Check, MessageSquare, Phone, Home, ArrowLeft, FileText, Download } from 'lucide-react';
import { printBluetoothReceipt, printSystemWebReceipt } from '../services/printerService';
import { downloadReceiptPDF, shareReceiptPDFViaWhatsApp, formatWhatsAppPhone } from '../services/pdfService';

export default function ReceiptModal({ isOpen, onClose, order, settings = {} }) {
  const [btStatus, setBtStatus] = useState('idle');
  const [phoneInput, setPhoneInput] = useState('');
  const [isSharingPdf, setIsSharingPdf] = useState(false);
  const [pdfSuccessNotice, setPdfSuccessNotice] = useState('');

  useEffect(() => {
    if (order) {
      setPhoneInput(order.customer_phone || '');
      setPdfSuccessNotice('');
    }
  }, [order]);

  if (!isOpen || !order) return null;

  const currencySymbol = '¢';

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

  const handleDownloadPDF = () => {
    downloadReceiptPDF(order, settings);
    setPdfSuccessNotice('PDF Receipt downloaded successfully!');
    setTimeout(() => setPdfSuccessNotice(''), 4000);
  };

  const handleWhatsAppPDFShare = async () => {
    setIsSharingPdf(true);
    try {
      const res = await shareReceiptPDFViaWhatsApp(order, settings, phoneInput);
      if (res.aborted) {
        // User dismissed the share sheet — no message needed
      } else if (res.method === 'native_file_share') {
        setPdfSuccessNotice('✅ PDF attached! Pick WhatsApp from the share sheet.');
        setTimeout(() => setPdfSuccessNotice(''), 5000);
      } else {
        // Desktop: PDF downloaded, WhatsApp chat opened
        setPdfSuccessNotice('📥 PDF saved to Downloads. Drag it into the WhatsApp chat to attach.');
        setTimeout(() => setPdfSuccessNotice(''), 7000);
      }
    } catch (err) {
      console.error('Failed to share PDF receipt:', err);
      downloadReceiptPDF(order, settings);
      setPdfSuccessNotice('PDF downloaded to device.');
      setTimeout(() => setPdfSuccessNotice(''), 4000);
    } finally {
      setIsSharingPdf(false);
    }
  };

  const handleOpenUnsavedWhatsAppChat = () => {
    const cleanPhone = formatWhatsAppPhone(phoneInput || order.customer_phone);
    if (!cleanPhone) {
      alert("Please enter the customer's phone number first.");
      return;
    }
    // Step 1: Download the PDF so it's ready on device
    downloadReceiptPDF(order, settings);
    // Step 2: Open direct WhatsApp conversation with unsaved number
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}`;
    window.open(url, '_blank');
    setPdfSuccessNotice('📥 PDF downloaded! WhatsApp chat opened — tap 📎 to attach the PDF.');
    setTimeout(() => setPdfSuccessNotice(''), 7000);
  };

  const generateReceiptText = () => {
    const dateStr = new Date(order.timestamp || order.created_at || Date.now()).toLocaleString();
    const itemsStr = (order.items || []).map(i => `• ${i.product_name} (x${i.quantity}) = ${currencySymbol}${(parseFloat(i.price || 0) * (i.quantity || 1)).toFixed(2)}`).join('\n');
    const custName = order.customer_name || 'Customer';

    return `🧾 *RECEIPT #${order.order_id}*\n*${settings.store_name || 'BRUSHWELL BOOKS'}*\n\nCustomer: ${custName}\nDate: ${dateStr}\nCashier: ${order.cashier_name || 'Staff'}\nTier: ${order.price_mode === 'wholesale' ? 'WHOLESALE' : 'RETAIL'}\n\n*ITEMS:*\n${itemsStr}\n\nSubtotal: ${currencySymbol}${Number(order.subtotal || 0).toFixed(2)}\n${order.discount ? `Discount: -${currencySymbol}${Number(order.discount).toFixed(2)}\n` : ''}${order.apply_tax || order.tax_applied ? `Tax: +${currencySymbol}${Number(order.tax_total || order.tax_amount || 0).toFixed(2)}\n` : ''}*TOTAL PAID: ${currencySymbol}${Number(order.total || 0).toFixed(2)}*\nPayment Method: ${order.payment_method || 'Cash'}\n\nThank you for shopping with ${settings.store_name || 'Brushwell Books'}!`;
  };

  const handleShareText = async () => {
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
          
          {/* Receipt Preview (Unified Sans-Serif Typography matching PDF) */}
          <div style={{
            background: '#ffffff',
            color: '#0f172a',
            fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: '12px',
            padding: '1.25rem 1rem',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            border: '1px solid var(--border-light)',
            marginBottom: '1rem'
          }}>
            {/* Header */}
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.65rem', marginBottom: '0.65rem' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{settings.store_name || 'BRUSHWELL BOOKS'}</div>
              <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Official Sales Receipt</div>
              {settings.store_address && <div style={{ fontSize: '10px', color: '#64748b' }}>{settings.store_address}</div>}
              {settings.store_phone && <div style={{ fontSize: '10px', color: '#64748b' }}>Tel: {settings.store_phone}</div>}
            </div>

            <div style={{ marginBottom: '0.65rem', fontSize: '11px', lineHeight: '1.5' }}>
              <div>Receipt #: <strong>{order.order_id}</strong></div>
              <div>Date: {new Date(order.timestamp || order.created_at || Date.now()).toLocaleString()}</div>
              <div>Customer: <strong>{order.customer_name || 'Walk-in Customer'}</strong></div>
              {order.customer_phone && <div>Phone: {order.customer_phone}</div>}
              <div>Cashier: <strong>{order.cashier_name || 'Staff'}</strong></div>
              {settings.cashier_name && order.cashier_name && settings.cashier_name !== order.cashier_name && (
                <div style={{ color: '#64748b', fontStyle: 'italic' }}>
                  (Reprinted by: {settings.cashier_name})
                </div>
              )}
              <div>Pricing Tier: <strong>{order.price_mode === 'wholesale' ? 'WHOLESALE' : 'RETAIL'}</strong></div>
            </div>

            <div style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '0.45rem 0', margin: '0.5rem 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ color: '#475569', borderBottom: '1px solid #f1f5f9' }}>
                    <th style={{ textAlign: 'left', paddingBottom: '4px' }}>Item</th>
                    <th style={{ textAlign: 'center', paddingBottom: '4px' }}>Qty</th>
                    <th style={{ textAlign: 'right', paddingBottom: '4px' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(order.items || []).map((item, i) => (
                    <tr key={i}>
                      <td style={{ paddingTop: '4px', maxWidth: '140px', fontWeight: 600 }}>{item.product_name}</td>
                      <td style={{ textAlign: 'center', paddingTop: '4px' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', paddingTop: '4px', fontWeight: 700 }}>{currencySymbol}{(parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Subtotal, Multi-Tax Breakdown & Total */}
            <div style={{ textAlign: 'right', marginTop: '0.5rem', fontSize: '11.5px', lineHeight: '1.5' }}>
              <div>Subtotal: {currencySymbol}{Number(order.subtotal || 0).toFixed(2)}</div>
              {order.discount > 0 && <div style={{ color: 'var(--accent-rose)' }}>Discount: -{currencySymbol}{Number(order.discount).toFixed(2)}</div>}
              {(order.apply_tax || order.tax_applied) && order.tax_breakdown && order.tax_breakdown.length > 0 ? (
                order.tax_breakdown.map((t, idx) => (
                  <div key={idx} style={{ color: 'var(--primary)' }}>{t.name} ({t.rate_pct}%): +{currencySymbol}{Number(t.amount || 0).toFixed(2)}</div>
                ))
              ) : (order.apply_tax || order.tax_applied) && (order.tax_amount || order.tax_total) > 0 ? (
                <div style={{ color: 'var(--primary)' }}>VAT / Tax: +{currencySymbol}{Number(order.tax_total || order.tax_amount).toFixed(2)}</div>
              ) : null}
              <div style={{ fontSize: '14px', fontWeight: 800, marginTop: '5px', paddingTop: '4px', borderTop: '1px solid #e2e8f0', color: 'var(--primary)' }}>
                TOTAL PAID: {currencySymbol}{Number(order.total || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: '11px', marginTop: '4px', color: '#64748b' }}>Payment Method: {order.payment_method || 'Cash'}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Amount Paid: {currencySymbol}{Number(order.amount_tendered || order.cash_given || order.total || 0).toFixed(2)}</div>
              {(order.change_given || order.change_due) > 0 && <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>Change Due: {currencySymbol}{Number(order.change_given || order.change_due).toFixed(2)}</div>}
            </div>

            <div style={{ textAlign: 'center', borderTop: '1px dashed #cbd5e1', marginTop: '0.65rem', paddingTop: '0.5rem', fontSize: '10px', color: '#64748b' }}>
              Thank you for shopping with us!<br />
              {settings.store_name || 'Brushwell Books'} • Digital Receipt
            </div>
          </div>

          {pdfSuccessNotice && (
            <div style={{
              background: 'var(--accent-emerald-light)',
              border: '1px solid var(--accent-emerald)',
              color: 'var(--accent-emerald)',
              fontSize: '0.8rem',
              fontWeight: 700,
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              marginBottom: '0.5rem'
            }}>
              <Check size={16} /> {pdfSuccessNotice}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>

            {/* Instant WhatsApp PDF Share */}
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1.5px solid #25D366',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              boxShadow: '0 2px 10px rgba(37, 211, 102, 0.12)'
            }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Phone size={14} /> Send PDF Receipt via WhatsApp
                </span>
                <span style={{ fontSize: '0.68rem', background: '#25D366', color: '#fff', padding: '1px 6px', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>
                  PDF Document
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="Enter WhatsApp # (e.g. 0241234567)"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  style={{ fontSize: '0.85rem', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleWhatsAppPDFShare}
                  disabled={isSharingPdf}
                  style={{
                    background: '#25D366',
                    color: '#ffffff',
                    padding: '0.5rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(37, 211, 102, 0.3)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                  title="Share PDF via WhatsApp share sheet"
                >
                  <MessageSquare size={16} /> {isSharingPdf ? 'Sharing...' : 'Share PDF'}
                </button>
              </div>

              {/* Direct WhatsApp Chat helper for Unsaved Customer Numbers */}
              {phoneInput.trim() && (
                <button
                  type="button"
                  onClick={handleOpenUnsavedWhatsAppChat}
                  style={{
                    background: 'rgba(37, 211, 102, 0.12)',
                    color: '#15803d',
                    border: '1px solid rgba(37, 211, 102, 0.35)',
                    padding: '0.45rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontWeight: 700,
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    width: '100%'
                  }}
                  title="Open direct WhatsApp conversation with unsaved number"
                >
                  <Phone size={13} /> Chat with Unsaved # ({formatWhatsAppPhone(phoneInput) || phoneInput})
                </button>
              )}

              <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', lineHeight: '1.35', padding: '0.15rem 0.2rem' }}>
                📱 <b>Saved Contact:</b> Tap <b>Share PDF</b> ➔ select WhatsApp to attach the PDF directly.<br/>
                👤 <b>Unsaved Customer:</b> Tap <b>Chat with Unsaved #</b> to open WhatsApp directly without saving them first, then tap 📎 to attach the downloaded PDF.
              </div>
            </div>

            {/* Direct PDF Download button */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleDownloadPDF}
                style={{ justifyContent: 'center', fontSize: '0.78rem', padding: '0.6rem 0.5rem', gap: '0.35rem' }}
                title="Download official PDF to your device"
              >
                <Download size={15} color="var(--primary)" /> Download PDF Receipt
              </button>
            </div>

            {/* Thermal & System Printing Options */}
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
                  <><Bluetooth size={16} /> Bluetooth Thermal</>
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
