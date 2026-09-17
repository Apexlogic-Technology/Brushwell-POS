import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserX, Plus, Search, ChevronRight, ArrowLeft, Edit2, Trash2,
  CheckCircle2, Camera, Image, Printer, RefreshCw,
  AlertTriangle, X, Save, FileText, TrendingDown, TrendingUp,
  User, Phone, School
} from 'lucide-react';
import {
  fetchDebtors, saveDebtor, deleteDebtor,
  fetchDebtorTransactions, addDebtorTransaction, deleteDebtorTransaction
} from '../services/supabaseService';
import InvoiceImageModal from './InvoiceImageModal';

const fmt = (n) => `¢${(parseFloat(n) || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const EMPTY_DEBTOR = { name: '', phone: '', email: '', address: '', school: '', notes: '' };
const EMPTY_TXN = { type: 'debit', amount: '', description: '', reference: '', invoice_images: [] };

const parseImages = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data.filter(Boolean);
  if (typeof data === 'string') {
    const str = data.trim();
    if (str.startsWith('[')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (e) {}
    }
    if (str) return [str];
  }
  return [];
};

export default function DebtorsTab({ session }) {
  const [view, setView] = useState('list'); // 'list' | 'detail' | 'form'
  const [debtors, setDebtors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isTxnLoading, setIsTxnLoading] = useState(false);
  const [debtorForm, setDebtorForm] = useState(EMPTY_DEBTOR);
  const [isEditing, setIsEditing] = useState(false);
  const [txnForm, setTxnForm] = useState(EMPTY_TXN);
  const [isTxnOpen, setIsTxnOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [imageModal, setImageModal] = useState({ open: false, images: [], initialIndex: 0, title: '' });
  const [filter, setFilter] = useState('all'); // 'all' | 'outstanding' | 'settled'
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const loadDebtors = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchDebtors();
    setDebtors(data);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadDebtors(); }, [loadDebtors]);

  const loadTxns = useCallback(async (debtorId) => {
    setIsTxnLoading(true);
    const data = await fetchDebtorTransactions(debtorId);
    setTransactions(data);
    setIsTxnLoading(false);
  }, []);

  const outstanding = (d) => Math.max(0, (parseFloat(d.total_debit) || 0) - (parseFloat(d.total_paid) || 0));

  const openDetail = (debtor) => {
    setSelected(debtor);
    setView('detail');
    loadTxns(debtor.id);
    setTxnForm(EMPTY_TXN);
    setIsTxnOpen(false);
  };

  const openNew = () => {
    setDebtorForm(EMPTY_DEBTOR);
    setIsEditing(false);
    setFormError('');
    setView('form');
  };

  const openEdit = (debtor) => {
    setDebtorForm({ ...debtor });
    setIsEditing(true);
    setFormError('');
    setView('form');
  };

  const handleSaveDebtor = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!debtorForm.name.trim()) { setFormError('Debtor name is required.'); return; }
    setIsSubmitting(true);
    try {
      const saved = await saveDebtor(isEditing ? { ...debtorForm } : debtorForm);
      await loadDebtors();
      if (isEditing) {
        setSelected(saved);
        setView('detail');
        loadTxns(saved.id);
      } else {
        setView('list');
      }
    } catch (err) {
      setFormError(err.message || 'Failed to save debtor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDebtor = async (id) => {
    if (!window.confirm('Delete this debtor and all their transaction history? This cannot be undone.')) return;
    try {
      await deleteDebtor(id);
      await loadDebtors();
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
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const compressedList = [];
    for (const f of files) {
      const compressed = await compressImage(f);
      if (compressed) compressedList.push(compressed);
    }
    if (compressedList.length > 0) {
      setTxnForm(f => ({
        ...f,
        invoice_images: [...(f.invoice_images || []), ...compressedList]
      }));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removePhoto = (idx) => {
    setTxnForm(f => ({
      ...f,
      invoice_images: (f.invoice_images || []).filter((_, i) => i !== idx)
    }));
  };

  const handleAddTxn = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!txnForm.amount || parseFloat(txnForm.amount) <= 0) { setFormError('Enter a valid amount.'); return; }
    setIsSubmitting(true);
    try {
      const images = txnForm.invoice_images || [];
      const invoice_image_data = images.length === 0 ? '' : JSON.stringify(images);
      await addDebtorTransaction({
        debtor_id: selected.id,
        type: txnForm.type,
        amount: parseFloat(txnForm.amount),
        description: txnForm.description,
        reference: txnForm.reference,
        invoice_image_data,
        created_by: session?.name || 'Staff'
      });
      setTxnForm(EMPTY_TXN);
      setIsTxnOpen(false);
      const fresh = await fetchDebtors();
      setDebtors(fresh);
      const freshDeb = fresh.find(d => d.id === selected.id);
      if (freshDeb) setSelected(freshDeb);
      await loadTxns(selected.id);
    } catch (err) {
      setFormError(err.message || 'Failed to add transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTxn = async (txnId) => {
    if (!window.confirm('Remove this transaction? Debtor totals will be reversed.')) return;
    try {
      await deleteDebtorTransaction(txnId, selected.id);
      const fresh = await fetchDebtors();
      setDebtors(fresh);
      const freshDeb = fresh.find(d => d.id === selected.id);
      if (freshDeb) setSelected(freshDeb);
      await loadTxns(selected.id);
    } catch (err) { alert('Delete failed: ' + err.message); }
  };

  const handlePrint = () => {
    const balance = outstanding(selected || {}).toFixed(2);
    const rows = transactions.map(t => `
      <tr>
        <td>${fmtDate(t.created_at)}</td>
        <td><span class="${t.type}">${t.type === 'debit' ? '📋 Credit Sale' : '✅ Payment Received'}</span></td>
        <td>${t.description || '—'}</td>
        <td>${t.reference || '—'}</td>
        <td style="text-align:right;color:${t.type === 'debit' ? '#c0392b' : '#27ae60'};font-weight:700">
          ${t.type === 'debit' ? '+' : '−'}¢${parseFloat(t.amount).toFixed(2)}
        </td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) {
      alert('Popup window was blocked by your browser. Please allow popups to print statements.');
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Debtor Statement — ${selected?.name}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 2rem; color: #111; }
        h1 { color: #7c3aed; }
        .meta { display: flex; gap: 2rem; margin: 1rem 0; font-size: 0.9rem; flex-wrap: wrap; }
        .meta div { display: flex; flex-direction: column; gap: 0.2rem; }
        .meta label { color: #666; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
        table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
        th { background: #7c3aed; color: #fff; padding: 0.6rem 0.8rem; text-align: left; font-size: 0.8rem; }
        td { padding: 0.5rem 0.8rem; border-bottom: 1px solid #e2e8f0; font-size: 0.82rem; }
        tr:nth-child(even) td { background: #f8fafc; }
        .debit { color: #c0392b; font-weight: 600; }
        .payment { color: #27ae60; font-weight: 600; }
        .summary { margin-top: 2rem; padding: 1rem; background: #f5f0ff; border-radius: 8px; }
        .summary table { margin: 0; }
        .summary td { border: none; }
        @media print { body { padding: 1rem; } }
      </style></head><body>
      <h1>Debtor Statement</h1>
      <div class="meta">
        <div><label>Name</label><strong>${selected?.name}</strong></div>
        ${selected?.school ? `<div><label>School</label>${selected.school}</div>` : ''}
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
          <tr><td>Total Credit Sales:</td><td style="text-align:right;color:#c0392b;font-weight:700">¢${parseFloat(selected?.total_debit||0).toFixed(2)}</td></tr>
          <tr><td>Total Payments Received:</td><td style="text-align:right;color:#27ae60;font-weight:700">¢${parseFloat(selected?.total_paid||0).toFixed(2)}</td></tr>
          <tr><td style="font-size:1rem;font-weight:700">Amount Still Owed:</td><td style="text-align:right;font-size:1rem;font-weight:800;color:${parseFloat(balance)>0?'#c0392b':'#27ae60'}">¢${balance}</td></tr>
        </table>
      </div>
      <script>window.onload=()=>{window.print();}<\/script></body></html>`);
    win.document.close();
  };

  const filtered = debtors.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.name.toLowerCase().includes(q) || (d.phone || '').includes(q) || (d.school || '').toLowerCase().includes(q);
    const bal = outstanding(d);
    const matchFilter = filter === 'all' || (filter === 'outstanding' && bal > 0) || (filter === 'settled' && bal <= 0 && parseFloat(d.total_debit) > 0);
    return matchSearch && matchFilter;
  });

  const totalOwed = debtors.reduce((s, d) => s + outstanding(d), 0);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  if (view === 'list') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
          <div style={{ width: 38, height: 38, borderRadius: '10px', background: 'linear-gradient(135deg, hsl(265,83%,58%), hsl(348,83%,58%))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserX size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 }}>Debtors</h2>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Credit sales & accounts receivable</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={loadDebtors} style={iconBtn} title="Refresh"><RefreshCw size={16} /></button>
          <button onClick={openNew} style={{ ...primaryBtn, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Plus size={16} /> Add Debtor
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Debtors', value: debtors.length, color: 'var(--primary)' },
          { label: 'Total Credit Given', value: fmt(debtors.reduce((s, d) => s + (parseFloat(d.total_debit) || 0), 0)), color: 'var(--accent-purple)' },
          { label: 'Total Collected', value: fmt(debtors.reduce((s, d) => s + (parseFloat(d.total_paid) || 0), 0)), color: 'var(--accent-emerald)' },
          { label: 'Still Owed', value: fmt(totalOwed), color: totalOwed > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' },
        ].map(stat => (
          <div key={stat.label} style={{ flex: '1 1 130px', background: 'var(--bg-app)', borderRadius: '10px', padding: '0.65rem 0.9rem' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: stat.color, marginTop: '2px' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div style={{ padding: '0.75rem 1.25rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, school…" style={{ ...inputStyle, paddingLeft: '2.2rem' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {[['all', 'All'], ['outstanding', 'Owing'], ['settled', 'Settled']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{ padding: '0.45rem 0.75rem', borderRadius: '9px', border: '1.5px solid', borderColor: filter === v ? 'var(--primary)' : 'var(--border-light)', background: filter === v ? 'var(--primary-light)' : 'var(--bg-surface)', color: filter === v ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.25rem 1.25rem' }}>
        {isLoading ? (
          <div style={centered}><RefreshCw size={22} style={{ animation: 'spin 1s linear infinite' }} /><span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>Loading…</span></div>
        ) : filtered.length === 0 ? (
          <div style={{ ...centered, flexDirection: 'column', gap: '0.5rem', marginTop: '3rem' }}>
            <UserX size={36} style={{ opacity: 0.25 }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{search ? 'No debtors match your search.' : 'No debtors yet. Add one to get started.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filtered.map(d => {
              const bal = outstanding(d);
              return (
                <div key={d.id} onClick={() => openDetail(d)} style={cardStyle}>
                  <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'hsla(265,83%,58%,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={20} color="hsl(265,83%,58%)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {d.school && <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><School size={11} />{d.school}</span>}
                      {d.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Phone size={11} />{d.phone}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    {bal > 0 ? (
                      <div style={{ background: 'var(--accent-rose-light)', borderRadius: '8px', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-rose)' }}>
                        {fmt(bal)} owed
                      </div>
                    ) : parseFloat(d.total_debit) > 0 ? (
                      <div style={{ background: 'var(--accent-emerald-light)', borderRadius: '8px', padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                        Settled
                      </div>
                    ) : null}
                    <ChevronRight size={16} style={{ color: 'var(--text-subtle)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ─── FORM VIEW ───────────────────────────────────────────────────────────────
  if (view === 'form') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)' }}>
      <div style={formHeader}>
        <button onClick={() => setView(isEditing ? 'detail' : 'list')} style={backBtn}><ArrowLeft size={18} /></button>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>{isEditing ? 'Edit Debtor' : 'New Debtor'}</h2>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
        <form onSubmit={handleSaveDebtor} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '560px' }}>
          {formError && <div style={errorBanner}><AlertTriangle size={15} />{formError}</div>}
          <div style={fieldGroup}>
            <label style={labelStyle}>Full Name *</label>
            <input value={debtorForm.name} onChange={e => setDebtorForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Kofi Mensah" style={inputStyle} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={fieldGroup}>
              <label style={labelStyle}>Phone</label>
              <input value={debtorForm.phone} onChange={e => setDebtorForm(f => ({ ...f, phone: e.target.value }))} placeholder="0XX XXX XXXX" style={inputStyle} type="tel" />
            </div>
            <div style={fieldGroup}>
              <label style={labelStyle}>School / Organisation</label>
              <input value={debtorForm.school} onChange={e => setDebtorForm(f => ({ ...f, school: e.target.value }))} placeholder="e.g. Accra High School" style={inputStyle} />
            </div>
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Email</label>
            <input value={debtorForm.email} onChange={e => setDebtorForm(f => ({ ...f, email: e.target.value }))} placeholder="customer@email.com" style={inputStyle} type="email" />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Address</label>
            <input value={debtorForm.address} onChange={e => setDebtorForm(f => ({ ...f, address: e.target.value }))} placeholder="Physical address" style={inputStyle} />
          </div>
          <div style={fieldGroup}>
            <label style={labelStyle}>Notes</label>
            <textarea value={debtorForm.notes} onChange={e => setDebtorForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes about this debtor…" style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="button" onClick={() => setView(isEditing ? 'detail' : 'list')} style={secondaryBtn}>Cancel</button>
            <button type="submit" disabled={isSubmitting} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Save size={16} />{isSubmitting ? 'Saving…' : 'Save Debtor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ─── DETAIL VIEW ─────────────────────────────────────────────────────────────
  const balance = outstanding(selected || {});
  const totalDebit = parseFloat(selected?.total_debit) || 0;
  const totalPaid = parseFloat(selected?.total_paid) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)' }}>
      {/* Detail header */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => { setView('list'); setSelected(null); }} style={backBtn}><ArrowLeft size={18} /></button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected?.name}</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1px' }}>
              {selected?.school && `${selected.school} · `}{selected?.phone || 'No phone'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button onClick={handlePrint} style={iconBtn} title="Print Statement"><Printer size={16} /></button>
            <button onClick={() => openEdit(selected)} style={iconBtn} title="Edit"><Edit2 size={16} /></button>
            <button onClick={() => handleDeleteDebtor(selected.id)} style={{ ...iconBtn, color: 'var(--accent-rose)' }} title="Delete"><Trash2 size={16} /></button>
          </div>
        </div>

        {/* Balance cards */}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 120px', background: 'hsla(265,83%,58%,0.1)', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'hsl(265,83%,50%)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Credit Given</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'hsl(265,83%,50%)' }}>{fmt(totalDebit)}</div>
          </div>
          <div style={{ flex: '1 1 120px', background: 'var(--accent-emerald-light)', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--accent-emerald)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Received</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>{fmt(totalPaid)}</div>
          </div>
          <div style={{ flex: '1 1 120px', background: balance > 0 ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.65rem', color: balance > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount Owed</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: balance > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>{fmt(balance)}</div>
          </div>
        </div>
      </div>

      {/* Transaction form */}
      <div style={{ padding: '0.75rem 1.25rem', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
        <button
          onClick={() => { setIsTxnOpen(p => !p); setFormError(''); setTxnForm(EMPTY_TXN); }}
          style={{ ...primaryBtn, background: 'linear-gradient(135deg, hsl(265,83%,58%), hsl(348,83%,58%))', display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%', justifyContent: 'center' }}
        >
          <Plus size={16} /> {isTxnOpen ? 'Cancel Transaction' : 'Record Transaction'}
        </button>

        {isTxnOpen && (
          <form onSubmit={handleAddTxn} style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {formError && <div style={errorBanner}><AlertTriangle size={14} />{formError}</div>}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[{ v: 'debit', label: '📋 Credit Sale (Owes)', color: 'hsl(265,83%,58%)' }, { v: 'payment', label: '✅ Payment Received', color: 'var(--accent-emerald)' }].map(opt => (
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
                <label style={labelStyle}>Reference</label>
                <input value={txnForm.reference} onChange={e => setTxnForm(f => ({ ...f, reference: e.target.value }))} placeholder="Receipt / Order #" style={inputStyle} />
              </div>
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Description</label>
              <input value={txnForm.description} onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. BECE Pasco books — 3 copies" style={inputStyle} />
            </div>

            {/* Evidence photos */}
            <div style={fieldGroup}>
              <label style={labelStyle}>Evidence Photos / Receipts (optional)</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoCapture} />
                <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoCapture} />
                <button type="button" onClick={() => cameraInputRef.current?.click()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', borderRadius: '9px', border: '1.5px dashed var(--border-light)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  <Camera size={15} /> Take Photo
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', borderRadius: '9px', border: '1.5px dashed var(--border-light)', background: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  <Image size={15} /> Upload Images
                </button>
                {(txnForm.invoice_images || []).length > 0 && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {txnForm.invoice_images.length} photo{txnForm.invoice_images.length > 1 ? 's' : ''} attached
                  </span>
                )}
              </div>

              {/* Gallery thumbnails */}
              {(txnForm.invoice_images || []).length > 0 && (
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                  {txnForm.invoice_images.map((img, idx) => (
                    <div key={idx} style={{ position: 'relative', width: 56, height: 56 }}>
                      <img
                        src={img}
                        alt={`thumb-${idx}`}
                        onClick={() => setImageModal({ open: true, images: txnForm.invoice_images, initialIndex: idx, title: `Attached Photo ${idx + 1}` })}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: '1.5px solid hsl(265,83%,58%)', cursor: 'pointer' }}
                      />
                      <span style={{
                        position: 'absolute', bottom: 2, left: 2,
                        background: 'rgba(0,0,0,0.7)', color: '#fff',
                        fontSize: '0.6rem', fontWeight: 700,
                        padding: '1px 4px', borderRadius: '4px'
                      }}>
                        #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        style={{
                          position: 'absolute', top: -5, right: -5,
                          background: 'var(--accent-rose)', color: '#fff',
                          border: 'none', borderRadius: '50%',
                          width: 18, height: 18, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={isSubmitting} style={{ ...primaryBtn, background: 'linear-gradient(135deg, hsl(265,83%,58%), hsl(348,83%,58%))', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
                <div style={{ width: 34, height: 34, borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: txn.type === 'debit' ? 'hsla(265,83%,58%,0.12)' : 'var(--accent-emerald-light)' }}>
                  {txn.type === 'debit' ? <TrendingUp size={17} color="hsl(265,83%,58%)" /> : <TrendingDown size={17} color="var(--accent-emerald)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: txn.type === 'debit' ? 'hsl(265,83%,58%)' : 'var(--accent-emerald)' }}>
                      {txn.type === 'debit' ? '+' : '−'}{fmt(txn.amount)}
                    </span>
                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '99px', background: txn.type === 'debit' ? 'hsla(265,83%,58%,0.12)' : 'var(--accent-emerald-light)', color: txn.type === 'debit' ? 'hsl(265,83%,58%)' : 'var(--accent-emerald)', fontWeight: 700 }}>
                      {txn.type === 'debit' ? 'Credit Sale' : 'Payment'}
                    </span>
                  </div>
                  {txn.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '2px' }}>{txn.description}</div>}
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {txn.reference && <span>Ref: {txn.reference}</span>}
                    <span>{fmtDate(txn.created_at)}</span>
                    {txn.created_by && <span>by {txn.created_by}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                  {(() => {
                    const imgs = parseImages(txn.invoice_image_data || txn.invoice_image_url);
                    if (imgs.length === 0) return null;
                    return (
                      <button
                        onClick={() => setImageModal({ open: true, images: imgs, initialIndex: 0, title: `${selected.name} — ${txn.reference || 'Evidence'}` })}
                        style={{ ...iconBtn, padding: '0.35rem 0.55rem', gap: '0.3rem', display: 'flex', alignItems: 'center' }}
                        title={`View ${imgs.length} Photo${imgs.length > 1 ? 's' : ''}`}
                      >
                        <Image size={15} />
                        {imgs.length > 1 && (
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'hsl(265,83%,58%)' }}>
                            {imgs.length}
                          </span>
                        )}
                      </button>
                    );
                  })()}
                  <button onClick={() => handleDeleteTxn(txn.id)} style={{ ...iconBtn, color: 'var(--accent-rose)' }} title="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <InvoiceImageModal
        isOpen={imageModal.open}
        images={imageModal.images}
        initialIndex={imageModal.initialIndex}
        imageUrl={imageModal.url}
        imageData={imageModal.data}
        onClose={() => setImageModal({ open: false, images: [], initialIndex: 0, url: '', data: '', title: '' })}
        title={imageModal.title || 'Debtor Evidence'}
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
