import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Truck, Plus, Search, ChevronRight, ArrowLeft, Edit2, Trash2,
  CreditCard, CheckCircle2, Camera, Image, Eye, Printer, RefreshCw,
  AlertTriangle, X, Save, FileText, TrendingDown, TrendingUp, Building2
} from 'lucide-react';
import {
  fetchSuppliers, saveSupplier, deleteSupplier,
  fetchSupplierTransactions, addSupplierTransaction, deleteSupplierTransaction
} from '../services/supabaseService';
import InvoiceImageModal from './InvoiceImageModal';

const fmt = (n) => `¢${(parseFloat(n) || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const EMPTY_SUPPLIER = { name: '', contact_person: '', phone: '', email: '', address: '', notes: '' };
const EMPTY_TXN = { type: 'credit', amount: '', description: '', reference: '', invoice_image_data: '' };

export default function SuppliersTab({ session }) {
  const [view, setView] = useState('list'); // 'list' | 'detail' | 'form'
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);           // active supplier
  const [transactions, setTransactions] = useState([]);
  const [isTxnLoading, setIsTxnLoading] = useState(false);
  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER);
  const [isEditing, setIsEditing] = useState(false);        // true = edit existing, false = new
  const [txnForm, setTxnForm] = useState(EMPTY_TXN);
  const [isTxnOpen, setIsTxnOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [imageModal, setImageModal] = useState({ open: false, url: '', data: '' });
  const fileInputRef = useRef(null);

  const loadSuppliers = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchSuppliers();
    setSuppliers(data);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const loadTxns = useCallback(async (supplierId) => {
    setIsTxnLoading(true);
    const data = await fetchSupplierTransactions(supplierId);
    setTransactions(data);
    setIsTxnLoading(false);
  }, []);

  const openDetail = (supplier) => {
    setSelected(supplier);
    setView('detail');
    loadTxns(supplier.id);
    setTxnForm(EMPTY_TXN);
    setIsTxnOpen(false);
  };

  const openNew = () => {
    setSupplierForm(EMPTY_SUPPLIER);
    setIsEditing(false);
    setFormError('');
    setView('form');
  };

  const openEdit = (supplier) => {
    setSupplierForm({ ...supplier });
    setIsEditing(true);
    setFormError('');
    setView('form');
  };

  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!supplierForm.name.trim()) { setFormError('Supplier name is required.'); return; }
    setIsSubmitting(true);
    try {
      const saved = await saveSupplier(isEditing ? { ...supplierForm } : supplierForm);
      await loadSuppliers();
      if (isEditing) {
        setSelected(saved);
        setView('detail');
        loadTxns(saved.id);
      } else {
        setView('list');
      }
    } catch (err) {
      setFormError(err.message || 'Failed to save supplier.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm('Delete this supplier and all their transaction history? This cannot be undone.')) return;
    try {
      await deleteSupplier(id);
      await loadSuppliers();
      setView('list');
      setSelected(null);
    } catch (err) { alert('Delete failed: ' + err.message); }
  };

  // ─── Photo capture & compression ─────────────────────────────────────────────
  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new window.Image();
        img.onload = () => {
          const maxDim = 1200;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => resolve(ev.target.result);
        img.src = ev.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    if (compressed) {
      setTxnForm(f => ({ ...f, invoice_image_data: compressed }));
    }
  };

  // ─── Add transaction ─────────────────────────────────────────────────────────
  const handleAddTxn = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!txnForm.amount || parseFloat(txnForm.amount) <= 0) { setFormError('Enter a valid amount.'); return; }
    setIsSubmitting(true);
    try {
      await addSupplierTransaction({
        supplier_id: selected.id,
        type: txnForm.type,
        amount: parseFloat(txnForm.amount),
        description: txnForm.description,
        reference: txnForm.reference,
        invoice_image_data: txnForm.invoice_image_data,
        created_by: session?.name || 'Staff'
      });
      setTxnForm(EMPTY_TXN);
      setIsTxnOpen(false);
      // Refresh supplier + txns
      const fresh = await fetchSuppliers();
      setSuppliers(fresh);
      const freshSup = fresh.find(s => s.id === selected.id);
      if (freshSup) setSelected(freshSup);
      await loadTxns(selected.id);
    } catch (err) {
      setFormError(err.message || 'Failed to add transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTxn = async (txnId) => {
    if (!window.confirm('Remove this transaction? Supplier totals will be reversed.')) return;
    try {
      await deleteSupplierTransaction(txnId, selected.id);
      const fresh = await fetchSuppliers();
      setSuppliers(fresh);
      const freshSup = fresh.find(s => s.id === selected.id);
      if (freshSup) setSelected(freshSup);
      await loadTxns(selected.id);
    } catch (err) { alert('Delete failed: ' + err.message); }
  };

  // ─── Print statement ─────────────────────────────────────────────────────────
  const handlePrint = () => {
    const balance = ((parseFloat(selected?.total_credit) || 0) - (parseFloat(selected?.total_paid) || 0)).toFixed(2);
    const rows = transactions.map(t => `
      <tr>
        <td>${fmtDate(t.created_at)}</td>
        <td><span class="${t.type}">${t.type === 'credit' ? '📦 Credit (Goods)' : '💳 Payment'}</span></td>
        <td>${t.description || '—'}</td>
        <td>${t.reference || '—'}</td>
        <td style="text-align:right;color:${t.type === 'credit' ? '#c0392b' : '#27ae60'};font-weight:700">
          ${t.type === 'credit' ? '-' : '+'}¢${parseFloat(t.amount).toFixed(2)}
        </td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) {
      alert('Popup window was blocked by your browser. Please allow popups to print statements.');
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Supplier Statement — ${selected?.name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 2rem; color: #111; }
        h1 { color: #1e3a8a; }
        .meta { display: flex; gap: 2rem; margin: 1rem 0; font-size: 0.9rem; }
        .meta div { display: flex; flex-direction: column; gap: 0.2rem; }
        .meta label { color: #666; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
        table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
        th { background: #1e3a8a; color: #fff; padding: 0.6rem 0.8rem; text-align: left; font-size: 0.8rem; }
        td { padding: 0.5rem 0.8rem; border-bottom: 1px solid #e2e8f0; font-size: 0.82rem; }
        tr:nth-child(even) td { background: #f8fafc; }
        .credit { color: #c0392b; font-weight: 600; }
        .payment { color: #27ae60; font-weight: 600; }
        .summary { margin-top: 2rem; padding: 1rem; background: #f0f4ff; border-radius: 8px; }
        .summary table { margin: 0; }
        .summary td { border: none; }
        @media print { body { padding: 1rem; } }
      </style></head><body>
      <h1>Supplier Statement</h1>
      <div class="meta">
        <div><label>Supplier</label><strong>${selected?.name}</strong></div>
        <div><label>Contact</label>${selected?.contact_person || '—'}</div>
        <div><label>Phone</label>${selected?.phone || '—'}</div>
        <div><label>Generated</label>${new Date().toLocaleString()}</div>
      </div>
      ${selected?.address ? `<p style="font-size:0.85rem;color:#555">📍 ${selected.address}</p>` : ''}
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Reference</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:2rem;color:#999">No transactions</td></tr>'}</tbody>
      </table>
      <div class="summary">
        <table>
          <tr><td>Total Goods on Credit:</td><td style="text-align:right;color:#c0392b;font-weight:700">¢${parseFloat(selected?.total_credit||0).toFixed(2)}</td></tr>
          <tr><td>Total Payments Made:</td><td style="text-align:right;color:#27ae60;font-weight:700">¢${parseFloat(selected?.total_paid||0).toFixed(2)}</td></tr>
          <tr><td style="font-size:1rem;font-weight:700">Outstanding Balance:</td><td style="text-align:right;font-size:1rem;font-weight:800;color:${parseFloat(balance)>0?'#c0392b':'#27ae60'}">¢${balance}</td></tr>
        </table>
      </div>
      <script>window.onload=()=>{window.print();}<\/script></body></html>`);
    win.document.close();
  };

  // ─── Filtered list ────────────────────────────────────────────────────────────
  const filtered = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone || '').includes(search) || (s.contact_person || '').toLowerCase().includes(search.toLowerCase())
  );

  const outstanding = (s) => Math.max(0, (parseFloat(s.total_credit) || 0) - (parseFloat(s.total_paid) || 0));

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── LIST VIEW ───────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
          <div style={{ width: 38, height: 38, borderRadius: '10px', background: 'linear-gradient(135deg, hsl(222,89%,56%), hsl(265,83%,58%))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Truck size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 }}>Suppliers</h2>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Credit purchases & accounts payable</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={loadSuppliers} style={iconBtn} title="Refresh"><RefreshCw size={16} /></button>
          <button onClick={openNew} style={{ ...primaryBtn, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Plus size={16} /> Add Supplier
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Suppliers', value: suppliers.length, color: 'var(--primary)' },
          { label: 'Total Credit', value: fmt(suppliers.reduce((s, x) => s + (parseFloat(x.total_credit) || 0), 0)), color: 'var(--accent-rose)' },
          { label: 'Total Paid', value: fmt(suppliers.reduce((s, x) => s + (parseFloat(x.total_paid) || 0), 0)), color: 'var(--accent-emerald)' },
          { label: 'Outstanding', value: fmt(suppliers.reduce((s, x) => s + outstanding(x), 0)), color: 'var(--accent-amber)' },
        ].map(stat => (
          <div key={stat.label} style={{ flex: '1 1 130px', background: 'var(--bg-app)', borderRadius: '10px', padding: '0.65rem 0.9rem' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: stat.color, marginTop: '2px' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0.75rem 1.25rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search suppliers by name, phone, contact…"
            style={{ ...inputStyle, paddingLeft: '2.2rem' }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.25rem 1.25rem' }}>
        {isLoading ? (
          <div style={centered}><RefreshCw size={22} style={{ animation: 'spin 1s linear infinite' }} /><span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>Loading…</span></div>
        ) : filtered.length === 0 ? (
          <div style={{ ...centered, flexDirection: 'column', gap: '0.5rem', marginTop: '3rem' }}>
            <Truck size={36} style={{ opacity: 0.25 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{search ? 'No suppliers match your search.' : 'No suppliers yet. Add one to get started.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filtered.map(s => {
              const bal = outstanding(s);
              return (
                <div key={s.id} onClick={() => openDetail(s)} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={20} color="var(--primary)" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {s.contact_person && `${s.contact_person} · `}{s.phone || 'No phone'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    {bal > 0 && (
                      <div style={{ background: 'var(--accent-rose-light)', borderRadius: '8px', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-rose)' }}>
                        {fmt(bal)} owed
                      </div>
                    )}
                    {bal <= 0 && parseFloat(s.total_credit) > 0 && (
                      <div style={{ background: 'var(--accent-emerald-light)', borderRadius: '8px', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                        Settled
                      </div>
                    )}
                    <ChevronRight size={16} style={{ color: 'var(--text-subtle)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ─── FORM VIEW (Add / Edit) ───────────────────────────────────────────────────
  if (view === 'form') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)' }}>
      <div style={formHeader}>
        <button onClick={() => setView(isEditing ? 'detail' : 'list')} style={backBtn}><ArrowLeft size={18} /></button>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>{isEditing ? 'Edit Supplier' : 'New Supplier'}</h2>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
        <form onSubmit={handleSaveSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '560px' }}>
          {formError && <div style={errorBanner}><AlertTriangle size={15} />{formError}</div>}
          <div style={fieldGroup}>
            <label style={labelStyle}>Supplier / Company Name *</label>
            <input value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ghana Book Distributors Ltd" style={inputStyle} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={fieldGroup}>
              <label style={labelStyle}>Contact Person</label>
              <input value={supplierForm.contact_person} onChange={e => setSupplierForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="Sales rep name" style={inputStyle} />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>Phone</label>
              <input value={supplierForm.phone} onChange={e => setSupplierForm(f => ({ ...f, phone: e.target.value }))} placeholder="0XX XXX XXXX" style={inputStyle} type="tel" />
            </div>
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Email</label>
            <input value={supplierForm.email} onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))} placeholder="supplier@email.com" style={inputStyle} type="email" />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Address</label>
            <input value={supplierForm.address} onChange={e => setSupplierForm(f => ({ ...f, address: e.target.value }))} placeholder="Physical / postal address" style={inputStyle} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Notes</label>
            <textarea value={supplierForm.notes} onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))} placeholder="Payment terms, delivery notes, etc." style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" onClick={() => setView(isEditing ? 'detail' : 'list')} style={secondaryBtn}>Cancel</button>
            <button type="submit" disabled={isSubmitting} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Save size={16} />{isSubmitting ? 'Saving…' : 'Save Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ─── DETAIL VIEW ─────────────────────────────────────────────────────────────
  const balance = outstanding(selected || {});
  const totalCredit = parseFloat(selected?.total_credit) || 0;
  const totalPaid = parseFloat(selected?.total_paid) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)' }}>
      {/* Detail header */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => { setView('list'); setSelected(null); }} style={backBtn}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected?.name}</h2>
            {selected?.contact_person && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1px' }}>{selected.contact_person}{selected.phone ? ` · ${selected.phone}` : ''}</p>}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={handlePrint} style={iconBtn} title="Print Statement"><Printer size={16} /></button>
            <button onClick={() => openEdit(selected)} style={iconBtn} title="Edit Supplier"><Edit2 size={16} /></button>
            <button onClick={() => handleDeleteSupplier(selected.id)} style={{ ...iconBtn, color: 'var(--accent-rose)' }} title="Delete Supplier"><Trash2 size={16} /></button>
          </div>
        </div>

        {/* Balance cards */}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 120px', background: 'var(--accent-rose-light)', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--accent-rose)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Credit (Goods)</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-rose)' }}>{fmt(totalCredit)}</div>
          </div>
          <div style={{ flex: '1 1 120px', background: 'var(--accent-emerald-light)', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--accent-emerald)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Paid</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>{fmt(totalPaid)}</div>
          </div>
          <div style={{ flex: '1 1 120px', background: balance > 0 ? 'var(--accent-amber-light)' : 'var(--accent-emerald-light)', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.65rem', color: balance > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding Balance</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: balance > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>{fmt(balance)}</div>
          </div>
        </div>
      </div>

      {/* Transaction form toggle */}
      <div style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
        <button
          onClick={() => { setIsTxnOpen(p => !p); setFormError(''); setTxnForm(EMPTY_TXN); }}
          style={{ ...primaryBtn, display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', justifyContent: 'center' }}
        >
          <Plus size={16} /> {isTxnOpen ? 'Cancel Transaction' : 'Record Transaction'}
        </button>

        {isTxnOpen && (
          <form onSubmit={handleAddTxn} style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {formError && <div style={errorBanner}><AlertTriangle size={14} />{formError}</div>}

            {/* Type selector */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[{ v: 'credit', label: '📦 Credit (Goods Received)', color: 'var(--accent-rose)' }, { v: 'payment', label: '💳 Payment Made', color: 'var(--accent-emerald)' }].map(opt => (
                <button key={opt.v} type="button"
                  onClick={() => setTxnForm(f => ({ ...f, type: opt.v }))}
                  style={{ flex: 1, padding: '0.55rem', borderRadius: '10px', border: `2px solid ${txnForm.type === opt.v ? opt.color : 'var(--border-light)'}`, background: txnForm.type === opt.v ? opt.color + '22' : 'var(--bg-app)', color: txnForm.type === opt.v ? opt.color : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s' }}
                >{opt.label}</button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div style={fieldGroup}>
                <label style={labelStyle}>Amount (¢) *</label>
                <input type="number" step="0.01" min="0.01" value={txnForm.amount} onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" style={inputStyle} required />
              </div>
              <div style={fieldGroup}>
                <label style={labelStyle}>Reference / Invoice #</label>
                <input value={txnForm.reference} onChange={e => setTxnForm(f => ({ ...f, reference: e.target.value }))} placeholder="INV-001" style={inputStyle} />
              </div>
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Description</label>
              <input value={txnForm.description} onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. JHS 3 Science textbooks batch" style={inputStyle} />
            </div>

            {/* Invoice photo */}
            <div style={fieldGroup}>
              <label style={labelStyle}>Invoice Photo (optional)</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoCapture} />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', borderRadius: '9px', border: '1.5px dashed var(--border-light)', background: 'var(--bg-app)', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  <Camera size={15} /> Capture / Upload
                </button>
                {txnForm.invoice_image_data && (
                  <>
                    <img src={txnForm.invoice_image_data} alt="preview" style={{ height: '44px', width: '44px', objectFit: 'cover', borderRadius: '8px', border: '2px solid var(--primary)', cursor: 'pointer' }} onClick={() => setImageModal({ open: true, url: '', data: txnForm.invoice_image_data })} />
                    <button type="button" onClick={() => setTxnForm(f => ({ ...f, invoice_image_data: '' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-rose)' }}><X size={16} /></button>
                  </>
                )}
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} style={{ ...primaryBtn, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CheckCircle2 size={16} />{isSubmitting ? 'Saving…' : 'Save Transaction'}
            </button>
          </form>
        )}
      </div>

      {/* Transaction history */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transaction History</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{transactions.length} record{transactions.length !== 1 ? 's' : ''}</span>
        </div>

        {isTxnLoading ? (
          <div style={centered}><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /></div>
        ) : transactions.length === 0 ? (
          <div style={{ ...centered, flexDirection: 'column', gap: '0.5rem', padding: '2rem' }}>
            <FileText size={30} style={{ opacity: 0.2 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No transactions yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {transactions.map(txn => (
              <div key={txn.id} style={{ background: 'var(--bg-surface)', borderRadius: '12px', padding: '0.8rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', border: '1px solid var(--border-light)' }}>
                <div style={{ width: 34, height: 34, borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: txn.type === 'credit' ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)' }}>
                  {txn.type === 'credit' ? <TrendingDown size={17} color="var(--accent-rose)" /> : <TrendingUp size={17} color="var(--accent-emerald)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: txn.type === 'credit' ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                      {txn.type === 'credit' ? '−' : '+'}{fmt(txn.amount)}
                    </span>
                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '99px', background: txn.type === 'credit' ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)', color: txn.type === 'credit' ? 'var(--accent-rose)' : 'var(--accent-emerald)', fontWeight: 700 }}>
                      {txn.type === 'credit' ? 'Credit' : 'Payment'}
                    </span>
                  </div>
                  {txn.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '2px' }}>{txn.description}</div>}
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {txn.reference && <span>Ref: {txn.reference}</span>}
                    <span>{fmtDate(txn.created_at)}</span>
                    {txn.created_by && <span>by {txn.created_by}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                  {(txn.invoice_image_url || txn.invoice_image_data) && (
                    <button onClick={() => setImageModal({ open: true, url: txn.invoice_image_url, data: txn.invoice_image_data })} style={iconBtn} title="View Invoice">
                      <Image size={15} />
                    </button>
                  )}
                  <button onClick={() => handleDeleteTxn(txn.id)} style={{ ...iconBtn, color: 'var(--accent-rose)' }} title="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <InvoiceImageModal
        isOpen={imageModal.open}
        imageUrl={imageModal.url}
        imageData={imageModal.data}
        onClose={() => setImageModal({ open: false, url: '', data: '' })}
        title="Supplier Invoice"
      />
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Shared style constants ───────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '0.6rem 0.85rem', borderRadius: '10px',
  border: '1.5px solid var(--border-light)', background: 'var(--bg-surface)',
  color: 'var(--text-main)', fontSize: '0.88rem', outline: 'none',
  fontFamily: 'var(--font-sans)'
};
const primaryBtn = {
  background: 'linear-gradient(135deg, var(--primary), hsl(265,83%,58%))',
  color: '#fff', border: 'none', borderRadius: '10px',
  padding: '0.6rem 1.1rem', fontWeight: 700, fontSize: '0.85rem',
  cursor: 'pointer', transition: 'opacity 0.15s'
};
const secondaryBtn = {
  background: 'var(--bg-surface)', color: 'var(--text-main)',
  border: '1.5px solid var(--border-light)', borderRadius: '10px',
  padding: '0.6rem 1rem', fontWeight: 600, fontSize: '0.85rem',
  cursor: 'pointer'
};
const iconBtn = {
  background: 'var(--bg-surface)', border: '1.5px solid var(--border-light)',
  borderRadius: '9px', padding: '0.45rem', cursor: 'pointer',
  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center'
};
const cardStyle = {
  background: 'var(--bg-surface)', borderRadius: '12px', padding: '0.8rem 1rem',
  border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center',
  gap: '0.75rem', cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.1s'
};
const labelStyle = { fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.3rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' };
const fieldGroup = { display: 'flex', flexDirection: 'column' };
const errorBanner = { background: 'var(--accent-rose-light)', color: 'var(--accent-rose)', border: '1px solid var(--accent-rose)', borderRadius: '9px', padding: '0.6rem 0.85rem', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' };
const formHeader = { background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' };
const backBtn = { background: 'var(--bg-surface)', border: '1.5px solid var(--border-light)', borderRadius: '9px', padding: '0.4rem', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' };
const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' };
