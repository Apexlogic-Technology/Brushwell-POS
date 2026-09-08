import React, { useState, useEffect } from 'react';
import { CheckCircle2, Download, Printer, ArrowLeft, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchOrderById, fetchOrders, getSettings } from '../services/supabaseService';
import { downloadReceiptPDF } from '../services/pdfService';

export default function PublicReceiptViewer({ orderId, onGoToPos }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(() => getSettings());

  useEffect(() => {
    async function loadOrder() {
      if (!orderId) {
        setError('No order ID provided in URL');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        let found = await fetchOrderById(orderId);
        if (!found) {
          const orders = await fetchOrders({ search: orderId, limit: 5 });
          found = orders.find(o => o.order_id === orderId || String(o.id) === String(orderId));
        }
        if (found) {
          setOrder(found);
          // Check if auto-download is requested via ?dl=1 or ?download=1
          const params = new URLSearchParams(window.location.search);
          if (params.get('dl') === '1' || params.get('download') === '1') {
            setTimeout(() => {
              downloadReceiptPDF(found, settings);
            }, 600);
          }
        } else {
          setError(`Order #${orderId} could not be found.`);
        }
      } catch (err) {
        setError(err.message || 'Failed to load receipt.');
      } finally {
        setLoading(false);
      }
    }
    loadOrder();
  }, [orderId]);

  const currencySymbol = '¢';

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        padding: '1.5rem',
        gap: '1rem'
      }}>
        <RefreshCw size={36} className="animate-spin" color="var(--primary)" />
        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
          Retrieving Official Receipt #{orderId}...
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        padding: '1.5rem',
        gap: '1rem',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--accent-rose-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <AlertCircle size={28} color="var(--accent-rose)" />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Receipt Not Found</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '320px' }}>
          {error || 'Unable to locate this receipt. Please verify the order number.'}
        </p>
        {onGoToPos && (
          <button className="btn-primary" onClick={onGoToPos} style={{ marginTop: '0.5rem' }}>
            <ArrowLeft size={16} /> Return to POS
          </button>
        )}
      </div>
    );
  }

  const handleDownload = () => {
    downloadReceiptPDF(order, settings);
  };

  const handlePrint = () => {
    window.print();
  };

  const dateStr = new Date(order.created_at || order.timestamp || Date.now()).toLocaleString();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-app)',
      padding: '1.5rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '460px',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        {/* Top Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <BookOpen size={18} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{settings.store_name || 'Brushwell Books'}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={handlePrint}
              className="btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              title="Print receipt"
            >
              <Printer size={14} /> Print
            </button>
            {onGoToPos && (
              <button
                onClick={onGoToPos}
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              >
                POS Login
              </button>
            )}
          </div>
        </div>

        {/* Paper Receipt Card */}
        <div style={{
          background: '#ffffff',
          color: '#0f172a',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
          border: '1px solid var(--border-light)',
          padding: '1.5rem 1.25rem',
          position: 'relative'
        }}>
          {/* Verified Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: 'var(--accent-emerald-light)',
            color: 'var(--accent-emerald)',
            padding: '0.2rem 0.55rem',
            borderRadius: '999px',
            fontSize: '0.7rem',
            fontWeight: 800,
            marginBottom: '0.85rem'
          }}>
            <CheckCircle2 size={13} /> Verified Official Receipt
          </div>

          {/* Store Header */}
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '0.85rem', marginBottom: '0.85rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0 }}>
              {settings.store_name || 'BRUSHWELL BOOKS'}
            </h2>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '3px' }}>
              Official Sales Receipt & Proof of Purchase
            </div>
          </div>

          {/* Order Details Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.78rem', marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Order Number:</span>
              <span style={{ fontWeight: 800, fontFamily: 'monospace' }}>#{order.order_id}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Date & Time:</span>
              <span>{dateStr}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Customer:</span>
              <span style={{ fontWeight: 700 }}>{order.customer_name || 'Walk-in Customer'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Served By:</span>
              <span>{order.cashier_name || 'Staff'}</span>
            </div>
          </div>

          {/* Items Table */}
          <div style={{ borderTop: '1px dashed #cbd5e1', borderBottom: '1px dashed #cbd5e1', padding: '0.65rem 0', margin: '0.65rem 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                  <th style={{ padding: '0.35rem 0' }}>Item</th>
                  <th style={{ padding: '0.35rem 0', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '0.35rem 0', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '0.45rem 0', fontWeight: 600 }}>
                      {item.product_name}
                      {item.grade && <span style={{ fontSize: '0.68rem', color: '#64748b', display: 'block' }}>Class: {item.grade}</span>}
                    </td>
                    <td style={{ padding: '0.45rem 0', textAlign: 'center', color: '#64748b' }}>
                      {item.quantity}
                    </td>
                    <td style={{ padding: '0.45rem 0', textAlign: 'right', fontWeight: 700 }}>
                      {currencySymbol}{((parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 1)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Totals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', textAlign: 'right', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
              <span>Subtotal:</span>
              <span>{currencySymbol}{Number(order.subtotal || 0).toFixed(2)}</span>
            </div>

            {order.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-rose)' }}>
                <span>Discount:</span>
                <span>-{currencySymbol}{Number(order.discount).toFixed(2)}</span>
              </div>
            )}

            {(order.apply_tax || order.tax_applied) && (order.tax_total || order.tax_amount) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>Tax / VAT:</span>
                <span>+{currencySymbol}{Number(order.tax_total || order.tax_amount).toFixed(2)}</span>
              </div>
            )}

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 900,
              fontSize: '1.15rem',
              color: 'var(--primary)',
              borderTop: '2px solid #e2e8f0',
              paddingTop: '0.5rem',
              marginTop: '0.35rem'
            }}>
              <span>TOTAL PAID:</span>
              <span>{currencySymbol}{Number(order.total || 0).toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748b' }}>
              <span>Payment Method:</span>
              <span style={{ fontWeight: 700 }}>{order.payment_method || 'Cash'}</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', borderTop: '1px dashed #cbd5e1', marginTop: '1rem', paddingTop: '0.75rem', fontSize: '0.72rem', color: '#94a3b8' }}>
            Thank you for reading with {settings.store_name || 'Brushwell Books'}!<br />
            Powered by Brushwell POS
          </div>
        </div>

        {/* Large Download Button */}
        <button
          type="button"
          onClick={handleDownload}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1rem',
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.35)'
          }}
        >
          <Download size={18} />
          Download Official PDF Document
        </button>

      </div>
    </div>
  );
}
