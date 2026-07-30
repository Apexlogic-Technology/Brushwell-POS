import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Volume2, VolumeX, RefreshCw, CheckCircle2, AlertCircle, Barcode as BarcodeIcon } from 'lucide-react';

// All barcode formats supported by html5-qrcode
const ALL_BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.AZTEC,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.RSS_14,
  Html5QrcodeSupportedFormats.RSS_EXPANDED,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

const SCANNER_REGION_ID = 'brushwell-barcode-region';

export default function BarcodeScannerModal({ isOpen, onClose, onScanSuccess, products = [] }) {
  const [manualCode, setManualCode]         = useState('');
  const [continuousMode, setContinuousMode] = useState(true);
  const [soundEnabled, setSoundEnabled]     = useState(true);
  const [lastScanned, setLastScanned]       = useState(null);
  const [scanError, setScanError]           = useState(null);
  const [isScanning, setIsScanning]         = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const scannerRef       = useRef(null);
  const lastScanTimeRef  = useRef(0);
  const isMountedRef     = useRef(false);
  const soundEnabledRef  = useRef(soundEnabled);

  // Keep sound ref in sync
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const playBeep = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1047, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) { /* ignore */ }
  }, []);

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current;
    if (!instance) return;
    scannerRef.current = null;
    try {
      if (instance.isScanning) {
        await instance.stop();
      }
    } catch (e) { /* ignore stop errors */ }
    try { instance.clear(); } catch (e) { /* ignore clear errors */ }
    if (isMountedRef.current) {
      setIsScanning(false);
      setIsInitializing(false);
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!isMountedRef.current) return;

    // If already running, bail out
    if (scannerRef.current && scannerRef.current.isScanning) return;

    // Ensure any stale instance is cleared first
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch (e) { /* ignore */ }
      try { scannerRef.current.clear(); } catch (e) { /* ignore */ }
      scannerRef.current = null;
    }

    // Wait for the DOM element to exist
    await new Promise(r => setTimeout(r, 300));
    if (!isMountedRef.current) return;

    const regionEl = document.getElementById(SCANNER_REGION_ID);
    if (!regionEl) return;

    setIsInitializing(true);
    setScanError(null);

    const instance = new Html5Qrcode(SCANNER_REGION_ID, { verbose: false });
    scannerRef.current = instance;

    const config = {
      fps: 15,
      qrbox: { width: 280, height: 140 },
      formatsToSupport: ALL_BARCODE_FORMATS,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      aspectRatio: 1.5,
    };

    const onSuccess = (text) => {
      if (!isMountedRef.current) return;
      const trimmed = text.trim();
      const now = Date.now();
      if (!trimmed || now - lastScanTimeRef.current < 1500) return;
      lastScanTimeRef.current = now;

      playBeep();

      const match = (Array.isArray(products) ? products : [])
        .filter(Boolean)
        .find(p => p.barcode === trimmed);

      setLastScanned({ code: trimmed, product: match, time: new Date().toLocaleTimeString() });

      if (onScanSuccess) onScanSuccess(trimmed, match);
      if (!continuousMode) onClose();
    };

    try {
      await instance.start({ facingMode: 'environment' }, config, onSuccess, () => {});
    } catch (err1) {
      try {
        await instance.start({ facingMode: 'user' }, config, onSuccess, () => {});
      } catch (err2) {
        if (isMountedRef.current) {
          scannerRef.current = null;
          setIsInitializing(false);
          setScanError('Camera unavailable or permission denied. Use the manual entry below.');
        }
        return;
      }
    }

    if (isMountedRef.current) {
      setIsScanning(true);
      setIsInitializing(false);
      setScanError(null);
    }
  }, [products, continuousMode, onClose, onScanSuccess, playBeep]);

  // Lifecycle: mount/unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Open/close effect
  useEffect(() => {
    if (isOpen) {
      setLastScanned(null);
      setScanError(null);
      setManualCode('');
      const timer = setTimeout(() => {
        if (isMountedRef.current) startScanner();
      }, 400);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    const trimmed = manualCode.trim();
    const match = (Array.isArray(products) ? products : [])
      .filter(Boolean)
      .find(p => p.barcode === trimmed);
    setLastScanned({ code: trimmed, product: match, time: new Date().toLocaleTimeString() });
    if (onScanSuccess) onScanSuccess(trimmed, match);
    setManualCode('');
    if (!continuousMode) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>

        {/* Inject CSS to suppress the html5-qrcode canvas overlays (white markers) */}
        <style>{`
          #${SCANNER_REGION_ID} canvas { display: none !important; }
          #${SCANNER_REGION_ID} video  { 
            width: 100% !important; 
            height: 100% !important; 
            object-fit: cover !important; 
            border-radius: 8px;
          }
          #${SCANNER_REGION_ID} img    { display: none !important; }
          #${SCANNER_REGION_ID} > div  { 
            border: none !important; 
            box-shadow: none !important;
            background: transparent !important;
          }
          #${SCANNER_REGION_ID} > div > div { display: none !important; }
        `}</style>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarcodeIcon size={20} color="var(--primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Barcode & ISBN Scanner</h3>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Controls Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-elevated)',
            padding: '0.5rem 0.8rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={e => setContinuousMode(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
              />
              Continuous Auto-Scan
            </label>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSoundEnabled(s => !s)}
                style={{ width: '32px', height: '32px' }}
                title="Toggle Beep Sound"
              >
                {soundEnabled ? <Volume2 size={16} color="var(--primary)" /> : <VolumeX size={16} />}
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => { stopScanner().then(() => startScanner()); }}
                style={{ width: '32px', height: '32px' }}
                title="Restart Camera"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* Camera Viewfinder */}
          <div style={{
            position: 'relative',
            width: '100%',
            height: '260px',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background: '#111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Scanner region — always rendered so the DOM element exists */}
            <div
              id={SCANNER_REGION_ID}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />

            {/* Clean scan-area overlay — only visible when scanning */}
            {isScanning && !scanError && (
              <div style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* Dark vignette without left/right white lines */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to right, rgba(0,0,0,0.5) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.5) 100%)'
                }} />
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.5) 100%)'
                }} />

                {/* Target box */}
                <div style={{
                  position: 'relative',
                  width: '78%',
                  height: '48%',
                  border: '2px solid rgba(52, 211, 153, 0.85)',
                  borderRadius: '8px',
                  boxShadow: '0 0 0 1px rgba(52,211,153,0.2), inset 0 0 20px rgba(52,211,153,0.05)'
                }}>
                  {/* Corner accents */}
                  {[
                    { top: -2, left: -2, borderTop: '3px solid #34d399', borderLeft: '3px solid #34d399' },
                    { top: -2, right: -2, borderTop: '3px solid #34d399', borderRight: '3px solid #34d399' },
                    { bottom: -2, left: -2, borderBottom: '3px solid #34d399', borderLeft: '3px solid #34d399' },
                    { bottom: -2, right: -2, borderBottom: '3px solid #34d399', borderRight: '3px solid #34d399' },
                  ].map((s, i) => (
                    <div key={i} style={{ position: 'absolute', width: '18px', height: '18px', borderRadius: '2px', ...s }} />
                  ))}

                  {/* Animated scan line */}
                  <div style={{
                    position: 'absolute',
                    left: '5%',
                    right: '5%',
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, #f43f5e, transparent)',
                    boxShadow: '0 0 8px #f43f5e',
                    animation: 'scanLine 1.8s ease-in-out infinite'
                  }} />
                </div>
              </div>
            )}

            {/* Initializing spinner */}
            {isInitializing && !scanError && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: '#fff', gap: '0.5rem',
                background: 'rgba(0,0,0,0.7)'
              }}>
                <div style={{
                  width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.2)',
                  borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }} />
                <span style={{ fontSize: '0.82rem', opacity: 0.8 }}>Starting camera…</span>
              </div>
            )}

            {/* Error overlay */}
            {scanError && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.95)',
                padding: '1.5rem', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)'
              }}>
                <AlertCircle size={36} color="var(--accent-amber)" style={{ marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>{scanError}</p>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => startScanner()}
                  style={{ fontSize: '0.78rem' }}
                >
                  <RefreshCw size={14} /> Retry Camera
                </button>
              </div>
            )}
          </div>

          {/* Keyframe styles */}
          <style>{`
            @keyframes scanLine { 0%,100% { top:8%; } 50% { top:88%; } }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>

          {/* Last Scanned Result */}
          {lastScanned && (
            <div style={{
              background: lastScanned.product ? 'var(--accent-emerald-light)' : 'var(--accent-amber-light)',
              border: `1px solid ${lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem'
            }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)', textTransform: 'uppercase', marginBottom: '2px' }}>
                  {lastScanned.product ? '✓ Matched in catalogue' : '⚠ Not found in catalogue'}
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  {lastScanned.product ? lastScanned.product.product_name : `Barcode: ${lastScanned.code}`}
                </div>
                {lastScanned.product && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                    GH₵ {parseFloat(lastScanned.product.retail_price || 0).toFixed(2)} • Stock: {lastScanned.product.stock_quantity}
                  </div>
                )}
                {!lastScanned.product && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                    Code: {lastScanned.code}
                  </div>
                )}
              </div>
              <CheckCircle2 size={26} color={lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)'} />
            </div>
          )}

          {/* Manual Entry */}
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="form-control"
              inputMode="numeric"
              placeholder="Or type / paste barcode / ISBN manually"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            />
            <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
              Submit
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
