import React, { useState, useEffect } from 'react';
import { X, Save, Bluetooth, Wifi, Check, AlertCircle, RefreshCw, Server, Printer, Key, Percent } from 'lucide-react';
import { getSettings, saveSettings } from '../services/n8nService';
import { connectBluetoothPrinter, disconnectBluetoothPrinter } from '../services/printerService';

export default function SettingsModal({ isOpen, onClose, onSettingsSaved }) {
  const [form, setForm] = useState(getSettings());
  const [btStatus, setBtStatus] = useState('idle');
  const [testStatus, setTestStatus] = useState('idle');

  useEffect(() => {
    if (isOpen) setForm(getSettings());
  }, [isOpen]);

  const handleSave = () => {
    saveSettings(form);
    onSettingsSaved(form);
    onClose();
  };

  const testN8nWebhook = async () => {
    if (!form.n8n_base_url) return;
    setTestStatus('loading');
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (form.webhook_secret_key) headers['X-POS-Secret'] = form.webhook_secret_key;

      const res = await fetch(`${form.n8n_base_url}/products`, { method: 'GET', headers });
      setTestStatus(res.ok ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
    setTimeout(() => setTestStatus('idle'), 4000);
  };

  const handleBtConnect = async () => {
    setBtStatus('connecting');
    try {
      const res = await connectBluetoothPrinter();
      setBtStatus('connected');
      setForm(f => ({ ...f, printer_bluetooth_name: res.name }));
    } catch (err) {
      setBtStatus('error');
      setTimeout(() => setBtStatus('idle'), 3000);
    }
  };

  const handleBtDisconnect = () => {
    disconnectBluetoothPrinter();
    setBtStatus('idle');
    setForm(f => ({ ...f, printer_bluetooth_name: '' }));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        
        <div className="modal-header">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>⚙️ POS Settings</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Store Info */}
          <section>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
              Store & Tax Setup
            </div>
            <div className="form-group">
              <label>Bookshop Name</label>
              <input type="text" className="form-control" value={form.store_name} onChange={e => setForm({ ...form, store_name: e.target.value })} placeholder="Brushwell Books" />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Default Tax/VAT Rate (%)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  value={form.tax_rate_pct} 
                  onChange={e => setForm({ ...form, tax_rate_pct: parseFloat(e.target.value) || 0 })} 
                  placeholder="15" 
                />
              </div>

              <div className="form-group">
                <label>Tax Enabled by Default</label>
                <select 
                  className="form-control"
                  value={form.tax_enabled_default ? 'yes' : 'no'}
                  onChange={e => setForm({ ...form, tax_enabled_default: e.target.value === 'yes' })}
                >
                  <option value="no">No (Optional per sale)</option>
                  <option value="yes">Yes (Enabled on all sales)</option>
                </select>
              </div>
            </div>
          </section>

          {/* n8n Webhook & Security Header */}
          <section>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Server size={14} /> n8n Connection & Security
            </div>

            {/* Mock Mode Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: form.use_mock_mode ? 'var(--accent-amber-light)' : 'var(--accent-emerald-light)',
              border: `1px solid ${form.use_mock_mode ? 'var(--accent-amber)' : 'var(--accent-emerald)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              marginBottom: '0.75rem'
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: form.use_mock_mode ? 'var(--accent-amber)' : 'var(--accent-emerald)' }}>
                  {form.use_mock_mode ? '📴 Offline Mock Mode' : '🌐 n8n Live PostgreSQL Sync'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {form.use_mock_mode ? 'Using local storage fallback' : 'Connected live to PostgreSQL via n8n'}
                </div>
              </div>
              <label style={{ cursor: 'pointer', position: 'relative', width: '44px', height: '24px' }}>
                <input 
                  type="checkbox" 
                  checked={!form.use_mock_mode}
                  onChange={e => setForm({ ...form, use_mock_mode: !e.target.checked })}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', inset: 0,
                  background: form.use_mock_mode ? '#ccc' : 'var(--accent-emerald)',
                  borderRadius: 'var(--radius-full)',
                  transition: 'background 0.2s'
                }}>
                  <span style={{
                    position: 'absolute',
                    top: '3px',
                    left: form.use_mock_mode ? '3px' : '23px',
                    width: '18px',
                    height: '18px',
                    background: '#fff',
                    borderRadius: 'var(--radius-full)',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.25)'
                  }} />
                </span>
              </label>
            </div>

            <div className="form-group">
              <label>n8n Webhook Base URL</label>
              <input 
                type="url" 
                className="form-control"
                value={form.n8n_base_url}
                onChange={e => setForm({ ...form, n8n_base_url: e.target.value })}
                placeholder="https://n8n.yourdomain.com/webhook/pos"
                disabled={form.use_mock_mode}
              />
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Key size={13} /> Webhook Secret Key (X-POS-Secret Header)
              </label>
              <input 
                type="password"
                className="form-control"
                value={form.webhook_secret_key}
                onChange={e => setForm({ ...form, webhook_secret_key: e.target.value })}
                placeholder="Optional security key for n8n validation..."
                disabled={form.use_mock_mode}
              />
            </div>

            <button 
              className="btn-secondary" 
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={testN8nWebhook}
              disabled={form.use_mock_mode || testStatus === 'loading'}
            >
              {testStatus === 'loading' && <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />}
              {testStatus === 'success' && <Check size={16} color="var(--accent-emerald)" />}
              {testStatus === 'error' && <AlertCircle size={16} color="var(--accent-rose)" />}
              {testStatus === 'idle' && <Wifi size={16} />}
              {testStatus === 'loading' ? 'Testing...' : testStatus === 'success' ? 'n8n Connected!' : testStatus === 'error' ? 'Connection Failed' : 'Test n8n Connection'}
            </button>
          </section>

          {/* Thermal Printer Settings */}
          <section>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Printer size={14} /> Thermal Printer Setup
            </div>

            <div className="form-group">
              <label>Paper Roll Width</label>
              <select className="form-control" value={form.printer_paper_width} onChange={e => setForm({ ...form, printer_paper_width: e.target.value })}>
                <option value="58mm">58mm (Compact Mobile Printer)</option>
                <option value="80mm">80mm (Desktop Thermal Printer)</option>
              </select>
            </div>

            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Bluetooth size={16} color={btStatus === 'connected' ? 'var(--primary)' : 'var(--text-muted)'} />
                  Bluetooth Receipt Printer
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {form.printer_bluetooth_name || 'No printer paired'}
                </div>
              </div>
              {btStatus === 'connected' ? (
                <button className="btn-danger" style={{ fontSize: '0.78rem' }} onClick={handleBtDisconnect}>Disconnect</button>
              ) : (
                <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.75rem' }} onClick={handleBtConnect} disabled={btStatus === 'connecting'}>
                  {btStatus === 'connecting' ? 'Pairing...' : 'Pair Printer'}
                </button>
              )}
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            <Save size={16} /> Save Settings
          </button>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
