// barcodeScannerService.js — Brushwell POS
// Robust, 100% offline barcode & ISBN scanner engine.
// Combines:
// 1. Hardware Native BarcodeDetector (Chrome, Edge, Opera, Android WebViews — ultra fast ~5ms)
// 2. Html5Qrcode ZXing multi-format engine (all browsers fallback)
// 3. Multi-pass canvas image enhancement (grayscale, contrast boost, 90° rotation)
// 4. Global USB/Bluetooth handheld barcode scanner listener

import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export const CORE_RETAIL_BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE
].filter(Boolean);

export const ALL_BARCODE_FORMATS = CORE_RETAIL_BARCODE_FORMATS;

let _cachedNativeDetector = null;
let _nativeDetectorPromise = null;

/**
 * Checks whether the browser natively supports the hardware BarcodeDetector API.
 */
export function isNativeBarcodeDetectorSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Safely gets or instantiates a native BarcodeDetector by checking supported formats first.
 * Never throws TypeError on unsupported formats.
 */
export async function getNativeDetector() {
  if (!isNativeBarcodeDetectorSupported()) return null;
  if (_cachedNativeDetector) return _cachedNativeDetector;
  if (_nativeDetectorPromise) return _nativeDetectorPromise;

  _nativeDetectorPromise = (async () => {
    try {
      if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const desired = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'];
        const matched = desired.filter(f => supported.includes(f));
        if (matched.length > 0) {
          _cachedNativeDetector = new window.BarcodeDetector({ formats: matched });
          return _cachedNativeDetector;
        }
      }
      _cachedNativeDetector = new window.BarcodeDetector();
      return _cachedNativeDetector;
    } catch (e) {
      console.warn('Native BarcodeDetector init failed:', e);
      _cachedNativeDetector = null;
      return null;
    }
  })();

  return _nativeDetectorPromise;
}

/**
 * Decodes barcode from a live HTMLVideoElement, Canvas, or ImageBitmap using native BarcodeDetector.
 * Returns decoded rawValue or null. Extremely fast (under 5ms).
 */
export async function detectFromVideoFrame(videoOrCanvas) {
  try {
    const detector = await getNativeDetector();
    if (!detector) return null;
    const results = await detector.detect(videoOrCanvas);
    if (results && results.length > 0 && results[0]?.rawValue) {
      return String(results[0].rawValue).trim();
    }
  } catch (e) {
    // Silently catch frame decode issues during active playback
  }
  return null;
}

let _audioCtx = null;
/**
 * Synthesizes a crisp supermarket barcode scanner chime (works 100% offline, zero latency).
 */
export function playBeep(isError = false) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!_audioCtx) _audioCtx = new AudioContext();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();

    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.connect(gain);
    gain.connect(_audioCtx.destination);

    if (isError) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, _audioCtx.currentTime);
      gain.gain.setValueAtTime(0.3, _audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, _audioCtx.currentTime + 0.22);
      osc.start();
      osc.stop(_audioCtx.currentTime + 0.22);
    } else {
      // Pleasant supermarket scanner chime (1760 Hz / high A)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, _audioCtx.currentTime);
      gain.gain.setValueAtTime(0.28, _audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.12);
      osc.start();
      osc.stop(_audioCtx.currentTime + 0.12);
    }
  } catch (e) {
    // Autoplay restrictions
  }
}

/**
 * Multi-pass contrast & binarization enhancer for difficult or low-light barcode images.
 */
export function enhanceCanvasContrast(sourceCanvas) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0);

  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  // 1. Calculate min and max luminance for histogram stretching
  let minLum = 255;
  let maxLum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = maxLum - minLum || 1;
  const threshold = minLum + range * 0.5; // Otsu-like midpoint threshold

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // High contrast black-and-white stretch
    const v = lum > threshold ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Rotates a canvas by 90 degrees clockwise.
 */
export function rotateCanvas90(sourceCanvas) {
  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.height;
  canvas.height = sourceCanvas.width;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((90 * Math.PI) / 180);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
  return canvas;
}

/**
 * Multi-pass barcode decoder for still images, photos, and canvas snapshots.
 * Tries:
 * 1. Native BarcodeDetector
 * 2. Native BarcodeDetector on enhanced contrast canvas
 * 3. Native BarcodeDetector rotated 90° (for vertical barcodes on books)
 * 4. Html5Qrcode.scanFile on original
 * 5. Html5Qrcode.scanFile on enhanced contrast
 */
