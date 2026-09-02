import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Package, Search, CheckCircle2, RotateCcw,
  Trash2, RefreshCw, AlertTriangle
} from 'lucide-react';
import {
  fetchOutboundLoans,
  createOutboundLoan,
  updateOutboundLoan,
  deleteOutboundLoan
} from '../services/supabaseService';

const STATUS_COLORS = {
  outstanding: { bg: 'var(--accent-amber-light)', color: 'hsl(35,90%,22%)', border: 'var(--accent-amber)', label: 'Outstanding' },
  returned:    { bg: 'var(--primary-light)',        color: 'var(--primary)',            border: 'var(--primary)',        label: 'Returned' },
  paid:        { bg: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)',     border: 'var(--accent-emerald)', label: 'Paid' }
};

export default function OutboundLoansModal({ isOpen, onClose, products, settings, session }) {
  const [activeTab, setActiveTab] = useState('list');
  const [loans, setLoans] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loanForm, setLoanForm] = useState({
    borrower_name: '', borrower_phone: '', product_id: '', product_name: '',
    grade: '', publisher: '', quantity: 1, unit_price: '', notes: '', is_custom: false
  });
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const currencySymbol = settings?.currency_symbol || 'GH\u20b5';

  const getGrade = (p) => {
    if (!p) return '';
    const raw = (p.grade || p.class_name || p.level || p.category_name || '').toString().trim();
    if (!raw || raw.toLowerCase() === 'general' || raw.toLowerCase() === 'uncategorized') return '';
    return raw;
  };

  const loadLoans = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchOutboundLoans();
    setLoans(data);
    setIsLoading(false);
  }, []);

  useEffect(() => { if (isOpen) loadLoans(); }, [isOpen, loadLoans]);

  if (!isOpen) return null;

  const outstanding = loans.filter(l => l.status === 'outstanding');
  const totalOwed   = outstanding.reduce((s, l) => s + parseFloat(l.total_owed || 0), 0);
  const totalOutQty = outstanding.reduce((s, l) => s + parseInt(l.quantity || 0, 10), 0);

  const filteredLoans = loans.filter(l => {
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || (l.borrower_name || '').toLowerCase().includes(q)
      || (l.product_name || '').toLowerCase().includes(q)
      || (l.loan_ref || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const catalogResults = catalogSearch.trim().length > 0 && !loanForm.product_id
    ? (products || []).filter(p => {
        const q = catalogSearch.toLowerCase();
        return (p.product_name || '').toLowerCase().includes(q)
          || (getGrade(p) || '').toLowerCase().includes(q)
          || (p.publisher || '').toLowerCase().includes(q);
      }).slice(0, 12)
    : [];

  const totalOwedCalc = (parseFloat(loanForm.unit_price) || 0) * (parseInt(loanForm.quantity, 10) || 0);

  const handleSelectCatalogProduct = (p) => {
    const grade = getGrade(p);
    setLoanForm(f => ({ ...f, product_id: p.id, product_name: p.product_name, grade, publisher: p.publisher || '', unit_price: p.retail_price ? String(p.retail_price) : '' }));
    setCatalogSearch('');
  };

  const handleSubmitLoan = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!loanForm.borrower_name.trim()) { setFormError('Borrower/shop name is required.'); return; }
    if (!loanForm.product_name.trim()) { setFormError('Please select or enter a book name.'); return; }
    if (!loanForm.unit_price || parseFloat(loanForm.unit_price) <= 0) { setFormError('Please enter a valid price per copy.'); return; }
    setIsSubmitting(true);
    try {
      await createOutboundLoan({
        borrower_name: loanForm.borrower_name.trim(), borrower_phone: loanForm.borrower_phone.trim(),
        product_id: loanForm.product_id || null, product_name: loanForm.product_name.trim(),
        grade: loanForm.grade.trim(), publisher: loanForm.publisher.trim(),
        quantity: parseInt(loanForm.quantity, 10) || 1, unit_price: parseFloat(loanForm.unit_price) || 0,
        total_owed: totalOwedCalc, notes: loanForm.notes.trim(), recorded_by: session?.name || 'Staff'
      });
      setLoanForm({ borrower_name: '', borrower_phone: '', product_id: '', product_name: '', grade: '', publisher: '', quantity: 1, unit_price: '', notes: '', is_custom: false });
      setCatalogSearch('');
      await loadLoans();
      setActiveTab('list');
    } catch (err) {
      setFormError(err.message || 'Failed to record loan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const updates = { status: newStatus };
      if (newStatus === 'returned' || newStatus === 'paid') updates.settled_at = new Date().toISOString();
      await updateOutboundLoan(id, updates);
      setLoans(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    } catch (err) { alert('Update failed: ' + err.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this loan record?')) return;
    try {
      await deleteOutboundLoan(id);
      setLoans(prev => prev.filter(l => l.id !== id));
    } catch (err) { alert('Delete failed: ' + err.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))', padding: '0.35rem', borderRadius: 'var(--radius-sm)', display: 'flex' }}>
              <Package size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>\ud83d\udce4 Outbound Loans</h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Books you\u2019ve lent to other shops</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', padding: '0.65rem 1rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface)' }}>
          {[
            { label: 'Outstanding Copies', value: totalOutQty + ' copies', color: 'var(--accent-amber)' },
            { label: 'Amount Owed to Us', value: currencySymbol + totalOwed.toFixed(2), color: 'var(--accent-rose)' },
            { label: 'Total Loan Records', value: loans.length, color: 'var(--primary)' }
          ].map(kpi => (
            <div key={kpi.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '0.45rem 0.6rem' }}>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.1rem' }}>{kpi.label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.35rem', padding: '0.55rem 1rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-surface-elevated)' }}>
          {[{ key: 'list', label: '\ud83d\udccb All Outgoing Loans' }, { key: 'record', label: '\u2795 Record New Loan' }].map(tab => (
            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} style={{ flex: 1, padding: '0.4rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, background: activeTab === tab.key ? 'var(--primary)' : 'transparent', color: activeTab === tab.key ? '#fff' : 'var(--text-muted)' }}>{tab.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>

          {/* ── RECORD TAB ── */}
          {activeTab === 'record' && (
            <form onSubmit={handleSubmitLoan} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              {formError && (
                <div style={{ padding: '0.5rem 0.7rem', background: 'var(--accent-rose-light)', border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-rose)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <AlertTriangle size={14} /> {formError}
                </div>
              )}

              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.45rem' }}>Borrower / Shop</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label className="form-label">Shop / Person Name *</label>
                    <input type="text" className="form-control" placeholder="e.g. Kwame Bookshop" value={loanForm.borrower_name} onChange={e => setLoanForm(f => ({ ...f, borrower_name: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="form-label">Phone (optional)</label>
                    <input type="tel" className="form-control" placeholder="e.g. 024 000 0000" value={loanForm.borrower_phone} onChange={e => setLoanForm(f => ({ ...f, borrower_phone: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.45rem' }}>Book / Product</div>
                <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem' }}>
                  {[false, true].map(isCustom => (
                    <button key={String(isCustom)} type="button" onClick={() => { setLoanForm(f => ({ ...f, is_custom: isCustom, product_id: '', product_name: '', grade: '', publisher: '', unit_price: '' })); setCatalogSearch(''); }}
                      style={{ flex: 1, padding: '0.3rem', fontSize: '0.76rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: loanForm.is_custom === isCustom ? 'var(--primary)' : 'transparent', color: loanForm.is_custom === isCustom ? '#fff' : 'var(--text-muted)' }}
                    >{isCustom ? 'Custom / External' : 'From Catalog'}</button>
                  ))}
                </div>

                {!loanForm.is_custom ? (
                  <div>
                    <label className="form-label">Search Catalog *</label>
                    <input type="text" className="form-control" placeholder="Type title, class, or publisher\u2026" value={catalogSearch} onChange={e => { setCatalogSearch(e.target.value); setLoanForm(f => ({ ...f, product_id: '', product_name: '' })); }} />
                    {loanForm.product_id && (
                      <div style={{ marginTop: '0.3rem', padding: '0.3rem 0.5rem', background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>\u2714 {loanForm.product_name}{loanForm.grade ? ` [${loanForm.grade}]` : ''}</span>
                        <button type="button" onClick={() => { setLoanForm(f => ({ ...f, product_id: '', product_name: '', grade: '', publisher: '', unit_price: '' })); setCatalogSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--accent-rose)', fontWeight: 700 }}>\u2715 Clear</button>
                      </div>
                    )}
                    {catalogResults.length > 0 && (
                      <div style={{ marginTop: '0.25rem', maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)' }}>
                        {catalogResults.map(p => (
                          <div key={p.id} onClick={() => handleSelectCatalogProduct(p)}
                            style={{ padding: '0.38rem 0.65rem', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div>
                              <div style={{ fontWeight: 700 }}>{p.product_name}</div>
                              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{getGrade(p) ? `Class: ${getGrade(p)}` : ''}{p.publisher ? ` \u00b7 ${p.publisher}` : ''}</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--primary)' }}>{currencySymbol}{p.retail_price}</div>
                              <div style={{ fontSize: '0.63rem', color: p.stock_quantity > 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>Stock: {p.stock_quantity}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ gridColumn: '1/-1' }}>
                      <label className="form-label">Book Title *</label>
                      <input type="text" className="form-control" placeholder="e.g. Aki-Ola Core Mathematics" value={loanForm.product_name} onChange={e => setLoanForm(f => ({ ...f, product_name: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="form-label">Class / Grade</label>
                      <input type="text" className="form-control" placeholder="e.g. SHS 2" value={loanForm.grade} onChange={e => setLoanForm(f => ({ ...f, grade: e.target.value }))} />
                    </div>
                    <div>
                      <label className="form-label">Publisher</label>
                      <input type="text" className="form-control" placeholder="e.g. Aki-Ola" value={loanForm.publisher} onChange={e => setLoanForm(f => ({ ...f, publisher: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label className="form-label">Quantity *</label>
                  <input type="number" min="1" className="form-control" value={loanForm.quantity} onChange={e => setLoanForm(f => ({ ...f, quantity: e.target.value }))} required />
                </div>
                <div>
                  <label className="form-label">Price/Copy ({currencySymbol}) *</label>
                  <input type="number" min="0" step="any" className="form-control" placeholder="0.00" value={loanForm.unit_price} onChange={e => setLoanForm(f => ({ ...f, unit_price: e.target.value }))} required />
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '2px' }}>Amount they owe</div>
                </div>
                <div>
                  <label className="form-label">Total Owed</label>
                  <div style={{ height: '38px', display: 'flex', alignItems: 'center', padding: '0 0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', fontWeight: 800, fontSize: '0.88rem', color: 'var(--accent-amber)' }}>
                    {currencySymbol}{totalOwedCalc.toFixed(2)}
                  </div>
                </div>
              </div>

              <div>
                <label className="form-label">Notes (optional)</label>
                <textarea className="form-control" rows={2} placeholder="Any additional notes\u2026" value={loanForm.notes} onChange={e => setLoanForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'none' }} />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setActiveTab('list')}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={isSubmitting}>
                  {isSubmitting ? <><RefreshCw size={14} /> Saving\u2026</> : <><Package size={14} /> Record Outbound Loan</>}
                </button>
              </div>
            </form>
          )}

          {/* ── LIST TAB ── */}
          {activeTab === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
                  <input type="text" className="form-control" placeholder="Search shop or book\u2026" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '1.9rem', fontSize: '0.79rem' }} />
                </div>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  {['all', 'outstanding', 'returned', 'paid'].map(s => (
                    <button key={s} type="button" onClick={() => setStatusFilter(s)} style={{ padding: '0.28rem 0.55rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', cursor: 'pointer', background: statusFilter === s ? 'var(--primary)' : 'var(--bg-surface-elevated)', color: statusFilter === s ? '#fff' : 'var(--text-muted)' }}>
                      {s === 'all' ? 'All' : STATUS_COLORS[s]?.label}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-secondary" style={{ padding: '0.28rem 0.5rem' }} onClick={loadLoans} title="Refresh"><RefreshCw size={13} /></button>
              </div>

              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}><RefreshCw size={22} style={{ margin: '0 auto 0.5rem' }} /><br />Loading\u2026</div>
              ) : filteredLoans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                  <Package size={34} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>No outgoing loans found</div>
                  <div style={{ fontSize: '0.73rem', marginTop: '0.2rem' }}>Use \u201cRecord New Loan\u201d to log a book you\u2019ve lent out.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {filteredLoans.map(loan => {
                    const st = STATUS_COLORS[loan.status] || STATUS_COLORS.outstanding;
                    return (
                      <div key={loan.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderLeft: `4px solid ${st.border}`, borderRadius: 'var(--radius-md)', padding: '0.65rem 0.8rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-main)' }}>{loan.borrower_name}</span>
                              <span style={{ fontSize: '0.63rem', padding: '0.08rem 0.38rem', borderRadius: 'var(--radius-full)', fontWeight: 700, background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>{st.label}</span>
                            </div>
                            <div style={{ fontSize: '0.77rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.12rem' }}>
                              {loan.product_name}{loan.grade ? ` [${loan.grade}]` : ''}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.08rem', display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                              <span>Ref: #{loan.loan_ref}</span>
                              <span>Qty: {loan.quantity}</span>
                              <span>{currencySymbol}{parseFloat(loan.unit_price).toFixed(2)}/copy</span>
                              {loan.borrower_phone && <span>\ud83d\udcde {loan.borrower_phone}</span>}
                              <span>\ud83d\udcc5 {new Date(loan.loaned_at || loan.created_at).toLocaleDateString()}</span>
                            </div>
                            {loan.notes && <div style={{ fontSize: '0.67rem', color: 'var(--text-subtle)', marginTop: '0.12rem', fontStyle: 'italic' }}>"{loan.notes}"</div>}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Owed</div>
                            <div style={{ fontWeight: 800, fontSize: '1rem', color: loan.status === 'outstanding' ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                              {currencySymbol}{parseFloat(loan.total_owed).toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {loan.status === 'outstanding' && (
                          <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px dashed var(--border-light)' }}>
                            <button type="button" onClick={() => handleUpdateStatus(loan.id, 'returned')} style={{ flex: 1, padding: '0.28rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                              <RotateCcw size={11} /> Returned
                            </button>
                            <button type="button" onClick={() => handleUpdateStatus(loan.id, 'paid')} style={{ flex: 1, padding: '0.28rem', fontSize: '0.7rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                              <CheckCircle2 size={11} /> Paid
                            </button>
                            <button type="button" onClick={() => handleDelete(loan.id)} style={{ padding: '0.28rem 0.5rem', fontSize: '0.7rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: 'var(--accent-rose-light)', color: 'var(--accent-rose)' }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        )}
                        {loan.status !== 'outstanding' && (
                          <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem', paddingTop: '0.3rem', borderTop: '1px dashed var(--border-light)', alignItems: 'center' }}>
                            <div style={{ flex: 1, fontSize: '0.68rem', color: 'var(--text-muted)' }}>Settled: {loan.settled_at ? new Date(loan.settled_at).toLocaleDateString() : '\u2014'}</div>
                            <button type="button" onClick={() => handleUpdateStatus(loan.id, 'outstanding')} style={{ padding: '0.22rem 0.45rem', fontSize: '0.68rem', fontWeight: 600, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', cursor: 'pointer', background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>\u21a9 Revert</button>
                            <button type="button" onClick={() => handleDelete(loan.id)} style={{ padding: '0.22rem 0.45rem', fontSize: '0.68rem', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', background: 'var(--accent-rose-light)', color: 'var(--accent-rose)' }}><Trash2 size={11} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
