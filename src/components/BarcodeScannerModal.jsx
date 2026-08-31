import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  X, Volume2, VolumeX, RefreshCw, CheckCircle2, AlertCircle, 
  Barcode as BarcodeIcon, Camera, Zap, ZapOff, Upload, SwitchCamera, Loader
} from 'lucide-react';

// All 1D & 2D barcode formats supported by html5-qrcode
const ALL_BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.AZTEC,
  Html5QrcodeSupportedFormats.RSS_14,
  Html5QrcodeSupportedFormats.RSS_EXPANDED,
].filter(Boolean);

const SCANNER_REGION_ID = 'brushwell-barcode-region';
const FILE_SCANNER_REGION_ID = 'brushwell-file-barcode-region';

export default function BarcodeScannerModal({ isOpen, onClose, onScanSuccess, products = [] }) {
  const [manualCode, setManualCode]         = useState('');
  const [continuousMode, setContinuousMode] = useState(true);
  const [soundEnabled, setSoundEnabled]     = useState(true);
  const [lastScanned, setLastScanned]       = useState(null);
  const [scanError, setScanError]           = useState(null);
  const [isScanning, setIsScanning]         = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [cameras, setCameras]               = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn]               = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const scannerRef            = useRef(null);
  const lastScanTimeRef       = useRef(0);
  const lastScannedCodeRef    = useRef('');
  const isMountedRef          = useRef(false);
  const soundEnabledRef       = useRef(soundEnabled);
  const continuousModeRef     = useRef(continuousMode);
  const selectedCameraIdRef   = useRef(selectedCameraId);
  const fileInputRef          = useRef(null);

  // Keep refs in sync
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { continuousModeRef.current = continuousMode; }, [continuousMode]);
  useEffect(() => { selectedCameraIdRef.current = selectedCameraId; }, [selectedCameraId]);

  const playBeep = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1150, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      /* ignore audio context errors */
    }
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
    try { 
      instance.clear(); 
    } catch (e) { /* ignore clear errors */ }
    if (isMountedRef.current) {
      setIsScanning(false);
      setIsInitializing(false);
      setTorchOn(false);
      setTorchAvailable(false);
    }
  }, []);

  const startScanner = useCallback(async (cameraIdToUse = null) => {
    if (!isMountedRef.current) return;

    // Ensure any running scanner is stopped and cleared
    await stopScanner();

    // Small delay to allow DOM render
    await new Promise(r => setTimeout(r, 200));
    if (!isMountedRef.current) return;

    const regionEl = document.getElementById(SCANNER_REGION_ID);
    if (!regionEl) return;

    setIsInitializing(true);
    setScanError(null);
    setTorchOn(false);
    setTorchAvailable(false);

    // 1. Discover available cameras if not loaded yet
    let availableCameras = [];
    try {
      availableCameras = await Html5Qrcode.getCameras();
      if (isMountedRef.current && Array.isArray(availableCameras) && availableCameras.length > 0) {
        setCameras(availableCameras);
      }
    } catch (e) {
      console.warn('Could not enumerate cameras:', e);
    }

    // Determine camera target
    let targetCamera = cameraIdToUse || selectedCameraIdRef.current;
    if (!targetCamera && availableCameras && availableCameras.length > 0) {
      const backCam = availableCameras.find(c =>
        /back|rear|environment|outward|isight|world/i.test(c.label)
      );
      targetCamera = backCam ? backCam.id : availableCameras[0].id;
      if (isMountedRef.current) {
        setSelectedCameraId(targetCamera);
        selectedCameraIdRef.current = targetCamera;
      }
    }

    // 2. Instantiate Html5Qrcode with all barcode formats and native BarcodeDetector enabled
    const instance = new Html5Qrcode(SCANNER_REGION_ID, {
      formatsToSupport: ALL_BARCODE_FORMATS,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true,
      },
      verbose: false,
    });
    scannerRef.current = instance;

    // 3. Scan configuration with wide qrbox to ensure 1D barcode margins and 2D QR codes fit
    const config = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const w = Math.min(viewfinderWidth - 10, Math.max(260, Math.floor(viewfinderWidth * 0.94)));
        const h = Math.min(viewfinderHeight - 10, Math.max(150, Math.floor(viewfinderHeight * 0.78)));
        return { width: Math.round(w), height: Math.round(h) };
      },
      disableFlip: false,
    };

    const onSuccess = (text) => {
      if (!isMountedRef.current) return;
      const trimmed = String(text || '').trim();
      if (!trimmed) return;

      const now = Date.now();
      // Debounce: allow immediate detection of different items, debounce identical item within 1.5s
      if (trimmed === lastScannedCodeRef.current && now - lastScanTimeRef.current < 1500) {
        return;
      }
      if (now - lastScanTimeRef.current < 300) {
        return;
      }

      lastScanTimeRef.current = now;
      lastScannedCodeRef.current = trimmed;

      playBeep();

      const match = (Array.isArray(products) ? products : [])
        .filter(Boolean)
        .find(p => {
          const pCode = String(p.barcode || '').trim();
          return pCode === trimmed || (p.id && String(p.id).trim() === trimmed);
        });

      setLastScanned({ 
        code: trimmed, 
        product: match || null, 
        time: new Date().toLocaleTimeString() 
      });

      if (onScanSuccess) {
        onScanSuccess(trimmed, match);
      }
      if (!continuousModeRef.current) {
        onClose();
      }
    };

    // 4. Try starting with prioritized options
    let started = false;

    // Try target cameraId
    if (targetCamera) {
      try {
        await instance.start(targetCamera, config, onSuccess, () => {});
        started = true;
      } catch (err) {
        console.warn('Failed camera start by ID, trying environment facingMode:', err);
      }
    }

    // Try environment facing mode
    if (!started) {
      try {
        await instance.start({ facingMode: 'environment' }, config, onSuccess, () => {});
        started = true;
      } catch (err) {
        console.warn('Failed facingMode environment, trying user facingMode:', err);
      }
    }

    // Try user facing mode (laptop webcam / front camera)
    if (!started) {
      try {
        await instance.start({ facingMode: 'user' }, config, onSuccess, () => {});
        started = true;
      } catch (err) {
        console.error('All camera initialization attempts failed:', err);
      }
    }

    if (!isMountedRef.current) return;

    if (started) {
      setIsScanning(true);
      setIsInitializing(false);
      setScanError(null);

      // Check torch capabilities
      try {
        const caps = instance.getRunningTrackCapabilities();
        if (caps && ('torch' in caps || (caps && caps.torch))) {
          setTorchAvailable(true);
        }
      } catch (e) {
        /* ignore capability inspection */
      }
    } else {
      scannerRef.current = null;
      setIsScanning(false);
      setIsInitializing(false);
      setScanError('Camera unavailable or permission denied. Select another camera, upload a barcode photo, or enter manually.');
    }
  }, [products, onClose, onScanSuccess, playBeep, stopScanner]);

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
      lastScannedCodeRef.current = '';
      const timer = setTimeout(() => {
        if (isMountedRef.current) startScanner();
      }, 300);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCameraChange = async (e) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    selectedCameraIdRef.current = newId;
    await stopScanner();
    startScanner(newId);
  };

  const toggleTorch = async () => {
    const instance = scannerRef.current;
    if (!instance || !torchAvailable) return;
    try {
      const nextTorch = !torchOn;
      await instance.applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setIsProcessingFile(true);
    setScanError(null);

    try {
      const fileScanner = new Html5Qrcode(FILE_SCANNER_REGION_ID, {
        formatsToSupport: ALL_BARCODE_FORMATS,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });

      const decodedText = await fileScanner.scanFile(file, /* showImage= */ false);
      try { fileScanner.clear(); } catch (err) { /* ignore */ }

      const trimmed = String(decodedText || '').trim();
      if (trimmed) {
        playBeep();
        const match = (Array.isArray(products) ? products : [])
          .filter(Boolean)
          .find(p => {
            const pCode = String(p.barcode || '').trim();
            return pCode === trimmed || (p.id && String(p.id).trim() === trimmed);
          });

        setLastScanned({
          code: trimmed,
          product: match || null,
          time: new Date().toLocaleTimeString(),
        });

        if (onScanSuccess) onScanSuccess(trimmed, match);
        if (!continuousMode) onClose();
      }
    } catch (err) {
      setScanError('No barcode or ISBN recognized in the uploaded picture. Try a clearer image or use manual entry.');
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;

    const match = (Array.isArray(products) ? products : [])
      .filter(Boolean)
      .find(p => {
        const pCode = String(p.barcode || '').trim();
        return pCode === trimmed || (p.id && String(p.id).trim() === trimmed);
      });

    setLastScanned({ 
      code: trimmed, 
      product: match || null, 
      time: new Date().toLocaleTimeString() 
    });

    if (onScanSuccess) onScanSuccess(trimmed, match);
    setManualCode('');
    if (!continuousMode) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>

        {/* CSS for clean scanner region rendering */}
        <style>{`
          #${SCANNER_REGION_ID} {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            position: relative !important;
            background: #000 !important;
          }
          #${SCANNER_REGION_ID} canvas { display: none !important; }
          #${SCANNER_REGION_ID} video { 
            width: 100% !important; 
            height: 100% !important; 
            object-fit: contain !important; 
            border-radius: 8px;
          }
          #${SCANNER_REGION_ID} img { display: none !important; }
          #${SCANNER_REGION_ID} > div { 
            border: none !important; 
            box-shadow: none !important;
            background: transparent !important;
          }
          #${SCANNER_REGION_ID} > div > div { display: none !important; }
          #${FILE_SCANNER_REGION_ID} { display: none; }
        `}</style>

        {/* Hidden region for file scanning */}
        <div id={FILE_SCANNER_REGION_ID} />
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*" 
          style={{ display: 'none' }} 
          onChange={handleFileUpload} 
        />

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              padding: '0.35rem',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <BarcodeIcon size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Barcode & ISBN Scanner</h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
                Point camera at 1D Barcode, ISBN, or QR code
              </p>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* Controls Bar */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            background: 'var(--bg-surface-elevated)',
            padding: '0.5rem 0.8rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={e => setContinuousMode(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
              />
              Continuous Scan
            </label>

            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              {/* Camera Switcher Dropdown (if multiple cameras detected) */}
              {cameras.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <SwitchCamera size={14} color="var(--text-muted)" />
                  <select
                    className="form-control"
                    value={selectedCameraId}
                    onChange={handleCameraChange}
                    style={{
                      padding: '0.2rem 0.4rem',
                      fontSize: '0.75rem',
                      height: '28px',
                      maxWidth: '130px',
                      borderRadius: 'var(--radius-sm)'
                    }}
                    title="Switch Camera Device"
                  >
                    {cameras.map((c, i) => (
                      <option key={c.id || i} value={c.id}>
                        {c.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Torch button (if supported by hardware) */}
              {torchAvailable && (
                <button
                  type="button"
                  className="btn-icon"
                  onClick={toggleTorch}
                  style={{ 
                    width: '28px', 
                    height: '28px', 
                    background: torchOn ? 'var(--accent-amber-light)' : 'transparent',
                    color: torchOn ? 'var(--accent-amber)' : 'inherit'
                  }}
                  title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                >
                  {torchOn ? <Zap size={14} /> : <ZapOff size={14} />}
                </button>
              )}

              {/* Sound toggle */}
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSoundEnabled(s => !s)}
                style={{ width: '28px', height: '28px' }}
                title="Toggle Beep Sound"
              >
                {soundEnabled ? <Volume2 size={15} color="var(--primary)" /> : <VolumeX size={15} />}
              </button>

              {/* Upload photo of barcode */}
              <button
                type="button"
                className="btn-icon"
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                disabled={isProcessingFile}
                style={{ width: '28px', height: '28px' }}
                title="Scan from Image File / Photo"
              >
                {isProcessingFile ? <Loader size={14} className="spin" /> : <Upload size={14} />}
              </button>

              {/* Restart Camera */}
              <button
                type="button"
                className="btn-icon"
                onClick={() => { stopScanner().then(() => startScanner(selectedCameraId)); }}
                style={{ width: '28px', height: '28px' }}
                title="Restart Camera"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Camera Viewfinder */}
          <div style={{
            position: 'relative',
            width: '100%',
            height: '270px',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
          }}>
            {/* Scanner region */}
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
                {/* Vignette */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)'
                }} />

                {/* Target box */}
                <div style={{
                  position: 'relative',
                  width: '86%',
                  height: '62%',
                  border: '2px solid rgba(16, 185, 129, 0.75)',
                  borderRadius: '10px',
                  boxShadow: '0 0 0 1px rgba(16,185,129,0.25), inset 0 0 25px rgba(16,185,129,0.06)'
                }}>
                  {/* Corner accents */}
                  {[
                    { top: -2, left: -2, borderTop: '3px solid #10b981', borderLeft: '3px solid #10b981' },
                    { top: -2, right: -2, borderTop: '3px solid #10b981', borderRight: '3px solid #10b981' },
                    { bottom: -2, left: -2, borderBottom: '3px solid #10b981', borderLeft: '3px solid #10b981' },
                    { bottom: -2, right: -2, borderBottom: '3px solid #10b981', borderRight: '3px solid #10b981' },
                  ].map((s, i) => (
                    <div key={i} style={{ position: 'absolute', width: '22px', height: '22px', borderRadius: '3px', ...s }} />
                  ))}

                  {/* Animated laser scan line */}
                  <div style={{
                    position: 'absolute',
                    left: '3%',
                    right: '3%',
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, #ef4444, #f43f5e, #ef4444, transparent)',
                    boxShadow: '0 0 10px #f43f5e',
                    animation: 'scanLaser 2s ease-in-out infinite'
                  }} />

                  {/* Aim helper text */}
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    fontSize: '0.68rem',
                    color: 'rgba(255,255,255,0.7)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    letterSpacing: '0.3px',
                    fontWeight: 500
                  }}>
                    Hold barcode inside this box (15–20cm away)
                  </div>
                </div>
              </div>
            )}

            {/* Initializing spinner */}
            {isInitializing && !scanError && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: '#fff', gap: '0.6rem',
                background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(3px)'
              }}>
                <div style={{
                  width: '38px', height: '38px', border: '3px solid rgba(255,255,255,0.15)',
                  borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }} />
                <span style={{ fontSize: '0.84rem', fontWeight: 500 }}>Connecting to camera…</span>
              </div>
            )}

            {/* Processing image file spinner */}
            {isProcessingFile && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: '#fff', gap: '0.6rem',
                background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(3px)'
              }}>
                <div style={{
                  width: '38px', height: '38px', border: '3px solid rgba(255,255,255,0.15)',
                  borderTopColor: 'var(--accent-amber)', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }} />
                <span style={{ fontSize: '0.84rem', fontWeight: 500 }}>Analyzing barcode image…</span>
              </div>
            )}

            {/* Error overlay */}
            {scanError && !isInitializing && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.94)',
                padding: '1.25rem', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)'
              }}>
                <AlertCircle size={34} color="var(--accent-amber)" style={{ marginBottom: '0.5rem' }} />
                <p style={{ fontSize: '0.82rem', marginBottom: '0.75rem', lineHeight: 1.4, color: 'var(--text-main)' }}>
                  {scanError}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => startScanner(selectedCameraId)}
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                  >
                    <RefreshCw size={13} /> Retry Camera
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                  >
                    <Upload size={13} /> Upload Photo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Keyframe animations */}
          <style>{`
            @keyframes scanLaser { 0%,100% { top: 12%; opacity: 0.6; } 50% { top: 82%; opacity: 1; } }
            @keyframes spin { to { transform: rotate(360deg); } }
            .spin { animation: spin 0.8s linear infinite; }
          `}</style>

          {/* Last Scanned Result Display */}
          {lastScanned && (
            <div style={{
              background: lastScanned.product ? 'var(--accent-emerald-light)' : 'var(--accent-amber-light)',
              border: `1px solid ${lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem'
            }}>
              <div>
                <div style={{ 
                  fontSize: '0.7rem', 
                  fontWeight: 700, 
                  color: lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)', 
                  textTransform: 'uppercase', 
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}>
                  <span>{lastScanned.product ? '✓ Matched in catalogue' : '⚠ Code Captured (Not in catalogue)'}</span>
                  <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>• {lastScanned.time}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                  {lastScanned.product ? lastScanned.product.product_name : `Scanned Code: ${lastScanned.code}`}
                </div>
                {lastScanned.product ? (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    GH₵ {parseFloat(lastScanned.product.retail_price || 0).toFixed(2)} • Stock: {lastScanned.product.stock_quantity} • ISBN: {lastScanned.code}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Barcode: {lastScanned.code} (Ready to add/process)
                  </div>
                )}
              </div>
              <CheckCircle2 size={24} color={lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)'} />
            </div>
          )}

          {/* Manual Entry Form */}
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="text"
              className="form-control"
              inputMode="numeric"
              placeholder="Or type/paste barcode (or use USB scanner)"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
            />
            <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}>
              Submit
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
