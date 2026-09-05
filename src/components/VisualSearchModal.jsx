import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Camera, SwitchCamera, Upload, Sparkles, Check, AlertCircle, 
  ShoppingCart, Tag, Search, RefreshCw, BookOpen, Barcode as BarcodeIcon, 
  ArrowRight, CheckCircle2, ChevronRight, Zap, Info, Settings, Eye
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  analyzeBookCover, 
  extractISBNFromImage, 
  matchProductByVisual, 
  mapCategoryHint, 
  fileToBase64, 
  canvasToBase64 
} from '../services/visionService';
import { getSettings } from '../services/supabaseService';

export default function VisualSearchModal({
  isOpen,
  onClose,
  initialMode = 'snap_cart', // 'snap_cart' | 'price_check' | 'register'
  products = [],
  categories = [],
  onAddToCart,
  onRegisterProduct, // (initialData) => opens product form
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
  const [frontCoverData, setFrontCoverData] = useState(null); // { image, analysis }
  const [backCoverData, setBackCoverData] = useState(null); // { image, barcode, isbn }
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const nativeCameraInputRef = useRef(null);
  const isMountedRef = useRef(false);

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

  // When modal opens or initialMode changes
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
  };

  // ─── Camera Management ────────────────────────────────────────────────────────

  const stopCamera = () => {
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
      // Enumerate devices if possible
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
          setIsCameraReady(true);
        }).catch(err => {
          console.warn('Video play warning:', err);
          setIsCameraReady(true);
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
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
  }, []);

  // ─── Shutter Snapshot ────────────────────────────────────────────────────────

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

    const { base64, mimeType } = canvasToBase64(canvas);
    const dataUrl = `data:${mimeType};base64,${base64}`;
    setCapturedImage(dataUrl);

    // Process photo depending on active mode & step
    if (activeTab === 'register' && registerStep === 2) {
      await processBackCover(canvas, base64, mimeType);
    } else {
      await processFrontCover(base64, mimeType, dataUrl);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMsg('');

    try {
      const { base64, mimeType } = await fileToBase64(file);
      const dataUrl = `data:${mimeType};base64,${base64}`;
      setCapturedImage(dataUrl);

      if (activeTab === 'register' && registerStep === 2) {
        // Need canvas or file for barcode detection
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          await processBackCover(canvas, base64, mimeType, file);
        };
        img.src = dataUrl;
      } else {
        await processFrontCover(base64, mimeType, dataUrl);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to read image file');
      setIsProcessing(false);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  // ─── Front Cover Processing ──────────────────────────────────────────────────

  const processFrontCover = async (base64, mimeType, previewDataUrl) => {
    if (!hasApiKey) {
      setErrorMsg('Please enter your Google Gemini API key in Settings → AI Vision to enable book recognition.');
      return;
    }

    setIsProcessing(true);
    setStatusMessage('Reading book cover with AI...');
    setErrorMsg('');
    setAddedToCartSuccess(false);

    try {
      const analysis = await analyzeBookCover(base64, mimeType);
      setAnalysisResult(analysis);

      if (!analysis.title && !analysis.isbn) {
        setErrorMsg('Could not clearly detect a book title. Please ensure the book cover is well-lit and facing the camera.');
        setIsProcessing(false);
        return;
      }

      // Check matching in existing product catalog
      const match = matchProductByVisual(analysis, products);
      setMatchedProduct(match.product);
      setMatchScore(match.score);

      if (match.product) {
        playSuccessSound();
      }

      // In Register mode: store front cover data and prompt for back cover
      if (activeTab === 'register') {
        setFrontCoverData({
          image: previewDataUrl,
          analysis
        });
        setRegisterStep(2);
        setStatusMessage('');
      } else if (activeTab === 'snap_cart' && match.product && onAddToCart) {
        // Automatically or 1-click add to cart
        onAddToCart(match.product);
        setAddedToCartSuccess(true);
        setStatusMessage(`Added "${match.product.product_name}" to cart!`);
      }
    } catch (err) {
      console.error('Vision processing error:', err);
      setErrorMsg(err.message || 'Failed to analyze book cover.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Back Cover Processing (Barcode & ISBN Detection) ────────────────────────

  const processBackCover = async (canvas, base64, mimeType, originalFile = null) => {
    setIsProcessing(true);
    setIsScanningBarcode(true);
    setStatusMessage('Scanning ISBN barcode from back cover...');
    setErrorMsg('');

    let detectedBarcode = '';

    try {
      // 1. Native BarcodeDetector
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window && canvas) {
        try {
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e']
          });
          const results = await detector.detect(canvas);
          if (results && results.length > 0 && results[0].rawValue) {
            detectedBarcode = results[0].rawValue;
          }
        } catch (e) {
          console.warn('Native BarcodeDetector pass failed:', e);
        }
      }

      // 2. Html5Qrcode scanFile fallback
      if (!detectedBarcode) {
        try {
          let fileToScan = originalFile;
          if (!fileToScan && canvas) {
            const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
            if (blob) fileToScan = new File([blob], 'back.jpg', { type: 'image/jpeg' });
          }

          if (fileToScan) {
            const tempDivId = 'brushwell-vision-barcode-temp';
            let tempDiv = document.getElementById(tempDivId);
            if (!tempDiv) {
              tempDiv = document.createElement('div');
              tempDiv.id = tempDivId;
              tempDiv.style.display = 'none';
              document.body.appendChild(tempDiv);
            }

            const fileScanner = new Html5Qrcode(tempDivId, {
              formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E
              ],
              verbose: false
            });

            detectedBarcode = await fileScanner.scanFile(fileToScan, false).catch(() => '');
          }
        } catch (e) {
          console.warn('Html5Qrcode file scan failed:', e);
        }
      }

      // 3. Gemini Vision OCR fallback for ISBN digits
      if (!detectedBarcode && hasApiKey) {
        setStatusMessage('Reading printed ISBN digits with AI...');
        detectedBarcode = await extractISBNFromImage(base64, mimeType).catch(() => '');
      }

      const finalBarcode = detectedBarcode || (frontCoverData?.analysis?.isbn || '');
      setBackCoverData({
        image: `data:${mimeType};base64,${base64}`,
        barcode: finalBarcode
      });

      playSuccessSound();
      setStatusMessage(finalBarcode ? `Found ISBN Barcode: ${finalBarcode}` : 'No barcode found, generated placeholder.');
    } catch (err) {
      console.error('Back cover processing error:', err);
      setErrorMsg('Could not detect barcode from back cover. You can enter it manually.');
    } finally {
      setIsProcessing(false);
      setIsScanningBarcode(false);
    }
  };

  // ─── Finish Register / Open Product Form ────────────────────────────────────

  const handleFinishRegister = () => {
    if (!onRegisterProduct) return;

    const front = frontCoverData?.analysis || {};
    const barcode = backCoverData?.barcode || front.isbn || Math.floor(100000000000 + Math.random() * 900000000000).toString();

    // Check if barcode or title already exists in products
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
      product_image: existing?.product_image || ''
    };

    onClose();
    onRegisterProduct(existing || null, barcode, initialData);
  };

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
              <h3 style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.2 }}>
                Visual Book Recognition
              </h3>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Powered by Google Gemini 1.5 Flash AI
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

        {/* Missing API Key Warning */}
        {!hasApiKey && (
          <div style={{
            padding: '0.65rem 1rem',
            background: 'var(--accent-amber-light)',
            borderBottom: '1px solid var(--accent-amber)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--accent-amber-text, #92400e)' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>Gemini API Key missing. Add your free key in Settings to activate AI vision.</span>
            </div>
            {onOpenSettings && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { onClose(); onOpenSettings(); }}
                style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', flexShrink: 0, gap: '0.3rem' }}
              >
                <Settings size={13} /> Settings
              </button>
            )}
          </div>
        )}

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
                Step 1: Front
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
                Step 2: Back & Barcode
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {registerStep === 1 ? 'Take photo of Front Cover' : 'Take photo of Back Cover (ISBN)'}
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
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backdropFilter: 'blur(4px)'
                }}>
                  {activeTab === 'register' && registerStep === 2
                    ? 'Align Barcode / ISBN inside frame'
                    : 'Align Book Cover inside frame'}
                </div>

                <div style={{
                  alignSelf: 'center',
                  background: 'rgba(0,0,0,0.6)',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backdropFilter: 'blur(4px)'
                }}>
                  Hold steady & ensure good lighting
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
              <span>{statusMessage || 'Analyzing image with AI...'}</span>
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
                    AI Detected Title
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
                /* No Catalog Match Option: Register it directly! */
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
                    This book is not currently in your inventory database.
                  </div>
                  {onRegisterProduct && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setActiveTab('register');
                        setFrontCoverData({
                          image: capturedImage,
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
                Extracted Book Details
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
                    {frontCoverData.analysis.title || 'Untitled'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {[frontCoverData.analysis.publisher, frontCoverData.analysis.category_hint].filter(Boolean).join(' • ')}
                  </div>
                  {backCoverData && (
                    <div style={{
                      marginTop: '0.3rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.72rem',
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
                      padding: '0.15rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 700
                    }}>
                      <BarcodeIcon size={13} />
                      <span>ISBN: {backCoverData.barcode || 'Generated'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Ready to open product form button */}
              <button
                type="button"
                className="btn-primary"
                onClick={handleFinishRegister}
                style={{ width: '100%', justifyContent: 'center', gap: '0.4rem', marginTop: '0.3rem' }}
              >
                <Check size={16} />
                <span>
                  {backCoverData ? 'Open Form with Title & Barcode Pre-Filled' : 'Skip Back Cover & Open Form'}
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
            Tip: Hold camera 15–20cm away in good light
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
