import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  X, Volume2, VolumeX, RefreshCw, CheckCircle2, AlertCircle, 
  Barcode as BarcodeIcon, Camera, Zap, ZapOff, SwitchCamera, Loader,
  Image as ImageIcon, Aperture, Maximize2, Minimize2, Sparkles
} from 'lucide-react';
import { 
  detectFromVideoFrame, 
  decodeLiveVideoFrameFast,
  playBeep,
  decodeBarcodeFromImageOrCanvas
} from '../services/barcodeScannerService';

export default function BarcodeScannerModal({ 
  isOpen, 
  onClose, 
  onScanSuccess, 
  products = [],
  title = 'Barcode & QR Scanner',
  subtitle = 'Point camera at any barcode or ISBN',
  targetProductName = null
}) {
  const [manualCode, setManualCode]                   = useState('');
  const [continuousMode, setContinuousMode]           = useState(false);
  const [soundEnabled, setSoundEnabled]               = useState(true);
  const [lastScanned, setLastScanned]                 = useState(null);
  const [scanError, setScanError]                     = useState(null);
  const [isCameraReady, setIsCameraReady]             = useState(false);
  const [isInitializing, setIsInitializing]           = useState(false);
  const [cameras, setCameras]                         = useState([]);
  const [selectedCameraId, setSelectedCameraId]       = useState('');
  const [facingMode, setFacingMode]                   = useState('environment'); // 'environment' | 'user'
  const [torchAvailable, setTorchAvailable]           = useState(false);
  const [torchOn, setTorchOn]                         = useState(false);
  const [isProcessingPicture, setIsProcessingPicture] = useState(false);
  const [shutterFlash, setShutterFlash]               = useState(false);
  const [scanFlash, setScanFlash]                     = useState(false);
  const [isFullscreen, setIsFullscreen]               = useState(false);

  const videoRef              = useRef(null);
  const streamRef             = useRef(null);
  const liveLoopRef           = useRef(null);
  const lastScanTimeRef       = useRef(0);
  const lastScannedCodeRef    = useRef('');
  const isMountedRef          = useRef(false);
  const soundEnabledRef       = useRef(soundEnabled);
  const continuousModeRef     = useRef(continuousMode);
  const fileInputRef          = useRef(null);
  const nativeCameraInputRef  = useRef(null);
  const onScanSuccessRef      = useRef(onScanSuccess);
  const onCloseRef            = useRef(onClose);

  // Keep refs in sync
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { continuousModeRef.current = continuousMode; }, [continuousMode]);
  useEffect(() => { onScanSuccessRef.current = onScanSuccess; }, [onScanSuccess]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // ─── Camera Stop & Clean up ───────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (liveLoopRef.current) {
      clearInterval(liveLoopRef.current);
      liveLoopRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {
        /* ignore track stop error */
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (isMountedRef.current) {
      setIsCameraReady(false);
      setIsInitializing(false);
      setTorchOn(false);
      setTorchAvailable(false);
    }
  }, []);

  // ─── Barcode Decoded Handler ───────────────────────────────────────────────
  const handleBarcodeDecoded = useCallback((rawCode) => {
    if (!isMountedRef.current) return;
    const trimmed = String(rawCode || '').trim();
    if (!trimmed || trimmed.length < 3) return;

    const now = Date.now();
    // Same barcode cooldown: 900ms
    if (trimmed === lastScannedCodeRef.current && (now - lastScanTimeRef.current < 900)) {
      return;
    }
    // Distinct barcode cooldown: 80ms
    if (now - lastScanTimeRef.current < 80) {
      return;
    }

    lastScanTimeRef.current = now;
    lastScannedCodeRef.current = trimmed;

    // 1. Audio & Haptic confirmation
    if (soundEnabledRef.current) {
      try { playBeep(false); } catch (e) {}
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(80); } catch (e) {}
    }

    // 2. Visual scan reticle flash
    setScanFlash(true);
    setTimeout(() => {
      if (isMountedRef.current) setScanFlash(false);
    }, 400);

    // 3. Match product
    const match = (Array.isArray(products) ? products : [])
      .filter(Boolean)
      .find(p => {
        const pCode = String(p.barcode || '').trim().toLowerCase();
        const pId = p.id ? String(p.id).trim().toLowerCase() : '';
        const target = trimmed.toLowerCase();
        return pCode === target || pId === target;
      });

    setLastScanned({ 
      code: trimmed, 
      product: match || null, 
      time: new Date().toLocaleTimeString() 
    });

    // 4. Fire scan callback
    if (onScanSuccessRef.current) {
      onScanSuccessRef.current(trimmed, match);
    }

    // 5. If not continuous mode, close modal after short visual feedback
    if (!continuousModeRef.current) {
      setTimeout(() => {
        if (isMountedRef.current && onCloseRef.current) {
          onCloseRef.current();
        }
      }, 250);
    }
  }, [products]);

  // ─── Direct MediaStream Camera Launcher (Zero Black-Box Glitches) ───────────
  const startCamera = useCallback(async (cameraIdToUse = null, overrideFacing = null) => {
    stopCamera();
    if (!isMountedRef.current) return;

    setIsInitializing(true);
    setScanError(null);

    const mode = overrideFacing || facingMode;
    const targetCameraId = cameraIdToUse !== undefined ? cameraIdToUse : selectedCameraId;

    try {
      // 1. Discover cameras
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter(d => d.kind === 'videoinput');
          if (isMountedRef.current && videoInputs.length > 0) {
            setCameras(videoInputs);
          }
        } catch (devErr) {
          console.warn('Camera enumeration error:', devErr);
        }
      }

      // 2. Build constraints with mobile/iOS optimizations
      const constraints = {
        video: targetCameraId
          ? { deviceId: { exact: targetCameraId } }
          : {
              facingMode: { ideal: mode },
              width:  { ideal: 1280, min: 640 },
              height: { ideal: 720,  min: 480 }
            },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      // 3. Inspect torch & continuous autofocus capabilities
      try {
        const track = stream.getVideoTracks()[0];
        if (track && track.getCapabilities && track.applyConstraints) {
          const caps = track.getCapabilities();
          if (caps && ('torch' in caps || caps.torch)) {
            setTorchAvailable(true);
          }
          const advanced = {};
          if (caps.focusMode && caps.focusMode.includes('continuous')) {
            advanced.focusMode = 'continuous';
          }
          if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
            advanced.exposureMode = 'continuous';
          }
          if (Object.keys(advanced).length > 0) {
            await track.applyConstraints({ advanced: [advanced] }).catch(() => {});
          }
        }
      } catch (capErr) {
        /* ignore capability inspection error */
      }

      // 4. Attach to native <video> element with iOS Safari WebKit inline playback attributes
      if (videoRef.current) {
        const video = videoRef.current;
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.srcObject = stream;

        try {
          await video.play();
        } catch (playErr) {
          console.warn('video.play() warning:', playErr);
        }

        if (!isMountedRef.current) return;
        setIsCameraReady(true);
        setIsInitializing(false);
        setScanError(null);

        // ─── Continuous Live Detection Loop (Hardware BarcodeDetector + zxing-wasm) ──
        if (liveLoopRef.current) clearInterval(liveLoopRef.current);
        liveLoopRef.current = setInterval(async () => {
          if (!isMountedRef.current || !videoRef.current) return;
          const v = videoRef.current;

          // Auto-resume if iOS Safari paused video
          if (v.paused) {
            v.play().catch(() => {});
            return;
          }
          if (v.readyState < 2 || !v.videoWidth) return;

          // 1. Hardware BarcodeDetector API (~5ms on Android Chromium)
          let code = await detectFromVideoFrame(v);

          // 2. High-speed zxing-wasm C++ WebAssembly (~8-15ms on iOS Safari & Android)
          if (!code) {
            code = await decodeLiveVideoFrameFast(v);
          }

          if (code) {
            handleBarcodeDecoded(code);
          } else {
            // Reset same-code cooldown when camera sees no code for >350ms
            if (Date.now() - lastScanTimeRef.current > 350) {
              lastScannedCodeRef.current = '';
            }
          }
        }, 90); // ~11 fps continuous scanning
      }
    } catch (err) {
      console.error('Camera stream error in BarcodeScannerModal:', err);
      if (isMountedRef.current) {
        setIsCameraReady(false);
        setIsInitializing(false);
        setScanError(
          err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Please allow camera access in your browser or phone settings.'
            : (err.message || 'Camera failed to initialize. You can snap a photo or enter the barcode manually.')
        );
      }
    }
  }, [facingMode, selectedCameraId, stopCamera, handleBarcodeDecoded]);

  // ─── Lifecycle & Open/Close Handlers ───────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (isOpen) {
      setLastScanned(null);
      setScanError(null);
      setManualCode('');
      lastScannedCodeRef.current = '';
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          startCamera();
        }
      }, 150);
      return () => {
        clearTimeout(timer);
        stopCamera();
      };
    } else {
      stopCamera();
    }
  }, [isOpen, startCamera, stopCamera]);

  // ─── Camera Controls (Torch, Facing Mode, Device Selection) ───────────────
  const toggleTorch = async () => {
    if (!streamRef.current || !torchAvailable) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setTorchOn(nextState);
      }
    } catch (e) {
      console.warn('Could not toggle flashlight:', e);
    }
  };

  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    setSelectedCameraId('');
    await startCamera('', nextFacing);
  };

  const handleCameraChange = async (e) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    await startCamera(newId);
  };

  // ─── Still Image / High-Res Photo Fallback ─────────────────────────────────
  const handleSnapLivePicture = async () => {
    if (!videoRef.current || isProcessingPicture) return;
    setIsProcessingPicture(true);
    setShutterFlash(true);
    setTimeout(() => {
      if (isMountedRef.current) setShutterFlash(false);
    }, 180);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      const decodedText = await decodeBarcodeFromImageOrCanvas(canvas);
      if (decodedText) {
        handleBarcodeDecoded(decodedText);
      } else {
        setScanError('No barcode or ISBN recognized in this frame. Ensure the barcode is clear, sharp, and well-lit.');
      }
    } catch (err) {
      setScanError('Image processing error: ' + (err.message || 'Unknown error'));
    } finally {
      if (isMountedRef.current) setIsProcessingPicture(false);
    }
  };

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
      if (isMountedRef.current) {
        setIsProcessingPicture(false);
      }
      if (e.target) e.target.value = '';
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;

    if (soundEnabledRef.current) {
      try { playBeep(false); } catch (err) {}
    }

    const match = (Array.isArray(products) ? products : [])
      .filter(Boolean)
      .find(p => {
        const pCode = String(p.barcode || '').trim().toLowerCase();
        const pId = p.id ? String(p.id).trim().toLowerCase() : '';
        const target = trimmed.toLowerCase();
        return pCode === target || pId === target;
      });

    setLastScanned({ 
      code: trimmed, 
      product: match || null, 
      time: new Date().toLocaleTimeString() 
    });

    if (onScanSuccessRef.current) {
      onScanSuccessRef.current(trimmed, match);
    }
    setManualCode('');
    if (!continuousModeRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose} 
      style={{ 
        zIndex: 11000, // Strictly higher than edit product modal (10000)
        padding: isFullscreen ? 0 : '0.75rem',
        background: isFullscreen ? '#000' : 'rgba(0, 0, 0, 0.75)'
      }}
    >
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: isFullscreen ? '100vw' : '540px',
          width: isFullscreen ? '100vw' : '100%',
          height: isFullscreen ? '100vh' : 'auto',
          maxHeight: isFullscreen ? '100vh' : '90vh',
          borderRadius: isFullscreen ? '0' : 'var(--radius-lg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: isFullscreen ? 'none' : '1px solid var(--border-light)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
        }}
      >
        {/* CSS Keyframe Animations for Laser Sweep & Reticle Flash */}
        <style>{`
          @keyframes sweepLaser {
            0% { top: 12%; opacity: 0.85; }
            50% { top: 88%; opacity: 1; }
            100% { top: 12%; opacity: 0.85; }
          }
          @keyframes spinLoader {
            to { transform: rotate(360deg); }
          }
          .scanner-spin {
            animation: spinLoader 0.8s linear infinite;
          }
        `}</style>

        {/* Hidden inputs for gallery & mobile camera capture fallback */}
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="image/*" 
          style={{ display: 'none' }} 
          onChange={handleFileUpload} 
        />
        <input 
          type="file" 
          ref={nativeCameraInputRef} 
          accept="image/*" 
          capture="environment" 
          style={{ display: 'none' }} 
          onChange={handleFileUpload} 
        />

        {/* ─── Modal Header ─────────────────────────────────────────────────── */}
        <div 
          className="modal-header" 
          style={{ 
            flexShrink: 0, 
            padding: '0.8rem 1rem',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-light)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
              color: '#fff',
              padding: '0.42rem',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 6px var(--primary-glow)'
            }}>
              <BarcodeIcon size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {title}
              </h3>
              <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {targetProductName ? (
                  <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                    Target: {targetProductName}
                  </span>
                ) : subtitle}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
            {/* Fullscreen Toggle */}
            <button 
              type="button" 
              className="btn-icon" 
              onClick={() => setIsFullscreen(!isFullscreen)} 
              title={isFullscreen ? 'Exit Fullscreen' : 'Expand Fullscreen Camera'}
              style={{ width: '32px', height: '32px' }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            {/* Close Modal Button */}
            <button 
              type="button" 
              className="btn-icon" 
              onClick={onClose} 
              title="Close Scanner"
              style={{ width: '32px', height: '32px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── Modal Body ───────────────────────────────────────────────────── */}
        <div 
          className="modal-body" 
          style={{ 
            padding: isFullscreen ? '0.75rem' : '0.85rem', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.65rem',
            overflowY: 'auto',
            flex: 1
          }}
        >
          {/* Controls Bar (Continuous, Camera Switcher, Torch, Sound, Restart) */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.4rem',
            background: 'var(--bg-surface-elevated)',
            padding: '0.4rem 0.65rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
            flexShrink: 0
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={continuousMode}
                onChange={e => setContinuousMode(e.target.checked)}
                style={{ width: '15px', height: '15px', accentColor: 'var(--primary)' }}
              />
              Continuous Scan
            </label>

            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              {/* Camera Switcher Dropdown (if multiple devices) */}
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
                      maxWidth: '125px',
                      borderRadius: 'var(--radius-sm)'
                    }}
                    title="Switch Camera Device"
                  >
                    {cameras.map((c, i) => (
                      <option key={c.deviceId || i} value={c.deviceId}>
                        {c.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Camera Flip (Back / Front) */}
              <button
                type="button"
                className="btn-icon"
                onClick={toggleCameraFacing}
                style={{ width: '28px', height: '28px' }}
                title={`Switch to ${facingMode === 'environment' ? 'Front' : 'Back'} Camera`}
              >
                <SwitchCamera size={14} />
              </button>

              {/* Torch button (if supported) */}
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

              {/* Sound Beep Toggle */}
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSoundEnabled(s => !s)}
                style={{ width: '28px', height: '28px' }}
                title={soundEnabled ? 'Mute Beep' : 'Unmute Beep'}
              >
                {soundEnabled ? <Volume2 size={14} color="var(--primary)" /> : <VolumeX size={14} />}
              </button>

              {/* Restart Camera */}
              <button
                type="button"
                className="btn-icon"
                onClick={() => startCamera(selectedCameraId)}
                style={{ width: '28px', height: '28px' }}
                title="Restart Camera Stream"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* ─── Direct Camera Viewfinder (Native <video> Stream) ─────────────── */}
          <div style={{
            position: 'relative',
            width: '100%',
            height: isFullscreen ? 'calc(100vh - 230px)' : '250px',
            minHeight: '220px',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background: '#090d16',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 0 25px rgba(0,0,0,0.85)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            flexShrink: 0
          }}>
            {/* Native HTML5 Video Element */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: isCameraReady ? 'block' : 'none',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
              }}
            />

            {/* Shutter flash overlay when snapshot is taken */}
            {shutterFlash && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: '#fff',
                opacity: 0.85,
                zIndex: 25,
                pointerEvents: 'none'
              }} />
            )}

            {/* Holographic Viewfinder Reticle with Laser Beam */}
            {isCameraReady && !scanError && (
              <div style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10
              }}>
                {/* Vignette Shadow */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'radial-gradient(ellipse at center, transparent 48%, rgba(0,0,0,0.72) 100%)'
                }} />

                {/* Reticle Target Box */}
                <div style={{
                  position: 'relative',
                  width: '84%',
                  maxWidth: '420px',
                  height: '68%',
                  maxHeight: '190px',
                  border: scanFlash 
                    ? '3px solid var(--accent-emerald)' 
                    : '2px solid rgba(255, 255, 255, 0.4)',
                  borderRadius: '16px',
                  boxShadow: scanFlash 
                    ? '0 0 35px rgba(16, 185, 129, 0.85), inset 0 0 20px rgba(16, 185, 129, 0.4)' 
                    : '0 0 15px rgba(0,0,0,0.5)',
                  transition: 'border 0.15s, box-shadow 0.15s',
                  overflow: 'hidden'
                }}>
                  {/* Glowing Corner Brackets */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '22px', height: '22px', borderTop: '4px solid #10b981', borderLeft: '4px solid #10b981', borderTopLeftRadius: '14px' }} />
                  <div style={{ position: 'absolute', top: 0, right: 0, width: '22px', height: '22px', borderTop: '4px solid #10b981', borderRight: '4px solid #10b981', borderTopRightRadius: '14px' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: '22px', height: '22px', borderBottom: '4px solid #10b981', borderLeft: '4px solid #10b981', borderBottomLeftRadius: '14px' }} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: '22px', height: '22px', borderBottom: '4px solid #10b981', borderRight: '4px solid #10b981', borderBottomRightRadius: '14px' }} />

                  {/* Animated Sweeping Laser Scan Line */}
                  {!scanFlash && (
                    <div style={{
                      position: 'absolute',
                      left: '3%',
                      right: '3%',
                      height: '2.5px',
                      background: 'linear-gradient(90deg, transparent, #10b981, #38bdf8, #10b981, transparent)',
                      boxShadow: '0 0 10px #10b981, 0 0 3px #fff',
                      animation: 'sweepLaser 2.2s ease-in-out infinite'
                    }} />
                  )}

                  {/* Scan Flash Feedback */}
                  {scanFlash && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(16, 185, 129, 0.3)',
                      backdropFilter: 'blur(1px)'
                    }} />
                  )}

                  {/* Aim Helper Badge */}
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: 0,
                    right: 0,
                    textAlign: 'center',
                    fontSize: '0.7rem',
                    color: '#fff',
                    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                    fontWeight: 600,
                    letterSpacing: '0.2px'
                  }}>
                    Align Barcode or QR Code in frame
                  </div>
                </div>
              </div>
            )}

            {/* Connecting Spinner */}
            {isInitializing && !scanError && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                gap: '0.5rem',
                background: 'rgba(10, 15, 30, 0.9)',
                zIndex: 20
              }}>
                <Loader size={32} className="scanner-spin" color="var(--primary)" />
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Starting HD Camera Stream…</span>
              </div>
            )}

            {/* Picture Processing Spinner */}
            {isProcessingPicture && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                gap: '0.5rem',
                background: 'rgba(10, 15, 30, 0.92)',
                zIndex: 30
              }}>
                <Loader size={34} className="scanner-spin" color="var(--accent-amber)" />
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#fff' }}>
                  Decoding Barcode from Image…
                </span>
              </div>
            )}

            {/* Error Overlay */}
            {scanError && !isInitializing && !isProcessingPicture && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.96)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'var(--text-muted)',
                zIndex: 20
              }}>
                <AlertCircle size={32} color="var(--accent-amber)" style={{ marginBottom: '0.4rem' }} />
                <p style={{ fontSize: '0.82rem', marginBottom: '0.75rem', lineHeight: 1.4, color: 'var(--text-main)', maxWidth: '380px' }}>
                  {scanError}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => startCamera(selectedCameraId)}
                    style={{ fontSize: '0.76rem', padding: '0.35rem 0.75rem' }}
                  >
                    <RefreshCw size={12} /> Retry Camera
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => nativeCameraInputRef.current && nativeCameraInputRef.current.click()}
                    style={{ fontSize: '0.76rem', padding: '0.35rem 0.75rem' }}
                  >
                    <Camera size={12} /> Snap Photo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─── Photo Capture Fallback Actions ───────────────────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr',
            gap: '0.4rem',
            flexShrink: 0
          }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSnapLivePicture}
              disabled={isProcessingPicture || !isCameraReady}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                padding: '0.48rem 0.5rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-md)'
              }}
              title="Capture current video frame to decode"
            >
              <Aperture size={15} />
              <span>Snap Frame</span>
            </button>

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
                padding: '0.48rem 0.4rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)'
              }}
              title="Use native mobile camera app to take a high-res photo"
            >
              <Camera size={14} color="var(--primary)" />
              <span>Take Photo</span>
            </button>

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
                padding: '0.48rem 0.4rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)'
              }}
              title="Upload photo or image of barcode from gallery"
            >
              <ImageIcon size={14} color="var(--accent-emerald)" />
              <span>From Files</span>
            </button>
          </div>

          {/* ─── Last Scanned Result Banner ───────────────────────────────────── */}
          {lastScanned && (
            <div style={{
              background: lastScanned.product ? 'var(--accent-emerald-light)' : 'var(--accent-amber-light)',
              border: `1px solid ${lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.55rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              flexShrink: 0
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
                  <span>{lastScanned.product ? '✓ Matched Product' : '✓ Scanned Barcode'}</span>
                  <span style={{ opacity: 0.6, fontSize: '0.65rem' }}>• {lastScanned.time}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                  {lastScanned.product ? lastScanned.product.product_name : `Barcode: ${lastScanned.code}`}
                </div>
                {lastScanned.product && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    GH₵ {parseFloat(lastScanned.product.retail_price || 0).toFixed(2)} • Barcode: {lastScanned.code}
                  </div>
                )}
              </div>
              <CheckCircle2 size={22} color={lastScanned.product ? 'var(--accent-emerald)' : 'var(--accent-amber)'} />
            </div>
          )}

          {/* ─── Manual Code Input Fallback ──────────────────────────────────── */}
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            <input
              type="text"
              className="form-control"
              placeholder="Type / paste barcode or use USB scanner..."
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
            />
            <button 
              type="submit" 
              className="btn-primary" 
              style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}
            >
              Use Code
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