export async function decodeBarcodeFromImageOrCanvas(sourceImageOrFile) {
  if (!sourceImageOrFile) return null;

  let canvas = null;
  let fileToScan = null;

  if (sourceImageOrFile instanceof HTMLCanvasElement) {
    canvas = sourceImageOrFile;
  } else if (sourceImageOrFile instanceof HTMLVideoElement) {
    canvas = document.createElement('canvas');
    canvas.width = sourceImageOrFile.videoWidth || 1280;
    canvas.height = sourceImageOrFile.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sourceImageOrFile, 0, 0);
  } else if (sourceImageOrFile instanceof File || sourceImageOrFile instanceof Blob) {
    fileToScan = sourceImageOrFile;
    try {
      const bitmap = await createImageBitmap(sourceImageOrFile);
      canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
    } catch (e) {
      console.warn('createImageBitmap failed:', e);
    }
  }

  const detector = getNativeDetector();

  // Pass 1: Native BarcodeDetector on original canvas
  if (detector && canvas) {
    try {
      const res = await detector.detect(canvas);
      if (res && res.length > 0 && res[0]?.rawValue) {
        return String(res[0].rawValue).trim();
      }
    } catch (e) {}
  }

  // Pass 2: Native BarcodeDetector on enhanced contrast canvas
  if (detector && canvas) {
    try {
      const enhanced = enhanceCanvasContrast(canvas);
      const res = await detector.detect(enhanced);
      if (res && res.length > 0 && res[0]?.rawValue) {
        return String(res[0].rawValue).trim();
      }
    } catch (e) {}
  }

  // Pass 3: Native BarcodeDetector rotated 90° (books held sideways/vertically)
  if (detector && canvas) {
    try {
      const rotated = rotateCanvas90(canvas);
      const res = await detector.detect(rotated);
      if (res && res.length > 0 && res[0]?.rawValue) {
        return String(res[0].rawValue).trim();
      }
    } catch (e) {}
  }

  // Pass 4: Html5Qrcode.scanFile
  try {
    if (!fileToScan && canvas) {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95));
      if (blob) fileToScan = new File([blob], 'snapshot.jpg', { type: 'image/jpeg' });
    }

    if (fileToScan) {
      const tempRegionId = 'brushwell-offline-temp-scanner';
      let tempEl = document.getElementById(tempRegionId);
      if (!tempEl) {
        tempEl = document.createElement('div');
        tempEl.id = tempRegionId;
        tempEl.style.display = 'none';
        document.body.appendChild(tempEl);
      }

      const html5Qr = new Html5Qrcode(tempRegionId, {
        formatsToSupport: ALL_BARCODE_FORMATS,
        verbose: false
      });

      try {
        const decoded = await html5Qr.scanFile(fileToScan, false);
        if (decoded) return String(decoded).trim();
      } catch (err) {
        // Pass 5: Html5Qrcode on enhanced canvas
        if (canvas) {
          try {
            const enhanced = enhanceCanvasContrast(canvas);
            const enhancedBlob = await new Promise(r => enhanced.toBlob(r, 'image/jpeg', 0.95));
            if (enhancedBlob) {
              const enhancedFile = new File([enhancedBlob], 'enhanced.jpg', { type: 'image/jpeg' });
              const decodedEnhanced = await html5Qr.scanFile(enhancedFile, false);
              if (decodedEnhanced) return String(decodedEnhanced).trim();
            }
          } catch (e) {}
        }
      } finally {
        try { html5Qr.clear(); } catch (e) {}
      }
    }
  } catch (e) {
    console.warn('Html5Qrcode scan passes failed:', e);
  }

  return null;
}

/**
 * Compresses an image to a lightweight thumbnail data URL (~25KB–45KB) for storing with the product.
 */
export async function compressImageToThumbnail(fileOrCanvas, maxWidth = 480, maxHeight = 640, quality = 0.75) {
  let sourceCanvas = null;

  if (fileOrCanvas instanceof HTMLCanvasElement) {
    sourceCanvas = fileOrCanvas;
  } else if (fileOrCanvas instanceof File || fileOrCanvas instanceof Blob) {
    const bitmap = await createImageBitmap(fileOrCanvas);
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = bitmap.width;
    sourceCanvas.height = bitmap.height;
    const ctx = sourceCanvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
  }

  if (!sourceCanvas) return '';

  let w = sourceCanvas.width;
  let h = sourceCanvas.height;

  if (w > maxWidth || h > maxHeight) {
    const ratio = Math.min(maxWidth / w, maxHeight / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = w;
  thumbCanvas.height = h;
  const ctx = thumbCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0, w, h);

  return thumbCanvas.toDataURL('image/jpeg', quality);
}

/**
 * Global Hardware USB/Bluetooth Barcode Scanner Listener.
 * Handheld barcode guns act as fast keyboard strokes followed by 'Enter'.
 * This listener catches barcode scans globally without needing focus on an input!
 */
export function initHardwareBarcodeListener(onBarcodeScanned) {
  if (typeof window === 'undefined') return () => {};

  let buffer = '';
  let lastKeyTime = Date.now();

  const handleKeyDown = (e) => {
    // If user is currently typing in an input or textarea, let normal typing happen
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const isTextInput = activeTag === 'input' || activeTag === 'textarea';

    const now = Date.now();
    const charDelay = now - lastKeyTime;
    lastKeyTime = now;

    // Barcode guns type very fast: characters typically arrive < 45ms apart
    if (e.key === 'Enter') {
      if (buffer.length >= 3 && (!isTextInput || charDelay < 50)) {
        const code = buffer.trim();
        buffer = '';
        if (code.length >= 3 && onBarcodeScanned) {
          e.preventDefault();
          onBarcodeScanned(code);
        }
      } else {
        buffer = '';
      }
      return;
    }

    if (e.key && e.key.length === 1) {
      // If characters arrive quickly, append to barcode buffer
      if (charDelay > 200) {
        buffer = ''; // reset buffer if human is typing slowly
      }
      buffer += e.key;
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);
  return () => {
    window.removeEventListener('keydown', handleKeyDown, true);
  };
}
