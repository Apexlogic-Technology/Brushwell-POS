import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Camera, SwitchCamera, Upload, Sparkles, Check, AlertCircle, 
  ShoppingCart, Tag, Search, RefreshCw, BookOpen, Barcode as BarcodeIcon, 
  ArrowRight, CheckCircle2, ChevronRight, Zap, Info, Settings, Eye, WifiOff, Volume2
} from 'lucide-react';
import { 
  analyzeBookCover, 
  extractISBNFromImage, 
  matchProductByVisual, 
  mapCategoryHint, 
  fileToBase64, 
  canvasToBase64 
} from '../services/visionService';
import { 
  detectFromVideoFrame, 
  decodeBarcodeFromImageOrCanvas, 
  compressImageToThumbnail, 
  isNativeBarcodeDetectorSupported 
} from '../services/barcodeScannerService';
import { getSettings } from '../services/supabaseService';

export default function VisualSearchModal({
  isOpen,
  onClose,
  initialMode = 'snap_cart', // 'snap_cart' | 'price_check' | 'register'
  products = [],
  categories = [],
  onAddToCart,
  onRegisterProduct,
  onOpenSettings
}) {
  const [activeTab, setActiveTab] = useState(initialMode);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Camera state
  const [cameraStream, setCameraStream] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);

  // Result state
  const [capturedImage, setCapturedImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [matchedProduct, setMatchedProduct] = useState(null);
  const [matchScore, setMatchScore] = useState(0);
  const [addedToCartSuccess, setAddedToCartSuccess] = useState(false);

  // 2-Step Register Mode State: Step 1 = Front Cover, Step 2 = Back Cover
  const [registerStep, setRegisterStep] = useState(1); // 1 = Front, 2 = Back
  const [frontCoverData, setFrontCoverData] = useState(null); // { image, thumbnail, analysis }
  const [backCoverData, setBackCoverData] = useState(null); // { image, barcode }

  // Offline quick title search query (inside modal fallback)
  const [quickCatalogQuery, setQuickCatalogQuery] = useState('');

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const nativeCameraInputRef = useRef(null);
  const isMountedRef = useRef(false);
  const liveBarcodeIntervalRef = useRef(null);
  const lastDetectedCodeRef = useRef('');
  const lastDetectedTimeRef = useRef(0);

  const settings = getSettings();
  const hasApiKey = Boolean(settings.gemini_api_key && settings.gemini_api_key.trim());
  const currencySymbol = settings.currency_symbol || 'GH₵';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMode);
      resetState();
      startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, initialMode]);

  const resetState = () => {
    setCapturedImage(null);
    setAnalysisResult(null);
    setMatchedProduct(null);
    setMatchScore(0);
    setAddedToCartSuccess(false);
    setErrorMsg('');
    setStatusMessage('');
    setRegisterStep(1);
    setFrontCoverData(null);
    setBackCoverData(null);
    setQuickCatalogQuery('');
    lastDetectedCodeRef.current = '';
  };

  // ─── Camera Management ────────────────────────────────────────────────────────

  const stopCamera = () => {
    if (liveBarcodeIntervalRef.current) {
      clearInterval(liveBarcodeIntervalRef.current);
      liveBarcodeIntervalRef.current = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
  };

  const startCamera = async (overrideFacingMode = null) => {
    stopCamera();
    const mode = overrideFacingMode || facingMode;

    try {
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setCameras(videoDevices);
      }

      const constraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().then(() => {
          if (!isMountedRef.current) return;
          setIsCameraReady(true);
          startLiveBarcodeDetection();
        }).catch(err => {
          console.warn('Video play warning:', err);
          if (isMountedRef.current) {
            setIsCameraReady(true);
            startLiveBarcodeDetection();
          }
        });
      }
    } catch (err) {
      console.warn('getUserMedia error:', err);
      setIsCameraReady(false);
    }
  };

  const switchCameraFacing = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // ─── Audio feedback ──────────────────────────────────────────────────────────

  const playSuccessSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1050, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }, []);

  // ─── Live Video Stream Hardware Barcode Detection (100% Offline) ───────────

  const startLiveBarcodeDetection = () => {
    if (liveBarcodeIntervalRef.current) clearInterval(liveBarcodeIntervalRef.current);

    liveBarcodeIntervalRef.current = setInterval(async () => {
      if (!isMountedRef.current || !videoRef.current || videoRef.current.readyState < 2) return;

      const code = await detectFromVideoFrame(videoRef.current);
      if (code) {
        handleBarcodeScannedOffline(code);
      }
    }, 65);
  };

  const handleBarcodeScannedOffline = (rawCode) => {
    const code = String(rawCode || '').trim();
    if (!code) return;

    const now = Date.now();
    if (code === lastDetectedCodeRef.current && now - lastDetectedTimeRef.current < 1500) return;
    if (now - lastDetectedTimeRef.current < 400) return;
    lastDetectedCodeRef.current = code;
    lastDetectedTimeRef.current = now;

    playSuccessSound();

    // In Register mode Step 2:
    if (activeTab === 'register' && registerStep === 2) {
      setBackCoverData({
        barcode: code
      });
      setStatusMessage(`✔ Scanned Barcode / ISBN: ${code}`);
      return;
    }

    // In Snap-to-Cart or Price Check:
    const match = (Array.isArray(products) ? products : []).find(p => 
      p && (String(p.barcode || '').trim() === code || String(p.id || '').trim() === code)
    );

    setAnalysisResult({
      title: match ? match.product_name : `Scanned Barcode: ${code}`,
      publisher: match?.publisher || '',
      isbn: code,
      confidence: 1.0
    });
    setMatchedProduct(match || null);
    setMatchScore(match ? 1.0 : 0);

    if (match && activeTab === 'snap_cart' && onAddToCart) {
      onAddToCart(match);
      setAddedToCartSuccess(true);
      setStatusMessage(`Added "${match.product_name}" to cart!`);
    } else if (match) {
      setStatusMessage(`Found: ${match.product_name} — ${currencySymbol}${(match.retail_price || 0).toFixed(2)}`);
    } else {
      setStatusMessage(`Barcode ${code} not yet in inventory.`);
    }
  };

  // ─── Shutter Snapshot & Photo Handlers ─────────────────────────────────────

  const capturePhoto = async () => {
    if (!videoRef.current || !isCameraReady) return;

    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 200);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const thumbnail = await compressImageToThumbnail(canvas);
    setCapturedImage(thumbnail);

    if (activeTab === 'register' && registerStep === 2) {
      await processBackCover(canvas);
    } else {
      await processFrontCover(canvas, thumbnail);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMsg('');

    try {
      const thumbnail = await compressImageToThumbnail(file);
      setCapturedImage(thumbnail);

      if (activeTab === 'register' && registerStep === 2) {
        await processBackCover(null, file);
      } else {
        const imgBitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = imgBitmap.width;
        canvas.height = imgBitmap.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgBitmap, 0, 0);
        await processFrontCover(canvas, thumbnail);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to read image file');
      setIsProcessing(false);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  // ─── Front Cover Processing (Offline Barcode check + Optional AI) ───────────

  const processFrontCover = async (canvas, thumbnail) => {
    setIsProcessing(true);
    setErrorMsg('');
    setAddedToCartSuccess(false);

    // 1. Check if the photo contains a barcode (100% Offline)
    setStatusMessage('Scanning image...');
    const detectedBarcode = await decodeBarcodeFromImageOrCanvas(canvas);
    if (detectedBarcode) {
      handleBarcodeScannedOffline(detectedBarcode);
      setIsProcessing(false);
      return;
    }

    // 2. If online and has Gemini key, try reading title/publisher
    let aiSucceeded = false;
    if (hasApiKey) {
      setStatusMessage('Reading title with AI...');
      try {
        const { base64, mimeType } = canvasToBase64(canvas);
        const analysis = await analyzeBookCover(base64, mimeType);
        if (analysis && (analysis.title || analysis.isbn)) {
          aiSucceeded = true;
          setAnalysisResult(analysis);
          const match = matchProductByVisual(analysis, products);
          setMatchedProduct(match.product);
          setMatchScore(match.score);

          if (match.product) {
            playSuccessSound();
            if (activeTab === 'snap_cart' && onAddToCart) {
              onAddToCart(match.product);
              setAddedToCartSuccess(true);
              setStatusMessage(`Added "${match.product.product_name}" to cart!`);
            }
          }

          if (activeTab === 'register') {
            setFrontCoverData({
              image: thumbnail,
              thumbnail,
              analysis
            });
            setRegisterStep(2);
          }
        }
      } catch (err) {
        console.warn('AI offline or timed out:', err.message);
      }
    }

    // 3. Graceful Offline fallback
    if (!aiSucceeded) {
      if (activeTab === 'register') {
        setFrontCoverData({
          image: thumbnail,
          thumbnail,
          analysis: { title: '', publisher: '', category_hint: '' }
        });
        setRegisterStep(2);
        setStatusMessage('Front cover photo saved! Now scan or snap the back cover barcode.');
      } else {
        setStatusMessage('');
        setErrorMsg('No barcode found on front cover. Flip to the back cover to scan barcode, or search from catalog below:');
      }
    }

    setIsProcessing(false);
  };

  // ─── Back Cover Processing (100% Offline Barcode & ISBN Detection) ──────────

  const processBackCover = async (canvas, originalFile = null) => {
    setIsProcessing(true);
    setStatusMessage('Scanning barcode from back cover...');
    setErrorMsg('');

    try {
      const detectedBarcode = await decodeBarcodeFromImageOrCanvas(canvas || originalFile);
      if (detectedBarcode) {
        setBackCoverData({
          barcode: detectedBarcode
        });
        playSuccessSound();
        setStatusMessage(`✔ Found Barcode: ${detectedBarcode}`);
      } else {
        setErrorMsg('Could not detect barcode from back cover. Hold camera closer, adjust light, or enter manually.');
      }
    } catch (err) {
      setErrorMsg('Error processing back cover: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Finish Register / Open Product Form ────────────────────────────────────

  const handleFinishRegister = () => {
    if (!onRegisterProduct) return;

    const front = frontCoverData?.analysis || {};
    const barcode = backCoverData?.barcode || front.isbn || Math.floor(100000000000 + Math.random() * 900000000000).toString();

    const existing = products.find(p => 
      p && (
        (barcode && String(p.barcode) === String(barcode)) ||
        (front.title && p.product_name && p.product_name.toLowerCase().trim() === front.title.toLowerCase().trim())
      )
    );

    const categoryMatch = mapCategoryHint(front.category_hint);

    const initialData = {
      id: existing?.id || '',
      product_name: front.title || existing?.product_name || '',
      publisher: front.publisher || existing?.publisher || '',
      category_id: existing?.category_id || categoryMatch?.id || '',
      category_name: existing?.category_name || categoryMatch?.name || '',
      barcode: barcode,
      retail_price: existing?.retail_price || '',
      wholesale_price: existing?.wholesale_price || '',
      stock_quantity: existing?.stock_quantity != null ? String(existing.stock_quantity) : '10000',
      product_image: existing?.product_image || frontCoverData?.thumbnail || ''
    };

    onClose();
    onRegisterProduct(existing || null, barcode, initialData);
  };

  // Filter products for the in-modal offline search fallback
  const filteredQuickProducts = quickCatalogQuery.trim()
    ? products.filter(p => {
        if (!p) return false;
        const q = quickCatalogQuery.toLowerCase();
        return (p.product_name || '').toLowerCase().includes(q) ||
               (p.publisher || '').toLowerCase().includes(q) ||
               String(p.barcode || '').includes(q);
      }).slice(0, 5)
    : [];

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: '560px', 
          width: '95%', 
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '0.85rem 1.15rem',
          background: 'linear-gradient(135deg, var(--bg-surface-elevated), var(--bg-surface))',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 2px 8px var(--primary-glow)'
            }}>
              <Camera size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
                  Smart Visual Book Scanner
                </h3>
                <span style={{
                  fontSize: '0.65rem',
                  padding: '0.1rem 0.4rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--accent-emerald-light)',
                  color: 'var(--accent-emerald)',
                  fontWeight: 700,
                  border: '1px solid var(--accent-emerald)'
                }}>
                  ⚡ 100% Offline
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Instant Barcode, Cover Photo & Catalog Match
              </div>
            </div>
          </div>
          <button 
            type="button" 
            className="btn-icon" 
            onClick={onClose}
            style={{ width: '32px', height: '32px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-surface-elevated)',
          borderBottom: '1px solid var(--border-light)',
          padding: '0.35rem 0.6rem',
          gap: '0.4rem'
        }}>
          <button
            type="button"
            onClick={() => { setActiveTab('snap_cart'); resetState(); }}
            style={{
              flex: 1,
              padding: '0.45rem 0.5rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'snap_cart' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'snap_cart' ? '#fff' : 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s'
            }}
          >
            <ShoppingCart size={15} />
            <span>Snap to Cart</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('price_check'); resetState(); }}
            style={{
              flex: 1,
              padding: '0.45rem 0.5rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'price_check' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'price_check' ? '#fff' : 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s'
            }}
          >
            <Search size={15} />
            <span>Price Check</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('register'); resetState(); }}
            style={{
              flex: 1,
              padding: '0.45rem 0.5rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'register' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'register' ? '#fff' : 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s'
            }}
          >
            <BookOpen size={15} />
            <span>Register (Front & Back)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* Mode Step Instruction */}
          {activeTab === 'register' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-surface-elevated)',
              padding: '0.5rem 0.8rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              fontSize: '0.8rem',
              fontWeight: 700
            }}>
              <div style={{
                padding: '0.2rem 0.55rem',
                borderRadius: 'var(--radius-full)',
                background: registerStep === 1 ? 'var(--primary)' : 'var(--accent-emerald)',
                color: '#fff',
                fontSize: '0.72rem'
              }}>
                Step 1: Front Cover
              </div>
              <ChevronRight size={14} color="var(--text-muted)" />
              <div style={{
                padding: '0.2rem 0.55rem',
                borderRadius: 'var(--radius-full)',
                background: registerStep === 2 ? 'var(--primary)' : 'var(--bg-surface)',
                color: registerStep === 2 ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border-light)',
                fontSize: '0.72rem'
              }}>
                Step 2: Back Barcode
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {registerStep === 1 ? 'Snap Front Cover' : 'Aim at Back Barcode'}
              </span>
            </div>
          )}

          {/* Viewfinder / Camera Area */}
          <div style={{
            position: 'relative',
            width: '100%',
            height: '270px',
            background: '#000',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
          }}>
            {/* Live Video Feed */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: isCameraReady ? 'block' : 'none'
              }}
            />

            {/* Shutter flash overlay */}
            {shutterFlash && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: '#fff',
                opacity: 0.85,
                zIndex: 10,
                pointerEvents: 'none'
              }} />
            )}

            {/* Target Book Framing Overlay */}
            {isCameraReady && (
              <div style={{
                position: 'absolute',
                inset: '20px',
                border: '2px dashed rgba(255, 255, 255, 0.7)',
                borderRadius: '12px',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '8px'
              }}>
                <div style={{
                  alignSelf: 'center',
                  background: 'rgba(0,0,0,0.65)',
                  color: '#fff',
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backdropFilter: 'blur(4px)'
                }}>
                  {activeTab === 'register' && registerStep === 2
                    ? '⚡ Aim at Back Barcode / ISBN (Auto-Scans Live)'
                    : '⚡ Aim at Barcode or Book Cover to Snap'}
                </div>

                <div style={{
                  alignSelf: 'center',
                  background: 'rgba(0,0,0,0.65)',
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backdropFilter: 'blur(4px)'
                }}>
                  Live Auto-Scan Active • Hold Steady
                </div>
              </div>
            )}

            {/* Camera Loading / Fallback placeholder */}
            {!isCameraReady && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.6rem',
                color: 'rgba(255,255,255,0.7)',
                textAlign: 'center',
                padding: '1rem'
              }}>
                <Camera size={36} color="rgba(255,255,255,0.4)" />
                <div style={{ fontSize: '0.85rem' }}>Camera initializing or unavailable</div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => startCamera()}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
                >
                  <RefreshCw size={13} /> Retry Camera
                </button>
              </div>
            )}

            {/* Floating Top Controls (Switch Camera) */}
            {isCameraReady && (
              <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                display: 'flex',
                gap: '0.4rem',
                zIndex: 5
              }}>
                <button
                  type="button"
                  onClick={switchCameraFacing}
                  title="Switch Front/Rear Camera"
                  style={{
                    background: 'rgba(0,0,0,0.65)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backdropFilter: 'blur(4px)'
                  }}
                >
                  <SwitchCamera size={17} />
                </button>
              </div>
            )}

            {/* Floating Bottom Shutter Bar */}
            <div style={{
              position: 'absolute',
              bottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.2rem',
              zIndex: 5
            }}>
              {/* Gallery / File Picker */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload Photo from Gallery"
                style={{
                  background: 'rgba(0,0,0,0.65)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  backdropFilter: 'blur(4px)'
                }}
              >
                <Upload size={18} />
              </button>

              {/* Main Shutter Button */}
              <button
                type="button"
                onClick={capturePhoto}
                disabled={!isCameraReady || isProcessing}
                title="Take Picture"
                style={{
                  width: '62px',
                  height: '62px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.3)',
                  border: '3px solid #fff',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isProcessing ? 'wait' : 'pointer',
                  boxShadow: '0 0 15px rgba(0,0,0,0.5)',
                  transition: 'transform 0.1s'
                }}
              >
                <div style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: isProcessing ? 'var(--accent-amber)' : 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff'
                }}>
                  {isProcessing ? (
                    <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Camera size={24} />
                  )}
                </div>
              </button>

              {/* Mobile Native Camera Input Trigger */}
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                title="Use Phone Native Camera App"
                style={{
                  background: 'rgba(0,0,0,0.65)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  backdropFilter: 'blur(4px)'
                }}
              >
                <Sparkles size={18} color="var(--accent-purple)" />
              </button>
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <input
              ref={nativeCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </div>

          {/* Processing Status Banner */}
          {isProcessing && (
            <div style={{
              padding: '0.65rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary-light)',
              border: '1px solid var(--primary)',
              color: 'var(--primary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
              <span>{statusMessage || 'Processing image...'}</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div style={{
              padding: '0.65rem 0.9rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-rose-light)',
              border: '1px solid var(--accent-rose)',
              color: 'var(--accent-rose)',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem'
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>{errorMsg}</div>
            </div>
          )}

          {/* Added to Cart Success Banner */}
          {addedToCartSuccess && matchedProduct && (
            <div style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-emerald-light)',
              border: '1px solid var(--accent-emerald)',
              color: 'var(--accent-emerald)',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={18} />
                <span>Added to cart: <strong>{matchedProduct.product_name}</strong></span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  if (onAddToCart) onAddToCart(matchedProduct);
                }}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              >
                + Add Another
              </button>
            </div>
          )}

          {/* ─── Recognition Result Card (Snap-to-Cart & Price Check) ─── */}
          {analysisResult && (activeTab === 'snap_cart' || activeTab === 'price_check') && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                    Detected Book
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
                    {analysisResult.title || 'Untitled Book'}
                  </div>
                  {(analysisResult.publisher || analysisResult.author) && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {[analysisResult.publisher, analysisResult.author].filter(Boolean).join(' • ')}
                    </div>
                  )}
                </div>

                <div style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: matchedProduct ? 'var(--accent-emerald-light)' : 'var(--accent-amber-light)',
                  color: matchedProduct ? 'var(--accent-emerald)' : 'var(--accent-amber-text, #92400e)',
                  border: `1px solid ${matchedProduct ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
                  whiteSpace: 'nowrap'
                }}>
                  {matchedProduct ? 'In Catalog' : 'Not in Catalog'}
                </div>
              </div>

              {/* Matched Product Details */}
              {matchedProduct ? (
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem'
                }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Barcode: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{matchedProduct.barcode || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.25rem', alignItems: 'center' }}>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {currencySymbol}{(matchedProduct.retail_price || 0).toFixed(2)}
                      </div>
                      {matchedProduct.wholesale_price && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Wholesale: {currencySymbol}{(matchedProduct.wholesale_price || 0).toFixed(2)}
                        </div>
                      )}
                      <div style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.1rem 0.4rem',
                        borderRadius: 'var(--radius-sm)',
                        background: (matchedProduct.stock_quantity || 0) > 5 ? 'var(--accent-emerald-light)' : 'var(--accent-rose-light)',
                        color: (matchedProduct.stock_quantity || 0) > 5 ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                      }}>
                        Stock: {matchedProduct.stock_quantity || 0}
                      </div>
                    </div>
                  </div>

                  {onAddToCart && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        onAddToCart(matchedProduct);
                        setAddedToCartSuccess(true);
                      }}
                      style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem', gap: '0.4rem', flexShrink: 0 }}
                    >
                      <ShoppingCart size={15} /> Add to Cart
                    </button>
                  )}
                </div>
              ) : (
                /* No Catalog Match Option: Register it directly */
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px dashed var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem'
                }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    This book is not currently in your inventory catalog.
                  </div>
                  {onRegisterProduct && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setActiveTab('register');
                        setFrontCoverData({
                          image: capturedImage,
                          thumbnail: capturedImage,
                          analysis: analysisResult
                        });
                        setRegisterStep(2);
                      }}
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', gap: '0.35rem', flexShrink: 0 }}
                    >
                      <BookOpen size={14} /> Register Book
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Offline Quick Catalog Search Fallback ─── */}
          {(activeTab === 'snap_cart' || activeTab === 'price_check') && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.85rem'
            }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>
                Can't flip to barcode? Quick search offline catalog:
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Type title or grade to pick..."
                  value={quickCatalogQuery}
                  onChange={e => setQuickCatalogQuery(e.target.value)}
                  style={{ paddingLeft: '1.8rem', fontSize: '0.8rem', height: '32px' }}
                />
              </div>

              {filteredQuickProducts.length > 0 && (
                <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {filteredQuickProducts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setMatchedProduct(p);
                        setAnalysisResult({ title: p.product_name, publisher: p.publisher, isbn: p.barcode });
                        if (activeTab === 'snap_cart' && onAddToCart) {
                          onAddToCart(p);
                          setAddedToCartSuccess(true);
                        }
                        setQuickCatalogQuery('');
                      }}
                      style={{
                        padding: '0.35rem 0.6rem',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-light)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        fontSize: '0.78rem'
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{p.product_name}</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{currencySymbol}{(p.retail_price || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Register Mode Step 2 Summary ─── */}
          {activeTab === 'register' && frontCoverData && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Captured Book Details
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {frontCoverData.image && (
                  <img
                    src={frontCoverData.image}
                    alt="Front Cover"
                    style={{ width: '48px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-light)' }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {frontCoverData.analysis.title || 'Front Cover Photo Captured'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {[frontCoverData.analysis.publisher, frontCoverData.analysis.category_hint].filter(Boolean).join(' • ') || 'Ready to enter title'}
                  </div>
                  {backCoverData && (
                    <div style={{
                      marginTop: '0.3rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.72rem',
                      background: 'var(--accent-emerald-light)',
                      color: 'var(--accent-emerald)',
                      padding: '0.15rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 700
                    }}>
                      <BarcodeIcon size={13} />
                      <span>Barcode: {backCoverData.barcode}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Finish register button */}
              <button
                type="button"
                className="btn-primary"
                onClick={handleFinishRegister}
                style={{ width: '100%', justifyContent: 'center', gap: '0.4rem', marginTop: '0.3rem' }}
              >
                <Check size={16} />
                <span>
                  {backCoverData ? 'Open Form with Barcode & Photo Attached' : 'Open Product Form to Complete'}
                </span>
              </button>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '0.75rem 1.15rem',
          background: 'var(--bg-surface-elevated)',
          borderTop: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Tip: Point at barcode on back of book for instant offline scan
          </div>
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={onClose}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
          >
            Done
          </button>
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}
