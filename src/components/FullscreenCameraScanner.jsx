// FullscreenCameraScanner.jsx — Brushwell POS
// Entire-screen direct camera POS scanning interface with continuous auto-capture,
// instant add-to-cart, holographic reticle, and direct-to-checkout live dock.
// Uses direct native <video> stream with 0 black boxes or HTML5-QRCode canvas overlay bugs.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, ShoppingCart, ArrowRight, Zap, ZapOff, 
  Volume2, VolumeX, RefreshCw, LayoutGrid, CheckCircle2,
  AlertCircle, Plus
} from 'lucide-react';
import { 
  detectFromVideoFrame, 
  decodeBarcodeFromImageOrCanvas,
  playBeep 
} from '../services/barcodeScannerService';

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
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Scan HUD feedback
  const [scanFlash, setScanFlash] = useState(false);
  const [lastNotification, setLastNotification] = useState(null); // { type, message, product, code }

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastScanCodeRef = useRef('');
  const lastScanTimeRef = useRef(0);
  const liveLoopRef = useRef(null);
  const notifTimerRef = useRef(null);
  const contrastScanTickRef = useRef(0);

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

  // ─── Camera Management (Direct MediaStream, Zero Black Canvas Overlays) ──────

  const stopCamera = useCallback(() => {
    if (liveLoopRef.current) {
      clearInterval(liveLoopRef.current);
      liveLoopRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const startCamera = useCallback(async (overrideFacingMode = null) => {
    stopCamera();
    const mode = overrideFacingMode || facingMode;

    try {
      const constraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      // Check torch capabilities on back camera
      try {
        const track = stream.getVideoTracks()[0];
        if (track && track.getCapabilities) {
          const caps = track.getCapabilities();
          if (caps && ('torch' in caps || caps.torch)) {
            setTorchAvailable(true);
          }
        }
      } catch (e) {}

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('video.play() warning:', playErr);
        }

        if (!isMountedRef.current) return;
        setIsCameraReady(true);
        setCameraError(null);

        // Start high-speed live detection loop (65ms on live video frame)
        if (liveLoopRef.current) clearInterval(liveLoopRef.current);
        liveLoopRef.current = setInterval(async () => {
          if (!isMountedRef.current || !videoRef.current || isPaused) return;
          const video = videoRef.current;
          if (video.readyState < 2) return;

          // 1. Ultra-fast hardware BarcodeDetector on raw video frame
          let code = await detectFromVideoFrame(video);

          // 2. If missed and every ~260ms (4 ticks), run contrast-enhanced canvas fallback
          // (essential for glossy laminated book covers like Don Series)
          if (!code) {
            contrastScanTickRef.current = (contrastScanTickRef.current + 1) % 4;
            if (contrastScanTickRef.current === 0) {
              code = await decodeBarcodeFromImageOrCanvas(video);
            }
          }

          if (code) {
            handleBarcodeDetected(code);
          }
        }, 65);
      }
    } catch (err) {
      console.error('Camera stream error:', err);
      if (isMountedRef.current) {
        setIsCameraReady(false);
        setCameraError(err.message || 'Camera permission denied or camera not found.');
      }
    }
  }, [facingMode, handleBarcodeDetected, isPaused, stopCamera]);

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

  // Switch camera facing (Environment vs User)
  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    await startCamera(nextFacing);
  };

  // Toggle Torch Flashlight
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
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: 'calc(100vh - 120px)',
      minHeight: '480px',
      background: '#0a0d14',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 'var(--radius-lg)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)'
    }}>

      {/* ─── 1. Direct Live Video Feed (100% Full Viewport Coverage) ─────── */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: isCameraReady ? 'block' : 'none',
          zIndex: 1
        }}
      />

      {/* CSS animations for laser and scan feedback */}
      <style>{`
        @keyframes sweepLaser {
          0% { top: 10%; opacity: 0.8; }
          50% { top: 90%; opacity: 1; }
          100% { top: 10%; opacity: 0.8; }
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
          background: 'rgba(255, 255, 255, 0.14)',
          borderRadius: 'var(--radius-full)',
          padding: '3px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
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
              color: 'rgba(255, 255, 255, 0.85)',
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
          background: 'rgba(255, 255, 255, 0.14)',
          borderRadius: 'var(--radius-md)',
          padding: '2px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
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
              color: priceMode === 'retail' ? '#fff' : 'rgba(255, 255, 255, 0.75)'
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
              color: priceMode === 'wholesale' ? '#fff' : 'rgba(255, 255, 255, 0.75)'
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
                background: torchOn ? 'var(--accent-amber)' : 'rgba(255,255,255,0.18)',
                color: torchOn ? '#000' : '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
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
            title="Switch Camera (Back/Front)"
            style={{
              background: 'rgba(255,255,255,0.18)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
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
              background: 'rgba(255,255,255,0.18)',
              color: soundEnabled ? 'var(--accent-emerald)' : 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.25)',
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
          height: 'min(44vh, 250px)',
          border: scanFlash 
            ? '3px solid var(--accent-emerald)' 
            : '2px solid rgba(255, 255, 255, 0.35)',
          borderRadius: '24px',
          boxShadow: scanFlash 
            ? '0 0 45px rgba(16, 185, 129, 0.85), inset 0 0 25px rgba(16, 185, 129, 0.5)' 
            : '0 0 20px rgba(0, 0, 0, 0.5), inset 0 0 15px rgba(0, 0, 0, 0.3)',
          transition: 'border 0.15s, box-shadow 0.15s',
          overflow: 'hidden',
          background: 'transparent'
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
          background: 'rgba(10, 13, 20, 0.78)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
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

      {/* Camera Initializing Overlay */}
      {!isCameraReady && !cameraError && (
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
            Starting live scanner camera...
          </div>
        </div>
      )}

    </div>
  );
}
