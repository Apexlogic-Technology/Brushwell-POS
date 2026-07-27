import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Volume2, VolumeX, Flashlight, RefreshCw, CheckCircle2, AlertCircle, Barcode as BarcodeIcon } from 'lucide-react';

export default function BarcodeScannerModal({ isOpen, onClose, onScanSuccess, products }) {
  const [manualCode, setManualCode] = useState('');
  const [continuousMode, setContinuousMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastScanned, setLastScanned] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  const html5QrcodeRef = useRef(null);
  const scannerRegionId = 'interactive-camera-preview';

  // Web Audio API Beep Generator
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz pitch
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    const timer = setTimeout(() => {
      startScanner();
    }, 300);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen]);

  const startScanner = async () => {
    try {
      if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
        return;
      }

      const html5Qrcode = new Html5Qrcode(scannerRegionId);
      html5QrcodeRef.current = html5Qrcode;

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 160 },
        aspectRatio: 1.0
      };

      await html5Qrcode.start(
        { facingMode: 'environment' }, // Rear camera
        config,
        (decodedText) => {
          handleDecodedBarcode(decodedText);
        },
        (errorMessage) => {
          // ignore transient scan frame errors
        }
      );
      setIsScanning(true);
      setScanError(null);
    } catch (err) {
      console.warn('Camera start error:', err);
      setIsScanning(false);
      setScanError('Camera permission denied or camera unavailable. You can enter the barcode manually below.');
    }
  };

  const stopScanner = async () => {
    if (html5QrcodeRef.current) {
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
        html5QrcodeRef.current.clear();
      } catch (e) {
        console.error('Stop scanner error:', e);
      }
      html5QrcodeRef.current = null;
      setIsScanning(false);
    }
  };

  const handleDecodedBarcode = (code) => {
    const trimmed = code.trim();
    playBeep();

    // Check if barcode matches any product
    const matchedProduct = products.find(p => p.barcode === trimmed);

    setLastScanned({
      code: trimmed,
      product: matchedProduct,
      time: new Date().toLocaleTimeString()
    });

    onScanSuccess(trimmed, matchedProduct);

    if (!continuousMode) {
      onClose();
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDecodedBarcode(manualCode.trim());
    setManualCode('');
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarcodeIcon size={20} color="var(--primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Barcode Reader</h3>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Scanner Controls Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-elevated)',
            padding: '0.5rem 0.8rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)'
          }}>
            {/* Continuous Mode Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
              <input 
                type="checkbox" 
                checked={continuousMode} 
                onChange={e => setContinuousMode(e.target.checked)} 
                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
              />
              Continuous Auto-Scan
            </label>

            {/* Sound Toggle */}
            <button 
              className="btn-icon" 
              onClick={() => setSoundEnabled(!soundEnabled)}
              style={{ width: '32px', height: '32px' }}
              title="Toggle Sound Beep"
            >
              {soundEnabled ? <Volume2 size={16} color="var(--primary)" /> : <VolumeX size={16} />}
            </button>
          </div>

          {/* Camera Feed Container */}
          <div style={{
            position: 'relative',
            width: '100%',
            height: '240px',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div id={scannerRegionId} style={{ width: '100%', height: '100%' }}></div>

            {/* Scanner Overlay Visual Target */}
            {isScanning && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '75%',
                height: '55%',
                border: '2px dashed var(--accent-emerald)',
                borderRadius: 'var(--radius-md)',
                pointerEvents: 'none',
                boxShadow: '0 0 0 4000px rgba(0, 0, 0, 0.45)',
                animation: 'pulseGlow 1.8s infinite'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '10%',
                  right: '10%',
                  height: '2px',
                  background: 'var(--accent-rose)',
                  boxShadow: '0 0 8px var(--accent-rose)'
                }}></div>
              </div>
            )}

            {/* Camera Error Message */}
            {scanError && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.95)',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'var(--text-muted)'
              }}>
                <AlertCircle size={36} color="var(--accent-amber)" style={{ marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.85rem' }}>{scanError}</p>
              </div>
            )}
          </div>

          {/* Last Scanned Feedback Banner */}
          {lastScanned && (
            <div style={{
              background: lastScanned.product ? 'var(--accent-emerald-light)' : 'var(--accent-amber-light)',
              border: `1px solid ${lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
                  {lastScanned.product ? '✓ PRODUCT ADDED TO CART' : '⚠️ UNREGISTERED BARCODE'}
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  {lastScanned.product ? lastScanned.product.product_name : `Code: ${lastScanned.code}`}
                </div>
                {lastScanned.product && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    ${lastScanned.product.retail_price.toFixed(2)} • Stock: {lastScanned.product.stock_quantity}
                  </div>
                )}
              </div>
              <CheckCircle2 size={24} color={lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)'} />
            </div>
          )}

          {/* Manual Barcode Input Fallback */}
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Or type/paste barcode (e.g. 890123456789)"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
            />
            <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
              Add Item
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
