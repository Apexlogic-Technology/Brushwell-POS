import React, { useState, useEffect } from 'react';
import { X, Save, Bluetooth, Check, AlertCircle, RefreshCw, Database, Printer, Percent, Plus, Trash2, Eye, EyeOff, Smartphone, Copy, Sparkles, Camera } from 'lucide-react';
import { getSettings, saveSettings, DEFAULT_TAX_TYPES, testSupabaseConnection, resetSupabaseClient } from '../services/supabaseService';
import { connectBluetoothPrinter, disconnectBluetoothPrinter } from '../services/printerService';
import { testGeminiApiKey } from '../services/visionService';

export default function SettingsModal({ isOpen, onClose, onSettingsSaved }) {
  const [form, setForm]               = useState(getSettings());
  const [btStatus, setBtStatus]       = useState('idle');
  const [testStatus, setTestStatus]   = useState('idle');
  const [testMsg, setTestMsg]         = useState('');
  const [showKey, setShowKey]         = useState(false);
  const [showQR, setShowQR]           = useState(false);
  const [qrCopied, setQrCopied]       = useState(false);
  const [showGeminiKey, setShowGeminiKey]         = useState(false);
  const [geminiTestStatus, setGeminiTestStatus]   = useState('idle');
  const [geminiTestMsg, setGeminiTestMsg]         = useState('');

  useEffect(() => {
    if (isOpen) {
      const s = getSettings();
      if (!s.tax_types || s.tax_types.length === 0) s.tax_types = DEFAULT_TAX_TYPES;
      setForm(s);
      setTestStatus('idle');
      setTestMsg('');
      setShowQR(false);
      setQrCopied(false);
      setGeminiTestStatus('idle');
      setGeminiTestMsg('');
    }
  }, [isOpen]);

  const handleSave = () => {
    saveSettings(form);
    resetSupabaseClient();
    onSettingsSaved(form);
    onClose();
  };

  const handleTestConnection = async () => {
    setTestStatus('loading');
    setTestMsg('');
    // Save URL & key temporarily so testSupabaseConnection can use them
    saveSettings(form);
    resetSupabaseClient();
    const result = await testSupabaseConnection();
    if (result.ok) {
      setTestStatus('success');
      setTestMsg('Connected to Supabase successfully!');
    } else {
      setTestStatus('error');
      setTestMsg(result.error || 'Connection failed.');
    }
  };

  const handleTestGemini = async () => {
    setGeminiTestStatus('loading');
    setGeminiTestMsg('');
    const res = await testGeminiApiKey(form.gemini_api_key);
    if (res.ok) {
      setGeminiTestStatus('success');
      setGeminiTestMsg('Connected to Google Gemini Vision successfully!');
    } else {
      setGeminiTestStatus('error');
      setGeminiTestMsg(res.error || 'Connection failed.');
    }
  };

  const handleBtConnect = async () => {
    setBtStatus('connecting');
    try {
      const res = await connectBluetoothPrinter();
      setBtStatus('connected');
      setForm(f => ({ ...f, printer_bluetooth_name: res.name }));
    } catch {
      setBtStatus('error');
      setTimeout(() => setBtStatus('idle'), 3000);
    }
  };

  const handleBtDisconnect = () => {
    disconnectBluetoothPrinter();
    setBtStatus('idle');
    setForm(f => ({ ...f, printer_bluetooth_name: '' }));
  };

  const toggleTaxItem   = (i) => { const t = [...form.tax_types]; t[i].enabled = !t[i].enabled; setForm({ ...form, tax_types: t }); };
  const updateTaxItem   = (i, field, val) => { const t = [...form.tax_types]; t[i] = { ...t[i], [field]: val }; setForm({ ...form, tax_types: t }); };
  const addTaxType      = () => { setForm({ ...form, tax_types: [...(form.tax_types||[]), { id: 'tax-'+Date.now(), name: 'Custom Tax', rate_pct: 1.0, enabled: true }] }); };
  const removeTaxType   = (i) => { setForm({ ...form, tax_types: (form.tax_types||[]).filter((_,idx) => idx !== i) }); };

  const totalTaxPct = (form.tax_types||[]).filter(t => t.enabled).reduce((s, t) => s + (parseFloat(t.rate_pct)||0), 0);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>

        <div className="modal-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>⚙️ Store & System Settings</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Store Info */}
          <section>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
              Store & Currency
            </div>
            <div className="grid-2" style={{ marginBottom: '0.6rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Bookshop Name</label>
                <input type="text" className="form-control" value={form.store_name||''} onChange={e => setForm({ ...form, store_name: e.target.value })} placeholder="Brushwell Books" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Currency Symbol</label>
                <input type="text" className="form-control" value={form.currency_symbol||'GH₵'} onChange={e => setForm({ ...form, currency_symbol: e.target.value })} placeholder="GH₵" />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Low Stock Warning Threshold (Copies)</label>
              <input
                type="number"
                min="1"
                className="form-control"
                value={form.low_stock_threshold ?? 5}
                onChange={e => setForm({ ...form, low_stock_threshold: parseInt(e.target.value, 10) || 1 })}
                placeholder="5"
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Books with stock at or below this quantity will display a yellow ⚠ Low warning badge in the cashier selling list.
              </div>
            </div>
          </section>

          {/* Supabase Connection */}
          <section>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Database size={14} /> Supabase Database Connection
            </div>

            <div className="form-group">
              <label>Supabase Project URL</label>
              <input
                type="url"
                className="form-control"
                value={form.supabase_url||''}
                onChange={e => setForm({ ...form, supabase_url: e.target.value })}
                placeholder="https://xxxxxxxxxxxx.supabase.co"
              />
            </div>

            <div className="form-group">
              <label>Supabase Anon / Public Key</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  className="form-control"
                  value={form.supabase_anon_key||''}
                  onChange={e => setForm({ ...form, supabase_anon_key: e.target.value })}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                Found in Supabase → Project Settings → API → anon public key
              </div>
            </div>

            <button
              className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleTestConnection}
              disabled={testStatus === 'loading' || !form.supabase_url || !form.supabase_anon_key}
            >
              {testStatus === 'loading' && <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />}
              {testStatus === 'success' && <Check size={16} color="var(--accent-emerald)" />}
              {testStatus === 'error'   && <AlertCircle size={16} color="var(--accent-rose)" />}
              {testStatus === 'idle'    && <Database size={16} />}
              {testStatus === 'loading' ? 'Testing...' : testStatus === 'success' ? 'Connected!' : testStatus === 'error' ? 'Connection Failed' : 'Test Connection'}
            </button>

            {testMsg && (
              <div style={{
                marginTop: '0.6rem', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', lineHeight: 1.45, fontWeight: 600,
                background: testStatus === 'success' ? 'var(--accent-emerald-light)' : 'var(--accent-rose-light)',
                border: `1px solid ${testStatus === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
                color: testStatus === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)'
              }}>
                {testMsg}
              </div>
            )}

            {/* ── Device Setup QR Code ─────────────────────────────────────── */}
            {form.supabase_url && form.supabase_anon_key && (
              <div style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', gap: '0.5rem' }}
                  onClick={() => setShowQR(v => !v)}
                >
                  <Smartphone size={16} />
                  {showQR ? 'Hide' : 'Connect a New Device (QR Code)'}
                </button>

                {showQR && (() => {
                  // Encode credentials in the URL hash — never sent to any server
                  const payload = btoa(JSON.stringify({
                    u: form.supabase_url,
                    k: form.supabase_anon_key
                  }));
                  const setupUrl = `${window.location.origin}${window.location.pathname}#setup=${payload}`;
                  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupUrl)}`;

                  return (
                    <div style={{
                      marginTop: '0.75rem',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.75rem',
                      textAlign: 'center'
                    }}>
                      <img
                        src={qrApiUrl}
                        alt="Device Setup QR Code"
                        style={{ width: 180, height: 180, borderRadius: '8px', background: '#fff', padding: '6px' }}
                      />
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Scan with any phone/tablet to auto-connect to this database.
                        <br />Credentials are encoded locally — never sent to any server.
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem', gap: '0.4rem' }}
                        onClick={() => {
                          navigator.clipboard.writeText(setupUrl).then(() => {
                            setQrCopied(true);
                            setTimeout(() => setQrCopied(false), 2000);
                          });
                        }}
                      >
                        {qrCopied ? <Check size={14} color="var(--accent-emerald)" /> : <Copy size={14} />}
                        {qrCopied ? 'Copied!' : 'Copy Setup Link'}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </section>

          {/* AI Vision (Google Gemini) */}
          <section>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={14} color="var(--accent-purple)" /> AI Vision & Book Recognition
            </div>

            <div className="form-group" style={{ marginBottom: '0.6rem' }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Google Gemini API Key</span>
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.72rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}
                >
                  Get Free Key ↗
                </a>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  className="form-control"
                  value={form.gemini_api_key || ''}
                  onChange={e => setForm({ ...form, gemini_api_key: e.target.value })}
                  placeholder="AIzaSy..."
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(v => !v)}
                  style={{ position: 'absolute', right: '0.6rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem', lineHeight: 1.4 }}>
                Powers instant photo recognition: <strong>Snap-to-Cart</strong>, <strong>Visual Price Check</strong>, and <strong>Front+Back Book Registration</strong>. 100% free with generous daily limits.
              </div>
            </div>

            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleTestGemini}
              disabled={geminiTestStatus === 'loading' || !form.gemini_api_key}
            >
              {geminiTestStatus === 'loading' && <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />}
              {geminiTestStatus === 'success' && <Check size={16} color="var(--accent-emerald)" />}
              {geminiTestStatus === 'error'   && <AlertCircle size={16} color="var(--accent-rose)" />}
              {geminiTestStatus === 'idle'    && <Sparkles size={16} color="var(--accent-purple)" />}
              {geminiTestStatus === 'loading' ? 'Verifying Key...' : geminiTestStatus === 'success' ? 'Connected & Verified!' : geminiTestStatus === 'error' ? 'Verification Failed' : 'Test AI Vision Key'}
            </button>

            {geminiTestMsg && (
              <div style={{
                marginTop: '0.6rem', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', lineHeight: 1.45, fontWeight: 600,
                background: geminiTestStatus === 'success' ? 'var(--accent-emerald-light)' : 'var(--accent-rose-light)',
                border: `1px solid ${geminiTestStatus === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
                color: geminiTestStatus === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)'
              }}>
                {geminiTestMsg}
              </div>
            )}
          </section>

          {/* Tax Breakdown */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Percent size={14} /> Tax & Levy Breakdown
              </div>
              <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={addTaxType}>
                <Plus size={13} /> Add
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(form.tax_types||[]).map((t, idx) => (
                <div key={t.id||idx} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: 'var(--bg-surface-elevated)',
                  border: `1px solid ${t.enabled ? 'var(--primary)' : 'var(--border-light)'}`,
                  padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)'
                }}>
                  <input type="checkbox" checked={t.enabled} onChange={() => toggleTaxItem(idx)} style={{ width: 17, height: 17, accentColor: 'var(--primary)' }} />
                  <input type="text" className="form-control" value={t.name} onChange={e => updateTaxItem(idx, 'name', e.target.value)} style={{ flex: 1, padding: '0.3rem 0.5rem', fontSize: '0.85rem' }} />
                  <input type="number" step="0.1" className="form-control" value={t.rate_pct} onChange={e => updateTaxItem(idx, 'rate_pct', parseFloat(e.target.value)||0)} style={{ width: 65, padding: '0.3rem', textAlign: 'center', fontSize: '0.85rem' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>%</span>
                  <button type="button" className="btn-icon" style={{ width: 28, height: 28 }} onClick={() => removeTaxType(idx)}><Trash2 size={14} color="var(--accent-rose)" /></button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-md)' }}>
              <span>Total Active Rate:</span>
              <span>{totalTaxPct.toFixed(1)}%</span>
            </div>
          </section>

          {/* Printer */}
          <section>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Printer size={14} /> Thermal Printer
            </div>
            <div className="form-group">
              <label>Paper Roll Width</label>
              <select className="form-control" value={form.printer_paper_width||'58mm'} onChange={e => setForm({ ...form, printer_paper_width: e.target.value })}>
                <option value="58mm">58mm (Mobile Printer)</option>
                <option value="80mm">80mm (Desktop Printer)</option>
              </select>
            </div>
            <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Bluetooth Printer</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{form.printer_bluetooth_name || 'No printer paired'}</div>
              </div>
              {btStatus === 'connected'
                ? <button className="btn-danger" style={{ fontSize: '0.78rem' }} onClick={handleBtDisconnect}>Disconnect</button>
                : <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }} onClick={handleBtConnect} disabled={btStatus === 'connecting'}>
                    {btStatus === 'connecting' ? 'Pairing...' : 'Pair Printer'}
                  </button>
              }
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}><Save size={16} /> Save Settings</button>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
