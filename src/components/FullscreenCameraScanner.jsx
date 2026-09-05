// FullscreenCameraScanner.jsx — Brushwell POS
// Entire-screen camera POS scanning interface with continuous auto-capture,
// instant add-to-cart, holographic reticle, and direct-to-checkout live dock.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Camera, ShoppingCart, ArrowRight, Zap, ZapOff, 
  Volume2, VolumeX, RefreshCw, LayoutGrid, CheckCircle2,
  AlertCircle, Plus
} from 'lucide-react';
import { 
  CORE_RETAIL_BARCODE_FORMATS, 
  detectFromVideoFrame, 
  playBeep 
} from '../services/barcodeScannerService';

const SCANNER_DOM_ID = 'brushwell-fullscreen-scanner';

export default function FullscreenCameraScanner({
  products = [],
  cart = [],
  priceMode = 'retail',
  setPriceMode,
  onAddToCart,
  onOpenCart,
  onCheckout,
  onSwitchToCatalog,
  onQuickRegister,
  currencySymbol = 'GH₵',
  isPaused = false
}) {
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [isCameraStarting, setIsCameraStarting] = useState(true);
  const [cameraError, setCameraError] = useState(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Scan HUD feedback
  const [scanFlash, setScanFlash] = useState(false);
  const [lastNotification, setLastNotification] = useState(null); // { type, message, product, code }

  const scannerRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastScanCodeRef = useRef('');
  const lastScanTimeRef = useRef(0);
  const liveLoopRef = useRef(null);
  const notifTimerRef = useRef(null);

  // Calculate live cart total
  const cartItemCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const cartTotal = cart.reduce((sum, item) => {
    const mode = item.priceMode || priceMode;
    const base = mode === 'wholesale' ? (item.wholesale_price || 0) : (item.retail_price || 0);
    const disc = Math.max(0, parseFloat(item.discount) || 0);
    const unitPrice = Math.max(0, base - disc);
    return sum + unitPrice * (item.quantity || 1);
  }, 0);

  // ─── Barcode Scanned Event Handler ─────────────────────────────────────────

  const handleBarcodeDetected = useCallback((rawCode) => {
    if (isPaused) return;

    const trimmed = String(rawCode || '').trim();
    if (!trimmed || trimmed.length < 3) return;

    const now = Date.now();
    // Prevent duplicate scans within 1.2s for identical code
    if (trimmed === lastScanCodeRef.current && now - lastScanTimeRef.current < 1200) {
      return;
    }
    // Prevent rapid misfires across different codes within 350ms
    if (now - lastScanTimeRef.current < 350) {
      return;
    }

    lastScanTimeRef.current = now;
    lastScanCodeRef.current = trimmed;

    // Lookup product in inventory by barcode or ID
    const clean = trimmed.toLowerCase();
    const matched = products.find(p => 
      (p && p.barcode && String(p.barcode).trim().toLowerCase() === clean) ||
      (p && p.id && String(p.id).trim().toLowerCase() === clean)
    );

    if (matched) {
      // 1. Audio & Haptic confirmation
      if (soundEnabled) playBeep(false);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(80);
      }

      // 2. Visual Reticle Flash
      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 400);

      // 3. Add to Cart
      if (onAddToCart) onAddToCart(matched);

      // 4. Show HUD toast
      const inCart = cart.find(c => c.id === matched.id);
      const newQty = (inCart?.quantity || 0) + 1;
      const unitPrice = priceMode === 'wholesale' ? (matched.wholesale_price || 0) : (matched.retail_price || 0);

      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      setLastNotification({
        type: 'success',
        product: matched,
        code: trimmed,
        message: `Added: ${matched.product_name}`,
        subMessage: `${currencySymbol}${unitPrice.toFixed(2)} · Cart: ×${newQty}`
      });
      notifTimerRef.current = setTimeout(() => setLastNotification(null), 3500);

    } else {
      // Unmatched / Unknown Barcode
      if (soundEnabled) playBeep(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([70, 50, 70]);
      }

      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 400);

      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      setLastNotification({
        type: 'unmatched',
        code: trimmed,
        message: `Barcode "${trimmed}" not in catalog`,
        subMessage: 'Tap below to register this book into inventory'
      });
      notifTimerRef.current = setTimeout(() => setLastNotification(null), 6000);
    }
  }, [isPaused, products, soundEnabled, onAddToCart, cart, priceMode, currencySymbol]);

  // ─── Camera Management ─────────────────────────────────────────────────────

  const stopCamera = useCallback(async () => {
    if (liveLoopRef.current) {
      clearInterval(liveLoopRef.current);
      liveLoopRef.current = null;
    }
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        // Ignore stop errors on unmount
      }
      scannerRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (cameraIdToUse = null) => {
    await stopCamera();

    await new Promise(r => setTimeout(r, 150));
    if (!isMountedRef.current) return;

    const el = document.getElementById(SCANNER_DOM_ID);
    if (!el) return;

    setIsCameraStarting(true);
    setCameraError(null);
    setTorchOn(false);
    setTorchAvailable(false);

    // Enumerate available cameras
    let availableCams = cameras;
    if (!availableCams || availableCams.length === 0) {
      try {
        availableCams = await Html5Qrcode.getCameras();
        if (isMountedRef.current && Array.isArray(availableCams) && availableCams.length > 0) {
          setCameras(availableCams);
        }
      } catch (e) {
        console.warn('Camera enumeration error:', e);
      }
    }

    // Determine target camera
    let target = cameraIdToUse || selectedCameraId;
    if (!target && availableCams && availableCams.length > 0) {
      const backCam = availableCams.find(c => 
        /back|rear|environment|outward|isight|world/i.test(c.label)
      );
      target = backCam ? backCam.id : availableCams[0].id;
      setSelectedCameraId(target);
    }

    // 1. Initialize Html5Qrcode instance
    const instance = new Html5Qrcode(SCANNER_DOM_ID, {
      formatsToSupport: CORE_RETAIL_BARCODE_FORMATS,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      },
      verbose: false
    });
    scannerRef.current = instance;

    // 2. Broad responsive scanning zone optimized for wide 1D book barcodes & QR codes
    const config = {
      fps: 22,
      qrbox: (viewWidth, viewHeight) => {
        const width = Math.min(Math.floor(viewWidth * 0.90), 650);
        const height = Math.min(Math.floor(viewHeight * 0.54), 380);
        return { width, height };
      },
      disableFlip: false
    };

    let started = false;

    // Try camera by ID
    if (target) {
      try {
        await instance.start(target, config, handleBarcodeDetected, () => {});
        started = true;
      } catch (err) {
        console.warn('Starting camera by ID failed, falling back:', err);
      }
    }

    // Try environment mode
    if (!started) {
      try {
        await instance.start(
          { 
            facingMode: { ideal: facingMode },
            width: { min: 1280, ideal: 1920 },
            height: { min: 720, ideal: 1080 }
          },
          config,
          handleBarcodeDetected,
          () => {}
        );
        started = true;
      } catch (err) {
        console.warn('Starting camera by facingMode failed:', err);
      }
    }

    // Try basic start
    if (!started) {
      try {
        await instance.start({ facingMode: 'environment' }, config, handleBarcodeDetected, () => {});
        started = true;
      } catch (err) {
        console.error('All camera start attempts failed:', err);
      }
    }

    if (!isMountedRef.current) return;

    if (started) {
      setIsCameraStarting(false);
      setCameraError(null);

      // Check torch capabilities
      try {
        const caps = instance.getRunningTrackCapabilities();
        if (caps && ('torch' in caps || caps.torch)) {
          setTorchAvailable(true);
        }
      } catch (e) {
        // Torch capability inspection
      }

      // Parallel high-frequency frame detector loop directly on <video> element
      if (liveLoopRef.current) clearInterval(liveLoopRef.current);
      liveLoopRef.current = setInterval(async () => {
        if (!isMountedRef.current || !scannerRef.current || isPaused) return;
        const videoEl = document.querySelector(`#${SCANNER_DOM_ID} video`);
        if (videoEl && videoEl.readyState >= 2) {
          const code = await detectFromVideoFrame(videoEl);
          if (code) {
            handleBarcodeDetected(code);
          }
        }
      }, 60);

    } else {
      setIsCameraStarting(false);
      setCameraError('Unable to start live camera. Please check camera permissions in your browser.');
    }
  }, [cameras, selectedCameraId, facingMode, handleBarcodeDetected, isPaused, stopCamera]);

  // Lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    startCamera();

    return () => {
      isMountedRef.current = false;
      stopCamera();
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch camera facing
  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);

    if (cameras.length > 1) {
      const currentIdx = cameras.findIndex(c => c.id === selectedCameraId);
      const nextIdx = (currentIdx + 1) % cameras.length;
      const nextId = cameras[nextIdx].id;
      setSelectedCameraId(nextId);
      await startCamera(nextId);
    } else {
      await startCamera(null);
    }
  };

  // Toggle Torch Flashlight
  const toggleTorch = async () => {
    if (!scannerRef.current || !torchAvailable) return;
    try {
      const nextState = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: 'calc(100vh - 105px)',
      minHeight: '520px',
      background: '#0a0d14',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 'var(--radius-lg)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)'
    }}>

      {/* ─── 1. Background Video Layer ────────────────────────────────────── */}
      <div 
        id={SCANNER_DOM_ID}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          background: '#000',
          overflow: 'hidden'
        }}
      />

      {/* CSS fix for full-coverage video presentation */}
      <style>{`
        #${SCANNER_DOM_ID} {
          width: 100% !important;
          height: 100% !important;
          border: none !important;
        }
        #${SCANNER_DOM_ID} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          display: block !important;
        }
        #${SCANNER_DOM_ID}__scan_region {
          width: 100% !important;
          height: 100% !important;
        }
        @keyframes sweepLaser {
          0% { top: 8%; opacity: 0.8; }
          50% { top: 92%; opacity: 1; }
          100% { top: 8%; opacity: 0.8; }
        }
        @keyframes pulseGlowRing {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.02); opacity: 1; }
        }
      `}</style>

      {/* ─── 2. Top Controls HUD (Glassmorphism) ────────────────────────────── */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        padding: '0.8rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(180deg, rgba(10, 13, 20, 0.88) 0%, rgba(10, 13, 20, 0.4) 75%, transparent 100%)',
        backdropFilter: 'blur(8px)',
        gap: '0.6rem',
        flexWrap: 'wrap'
      }}>

        {/* Left: View Switcher (Camera POS vs Catalog Grid) */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.12)',
          borderRadius: 'var(--radius-full)',
          padding: '3px',
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}>
          <button
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px var(--primary-glow)'
            }}
          >
            <Camera size={14} /> Fullscreen Scanner
          </button>
          <button
            type="button"
            onClick={onSwitchToCatalog}
            title="Switch to Product Catalog Grid"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.35rem 0.85rem',
              borderRadius: 'var(--radius-full)',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.8)',
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            <LayoutGrid size={14} /> Catalog Grid
          </button>
        </div>

        {/* Center: Price Tier Switcher */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.12)',
          borderRadius: 'var(--radius-md)',
          padding: '2px',
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}>
          <button
            type="button"
            onClick={() => setPriceMode('retail')}
            style={{
              padding: '0.3rem 0.7rem',
              fontSize: '0.74rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              background: priceMode === 'retail' ? 'var(--primary)' : 'transparent',
              color: priceMode === 'retail' ? '#fff' : 'rgba(255, 255, 255, 0.7)'
            }}
          >
            Retail
          </button>
          <button
            type="button"
            onClick={() => setPriceMode('wholesale')}
            style={{
              padding: '0.3rem 0.7rem',
              fontSize: '0.74rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              background: priceMode === 'wholesale' ? 'var(--accent-purple)' : 'transparent',
              color: priceMode === 'wholesale' ? '#fff' : 'rgba(255, 255, 255, 0.7)'
            }}
          >
            Wholesale
          </button>
        </div>

        {/* Right: Camera Tools (Torch, Camera Switch, Audio) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {torchAvailable && (
            <button
              type="button"
              onClick={toggleTorch}
              title={torchOn ? 'Turn Flash Off' : 'Turn Flash On for Low Light'}
              style={{
                background: torchOn ? 'var(--accent-amber)' : 'rgba(255,255,255,0.14)',
                color: torchOn ? '#000' : '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 'var(--radius-full)',
                width: '34px',
                height: '34px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {torchOn ? <Zap size={16} /> : <ZapOff size={16} />}
            </button>
          )}

          <button
            type="button"
            onClick={toggleCameraFacing}
            title="Switch Camera (Back/Front/USB)"
            style={{
              background: 'rgba(255,255,255,0.14)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 'var(--radius-full)',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} />
          </button>

          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Mute Beep Sound' : 'Enable Beep Sound'}
            style={{
              background: 'rgba(255,255,255,0.14)',
              color: soundEnabled ? 'var(--accent-emerald)' : 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 'var(--radius-full)',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>

      </div>

      {/* ─── 3. Center Holographic Barcode Reticle ──────────────────────────── */}
      <div style={{
        position: 'relative',
        zIndex: 5,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        padding: '1rem'
      }}>

        {/* Reticle Container */}
        <div style={{
          position: 'relative',
          width: 'min(88%, 560px)',
          height: 'min(48vh, 260px)',
          border: scanFlash 
            ? '3px solid var(--accent-emerald)' 
            : '2px solid rgba(255, 255, 255, 0.25)',
          borderRadius: '24px',
          boxShadow: scanFlash 
            ? '0 0 45px rgba(16, 185, 129, 0.8), inset 0 0 25px rgba(16, 185, 129, 0.5)' 
            : '0 0 20px rgba(0, 0, 0, 0.6), inset 0 0 15px rgba(0, 0, 0, 0.4)',
          transition: 'border 0.15s, box-shadow 0.15s',
          overflow: 'hidden'
        }}>

          {/* Corner Brackets */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '28px', height: '28px', borderTop: '4px solid var(--accent-emerald)', borderLeft: '4px solid var(--accent-emerald)', borderTopLeftRadius: '20px' }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: '28px', height: '28px', borderTop: '4px solid var(--accent-emerald)', borderRight: '4px solid var(--accent-emerald)', borderTopRightRadius: '20px' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '28px', height: '28px', borderBottom: '4px solid var(--accent-emerald)', borderLeft: '4px solid var(--accent-emerald)', borderBottomLeftRadius: '20px' }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: '28px', height: '28px', borderBottom: '4px solid var(--accent-emerald)', borderRight: '4px solid var(--accent-emerald)', borderBottomRightRadius: '20px' }} />

          {/* Animated Laser Scanning Line */}
          {!scanFlash && (
            <div style={{
              position: 'absolute',
              left: '4%',
              right: '4%',
              height: '3px',
              background: 'linear-gradient(90deg, transparent, #10b981, #38bdf8, #10b981, transparent)',
              boxShadow: '0 0 12px #10b981, 0 0 4px #fff',
              animation: 'sweepLaser 2.2s ease-in-out infinite'
            }} />
          )}

          {/* Flash Effect on Successful Scan */}
          {scanFlash && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(16, 185, 129, 0.28)',
              backdropFilter: 'blur(2px)'
            }} />
          )}

        </div>

        {/* Instruction Badge */}
        <div style={{
          marginTop: '0.85rem',
          background: 'rgba(10, 13, 20, 0.75)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: 'var(--radius-full)',
          padding: '0.4rem 1.1rem',
          color: '#fff',
          fontSize: '0.8rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          boxShadow: '0 4px 15px rgba(0,0,0,0.4)'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--accent-emerald)',
            display: 'inline-block',
            boxShadow: '0 0 8px var(--accent-emerald)'
          }} />
          Point camera at book barcode (ISBN) or QR code
        </div>

      </div>

      {/* ─── 4. Live Scan Notification Toast ───────────────────────────────── */}
      {lastNotification && (
        <div style={{
          position: 'absolute',
          bottom: '88px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 25,
          width: 'min(92%, 460px)',
          background: lastNotification.type === 'success' 
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))' 
            : 'linear-gradient(135deg, rgba(245, 158, 11, 0.96), rgba(217, 119, 6, 0.96))',
          color: '#fff',
          borderRadius: 'var(--radius-lg)',
          padding: '0.75rem 1rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          animation: 'pulseGlowRing 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden' }}>
            {lastNotification.type === 'success' ? (
              <CheckCircle2 size={24} style={{ flexShrink: 0 }} />
            ) : (
              <AlertCircle size={24} style={{ flexShrink: 0 }} />
            )}
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {lastNotification.message}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.95 }}>
                {lastNotification.subMessage}
              </div>
            </div>
          </div>

          {/* Quick Register Action for Unmatched Barcode */}
          {lastNotification.type === 'unmatched' && onQuickRegister && (
            <button
              type="button"
              onClick={() => onQuickRegister(lastNotification.code)}
              style={{
                background: '#fff',
                color: '#b45309',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '0.4rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
              }}
            >
              <Plus size={14} /> Register Book
            </button>
          )}
        </div>
      )}

      {/* ─── 5. Bottom Live Cart & Checkout Dock (Glassmorphism) ───────────── */}
      <div style={{
        position: 'relative',
        zIndex: 20,
        background: 'rgba(10, 13, 20, 0.92)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        padding: '0.75rem 1.1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.8rem',
        flexWrap: 'wrap'
      }}>

        {/* Left: Cart Counter & Total */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            position: 'relative',
            boxShadow: '0 4px 14px var(--primary-glow)'
          }}>
            <ShoppingCart size={20} />
            {cartItemCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: 'var(--accent-rose)',
                color: '#fff',
                fontSize: '0.68rem',
                fontWeight: 800,
                borderRadius: 'var(--radius-full)',
                padding: '0.1rem 0.35rem',
                border: '2px solid #0a0d14'
              }}>
                {cartItemCount}
              </span>
            )}
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.65)', fontWeight: 600 }}>
              Live Order Total ({cartItemCount} item{cartItemCount === 1 ? '' : 's'})
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff' }}>
              {currencySymbol}{cartTotal.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Right: View Cart & Direct Checkout Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 auto', justifyContent: 'flex-end' }}>
          
          <button
            type="button"
            onClick={onOpenCart}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'background 0.2s'
            }}
          >
            <ShoppingCart size={16} /> View Cart ({cartItemCount})
          </button>

          <button
            type="button"
            onClick={onCheckout}
            disabled={cart.length === 0}
            style={{
              background: cart.length > 0
                ? 'linear-gradient(135deg, var(--accent-emerald), hsl(158, 80%, 35%))'
                : 'rgba(255, 255, 255, 0.1)',
              color: cart.length > 0 ? '#fff' : 'rgba(255, 255, 255, 0.3)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 1.4rem',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: cart.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: cart.length > 0 ? '0 4px 18px rgba(16, 185, 129, 0.45)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Checkout <ArrowRight size={18} />
          </button>

        </div>

      </div>

      {/* ─── 6. Camera Permission or Init Error Overlay ─────────────────────── */}
      {cameraError && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 50,
          background: 'rgba(10, 13, 20, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          textAlign: 'center',
          gap: '1rem'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '20px',
            background: 'var(--accent-rose-light)',
            color: 'var(--accent-rose)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertCircle size={32} />
          </div>
          <div style={{ maxWidth: '420px' }}>
            <h3 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.4rem' }}>Camera Access Required</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', lineHeight: 1.5 }}>
              {cameraError}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => startCamera()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <RefreshCw size={15} /> Retry Camera
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onSwitchToCatalog}
            >
              Switch to Catalog Grid
            </button>
          </div>
        </div>
      )}

      {/* Camera Loading Spinner */}
      {isCameraStarting && !cameraError && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 4,
          background: '#0a0d14',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.8rem'
        }}>
          <RefreshCw className="animate-spin" size={32} color="var(--primary)" />
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 600 }}>
            Initializing scanner camera...
          </div>
        </div>
      )}

    </div>
  );
}
