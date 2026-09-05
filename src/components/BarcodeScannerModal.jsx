import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  X, Volume2, VolumeX, RefreshCw, CheckCircle2, AlertCircle, 
  Barcode as BarcodeIcon, Camera, Zap, ZapOff, Upload, SwitchCamera, Loader,
  Image as ImageIcon, Sparkles, Aperture
} from 'lucide-react';
import { 
  detectFromVideoFrame, 
  decodeBarcodeFromImageOrCanvas, 
  isNativeBarcodeDetectorSupported,
  ALL_BARCODE_FORMATS
} from '../services/barcodeScannerService';

const SCANNER_REGION_ID = 'brushwell-barcode-region';
const FILE_SCANNER_REGION_ID = 'brushwell-file-barcode-region';

export default function BarcodeScannerModal({ isOpen, onClose, onScanSuccess, products = [] }) {
  const [manualCode, setManualCode]             = useState('');
  const [continuousMode, setContinuousMode]     = useState(true);
  const [soundEnabled, setSoundEnabled]         = useState(true);
  const [lastScanned, setLastScanned]           = useState(null);
  const [scanError, setScanError]               = useState(null);
  const [isScanning, setIsScanning]             = useState(false);
  const [isInitializing, setIsInitializing]     = useState(false);
  const [cameras, setCameras]                   = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [torchAvailable, setTorchAvailable]     = useState(false);
  const [torchOn, setTorchOn]                   = useState(false);
  const [isProcessingPicture, setIsProcessingPicture] = useState(false);
  const [shutterFlash, setShutterFlash]         = useState(false);

  const scannerRef            = useRef(null);
  const liveIntervalRef       = useRef(null);
  const lastScanTimeRef       = useRef(0);
  const lastScannedCodeRef    = useRef('');
  const isMountedRef          = useRef(false);
  const soundEnabledRef       = useRef(soundEnabled);
  const continuousModeRef     = useRef(continuousMode);
  const selectedCameraIdRef   = useRef(selectedCameraId);
  const fileInputRef          = useRef(null);
  const nativeCameraInputRef  = useRef(null);

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

  const handleBarcodeDecoded = useCallback((rawCode) => {
    if (!isMountedRef.current) return;
    const trimmed = String(rawCode || '').trim();
    if (!trimmed) return;

    const now = Date.now();
    // Allow immediate scanning of different codes (300ms cooldown)
    // Debounce duplicate identical code within 1.5s
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
  }, [products, onClose, onScanSuccess, playBeep]);

  const stopScanner = useCallback(async () => {
    if (liveIntervalRef.current) {
      clearInterval(liveIntervalRef.current);
      liveIntervalRef.current = null;
    }
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

    // 3. Scan configuration with wide horizontal responsive qrbox for book barcodes
    const config = {
      fps: 22,
      qrbox: (viewWidth, viewHeight) => {
        const width = Math.min(Math.floor(viewWidth * 0.90), 650);
        const height = Math.min(Math.floor(viewHeight * 0.54), 380);
        return { width, height };
      },
      disableFlip: false,
    };

    const onSuccess = (text) => {
      handleBarcodeDecoded(text);
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

    // Try environment facing mode with HD resolution for sharp barcode lines
    if (!started) {
      try {
        await instance.start(
          { 
            facingMode: { ideal: 'environment' },
            width: { min: 1280, ideal: 1920 },
            height: { min: 720, ideal: 1080 }
          }, 
          config, 
          onSuccess, 
          () => {}
        );
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

      // Start high-speed native hardware BarcodeDetector loop on video element
      if (isNativeBarcodeDetectorSupported()) {
        if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = setInterval(async () => {
          if (!isMountedRef.current || !scannerRef.current) return;
          const videoEl = document.querySelector(`#${SCANNER_REGION_ID} video`);
          if (videoEl && videoEl.readyState >= 2) {
            const code = await detectFromVideoFrame(videoEl);
            if (code) {
              handleBarcodeDecoded(code);
            }
          }
        }, 65);
      }

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
      setScanError('Live camera unavailable or permission denied. You can snap/upload a picture below or type manually.');
    }
  }, [handleBarcodeDecoded, stopScanner]);

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

  // Decode a canvas or image with multi-pass decoding
  const decodeBarcodeFromImageOrCanvas = async (sourceCanvasOrFile) => {
    return await decodeBarcodeFromImageOrCanvas(sourceCanvasOrFile);
  };

  // Feature: Take a Snapshot from the active live camera view
  const handleSnapLivePicture = async () => {
    if (isProcessingPicture) return;
    const videoEl = document.querySelector(`#${SCANNER_REGION_ID} video`);
    if (!videoEl || videoEl.videoWidth === 0) {
      // If live video is not active, trigger native camera capture instead
      if (nativeCameraInputRef.current) nativeCameraInputRef.current.click();
      return;
    }

    // Trigger shutter flash animation
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 200);

    setIsProcessingPicture(true);
    setScanError(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      const decodedText = await decodeBarcodeFromImageOrCanvas(canvas);
      if (decodedText) {
        handleBarcodeDecoded(decodedText);
      } else {
        setScanError('Barcode not detected in snapshot. Try holding camera closer or use "Take Photo (High-Res)".');
      }
    } catch (err) {
      setScanError('Snapshot capture error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessingPicture(false);
    }
  };

  // Feature: Upload Image / Native Camera Photo Handler
  const handleFileUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setIsProcessingPicture(true);
    setScanError(null);

    try {
      const decodedText = await decodeBarcodeFromImageOrCanvas(file);
      if (decodedText) {
        handleBarcodeDecoded(decodedText);
      } else {
        setScanError('No barcode or ISBN recognized in the picture. Ensure the barcode bars are sharp and well-lit.');
      }
    } catch (err) {
      setScanError('Image processing error: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessingPicture(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;

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

    if (onScanSuccess) onScanSuccess(trimmed, match);
    setManualCode('');
    if (!continuousMode) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>

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
          #${SCANNER_REGION_ID} video { 
            width: 100% !important; 
            height: 100% !important; 
            object-fit: contain !important; 
            border-radius: 8px;
          }
          #${FILE_SCANNER_REGION_ID} { display: none; }
        `}</style>

        {/* Hidden region & input for file scanning */}
        <div id={FILE_SCANNER_REGION_ID} />
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*" 
          style={{ display: 'none' }} 
          onChange={handleFileUpload} 
        />
        {/* Native camera capture for mobile / high-res snapshot */}
        <input 
          type="file" 
          ref={nativeCameraInputRef} 
          accept="image/*" 
          capture="environment" 
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
                Live Auto-Scan or Snap a Picture to capture
              </p>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* Controls Bar */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            background: 'var(--bg-surface-elevated)',
            padding: '0.45rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={e => setContinuousMode(e.target.checked)}
                style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
              />
              Continuous Scan
            </label>

            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              {/* Camera Switcher Dropdown (if multiple cameras detected) */}
              {cameras.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <SwitchCamera size={13} color="var(--text-muted)" />
                  <select
                    className="form-control"
                    value={selectedCameraId}
                    onChange={handleCameraChange}
                    style={{
                      padding: '0.15rem 0.35rem',
                      fontSize: '0.72rem',
                      height: '26px',
                      maxWidth: '120px',
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
                    width: '26px', 
                    height: '26px', 
                    background: torchOn ? 'var(--accent-amber-light)' : 'transparent',
                    color: torchOn ? 'var(--accent-amber)' : 'inherit'
                  }}
                  title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                >
                  {torchOn ? <Zap size={13} /> : <ZapOff size={13} />}
                </button>
              )}

              {/* Sound toggle */}
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSoundEnabled(s => !s)}
                style={{ width: '26px', height: '26px' }}
                title="Toggle Beep Sound"
              >
                {soundEnabled ? <Volume2 size={14} color="var(--primary)" /> : <VolumeX size={14} />}
              </button>

              {/* Restart Camera */}
              <button
                type="button"
                className="btn-icon"
                onClick={() => { stopScanner().then(() => startScanner(selectedCameraId)); }}
                style={{ width: '26px', height: '26px' }}
                title="Restart Camera"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Camera Viewfinder */}
          <div style={{
            position: 'relative',
            width: '100%',
            height: '240px',
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

            {/* Shutter flash animation overlay */}
            {shutterFlash && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: '#fff',
                opacity: 0.85,
                zIndex: 20,
                transition: 'opacity 0.2s'
              }} />
            )}

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
                  width: '88%',
                  height: '65%',
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
                    <div key={i} style={{ position: 'absolute', width: '20px', height: '20px', borderRadius: '3px', ...s }} />
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
                    bottom: '6px',
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    fontSize: '0.66rem',
                    color: 'rgba(255,255,255,0.75)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    letterSpacing: '0.2px',
                    fontWeight: 500
                  }}>
                    Align barcode in frame or click Snap below
                  </div>
                </div>
              </div>
            )}

            {/* Initializing spinner */}
            {isInitializing && !scanError && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: '#fff', gap: '0.5rem',
                background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(3px)'
              }}>
                <div style={{
                  width: '34px', height: '34px', border: '3px solid rgba(255,255,255,0.15)',
                  borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }} />
                <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>Connecting to camera…</span>
              </div>
            )}

            {/* Processing picture spinner */}
            {isProcessingPicture && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', color: '#fff', gap: '0.5rem',
                background: 'rgba(10,15,30,0.88)', backdropFilter: 'blur(4px)', zIndex: 30
              }}>
                <div style={{
                  width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.15)',
                  borderTopColor: 'var(--accent-amber)', borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }} />
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#fff' }}>
                  Analyzing Barcode Photo…
                </span>
              </div>
            )}

            {/* Error overlay */}
            {scanError && !isInitializing && !isProcessingPicture && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.94)',
                padding: '1rem', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)',
                zIndex: 10
              }}>
                <AlertCircle size={32} color="var(--accent-amber)" style={{ marginBottom: '0.4rem' }} />
                <p style={{ fontSize: '0.8rem', marginBottom: '0.65rem', lineHeight: 1.35, color: 'var(--text-main)' }}>
                  {scanError}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => startScanner(selectedCameraId)}
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                  >
                    <RefreshCw size={12} /> Retry Camera
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => nativeCameraInputRef.current && nativeCameraInputRef.current.click()}
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                  >
                    <Camera size={12} /> Take Photo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Photo Capture & Shutter Action Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr',
            gap: '0.4rem'
          }}>
            {/* Primary Snap Live Button */}
            <button
              type="button"
              className="btn-primary"
              onClick={handleSnapLivePicture}
              disabled={isProcessingPicture}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                fontSize: '0.8rem',
                padding: '0.5rem 0.6rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
              }}
              title="Snap the current camera view to decode barcode"
            >
              {isProcessingPicture ? (
                <Loader size={15} className="spin" />
              ) : (
                <Aperture size={15} />
              )}
              <span>Snap Picture</span>
            </button>

            {/* Native High-Res Camera Capture */}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => nativeCameraInputRef.current && nativeCameraInputRef.current.click()}
              disabled={isProcessingPicture}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                fontSize: '0.76rem',
                padding: '0.5rem 0.4rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)'
              }}
              title="Open full camera app to take a photo"
            >
              <Camera size={14} color="var(--primary)" />
              <span>Take Photo</span>
            </button>

            {/* Choose from Gallery / Album */}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={isProcessingPicture}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                fontSize: '0.76rem',
                padding: '0.5rem 0.4rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)'
              }}
              title="Upload existing picture from files/photos"
            >
              <ImageIcon size={14} color="var(--accent-emerald)" />
              <span>From Gallery</span>
            </button>
          </div>

          {/* Keyframe animations */}
          <style>{`
            @keyframes scanLaser { 0%,100% { top: 10%; opacity: 0.5; } 50% { top: 84%; opacity: 1; } }
            @keyframes spin { to { transform: rotate(360deg); } }
            .spin { animation: spin 0.8s linear infinite; }
          `}</style>

          {/* Last Scanned Result Display */}
          {lastScanned && (
            <div style={{
              background: lastScanned.product ? 'var(--accent-emerald-light)' : 'var(--accent-amber-light)',
              border: `1px solid ${lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.6rem 0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem'
            }}>
              <div>
                <div style={{ 
                  fontSize: '0.68rem', 
                  fontWeight: 700, 
                  color: lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)', 
                  textTransform: 'uppercase', 
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}>
                  <span>{lastScanned.product ? '✓ Matched in catalogue' : '✓ Code Captured (Not in catalogue)'}</span>
                  <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>• {lastScanned.time}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                  {lastScanned.product ? lastScanned.product.product_name : `Scanned Code: ${lastScanned.code}`}
                </div>
                {lastScanned.product ? (
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    GH₵ {parseFloat(lastScanned.product.retail_price || 0).toFixed(2)} • Stock: {lastScanned.product.stock_quantity} • ISBN: {lastScanned.code}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
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
              placeholder="Or type/paste barcode / ISBN (or use USB scanner)"
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
