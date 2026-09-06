// barcodeScannerService.js — Brushwell POS
// 100% OFFLINE barcode & ISBN scanner engine.
//
// ENGINE STACK (in order of preference):
//  1. Native BarcodeDetector API  — hardware-accelerated, ~5ms (Chrome/Edge on Android)
//  2. @zxing/browser BrowserMultiFormatReader — JS/WASM ZXing, works on ALL browsers,
//     supports EAN-13, EAN-8, CODE_128, UPC-A, UPC-E, CODE_39, QR, ITF, DATA_MATRIX, etc.
//     This is the same engine used by Shopify, Square, and Stripe Terminal.
//  3. Global hardware USB/Bluetooth scanner listener (keyboard HID emulation)
//
// NO internet needed. All decoding is local pixel math.

import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
  NotFoundException,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer
} from '@zxing/library';

// ─── ZXing Format Hints ────────────────────────────────────────────────────────
// Tell ZXing exactly which barcode formats to look for.
// EAN-13 is the main format for books (ISBN) and most retail products.

const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.ITF,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417,
  BarcodeFormat.AZTEC
];

// Backward-compatible export — used by BarcodeScannerModal and other components
export const ALL_BARCODE_FORMATS = ZXING_FORMATS;
export const CORE_RETAIL_BARCODE_FORMATS = ZXING_FORMATS;


const ZXING_HINTS = new Map();
ZXING_HINTS.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
ZXING_HINTS.set(DecodeHintType.TRY_HARDER, true); // More thorough scan — critical for glossy book covers

// ─── ZXing Reader Singleton ────────────────────────────────────────────────────
// One reader for the entire app session. Never recreated.

let _zxingReader = null;

export function getZxingReader() {
  if (!_zxingReader) {
    _zxingReader = new BrowserMultiFormatReader(ZXING_HINTS, {
      delayBetweenScanAttempts: 0, // We control the loop ourselves
      delayBetweenScanSuccess: 0
    });
  }
  return _zxingReader;
}

// ─── Reusable off-screen crop canvas (no GC pressure) ─────────────────────────
// We scan a center crop of the frame — less pixels = faster decode.
// Width 640×320 is more than enough for EAN-13 (needs ~200px width minimum).

let _cropCanvas = null;
let _cropCtx = null;
const CROP_W = 640;
const CROP_H = 320;

function getCropCanvas() {
  if (!_cropCanvas) {
    _cropCanvas = document.createElement('canvas');
    _cropCanvas.width = CROP_W;
    _cropCanvas.height = CROP_H;
    _cropCtx = _cropCanvas.getContext('2d', { willReadFrequently: true });
  }
  return { canvas: _cropCanvas, ctx: _cropCtx };
}

// ─── Native BarcodeDetector Singleton ─────────────────────────────────────────

let _cachedNativeDetector = null;
let _nativeDetectorPromise = null;

export function isNativeBarcodeDetectorSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

export async function getNativeDetector() {
  if (!isNativeBarcodeDetectorSupported()) return null;
  if (_cachedNativeDetector) return _cachedNativeDetector;
  if (_nativeDetectorPromise) return _nativeDetectorPromise;

  _nativeDetectorPromise = (async () => {
    try {
      const desired = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'];
      if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const matched = desired.filter(f => supported.includes(f));
        if (matched.length > 0) {
          _cachedNativeDetector = new window.BarcodeDetector({ formats: matched });
          return _cachedNativeDetector;
        }
      }
      // Fallback — let browser choose supported formats
      _cachedNativeDetector = new window.BarcodeDetector({ formats: desired });
      return _cachedNativeDetector;
    } catch (e) {
      console.warn('[BarcodeDetector] Init failed:', e.message);
      _cachedNativeDetector = null;
      return null;
    }
  })();

  return _nativeDetectorPromise;
}

/**
 * Attempt native BarcodeDetector decode on a video frame or canvas.
 * Ultra-fast (~5ms) when available. Returns decoded string or null.
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
    // Expected on frames with no barcode
  }
  return null;
}

/**
 * Fast live video frame decode using @zxing/browser.
 *
 * Strategy:
 * 1. Crop the CENTER of the video frame to 640×320 (where the reticle is).
 * 2. Run ZXing's BrowserMultiFormatReader directly on the canvas ImageData.
 * 3. ZXing supports EAN-13, EAN-8, CODE_128, QR, UPC-A/E etc. on ANY browser.
 * 4. TRY_HARDER hint makes it work on glossy/laminated book covers.
 *
 * This is the correct solution to the browser API gap — no network calls, runs offline.
 */
export async function decodeLiveVideoFrameFast(video) {
  if (!video || video.readyState < 2 || !video.videoWidth) return null;

  const reader = getZxingReader();
  const { canvas, ctx } = getCropCanvas();

  // Crop center of frame — skip the top 25% and bottom 25% where reticle isn't
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  // Center 80% horizontally, center 50% vertically
  const srcX = Math.floor(vw * 0.10);
  const srcY = Math.floor(vh * 0.25);
  const srcW = Math.floor(vw * 0.80);
  const srcH = Math.floor(vh * 0.50);

  ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, CROP_W, CROP_H);

  try {
    const imageData = ctx.getImageData(0, 0, CROP_W, CROP_H);
    const luminance = new RGBLuminanceSource(imageData.data, CROP_W, CROP_H);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
    const result = reader.decodeBitmap(bitmap);
    if (result && result.getText()) {
      return result.getText().trim();
    }
  } catch (e) {
    if (!(e instanceof NotFoundException)) {
      // NotFoundException is normal (no barcode in frame). Log other errors.
      console.debug('[ZXing live]', e.message);
    }
  }

  return null;
}

/**
 * Decode a barcode from a still image file, photo canvas, or manual capture.
 * Use this for the "take a photo" flow — NOT in the live video loop.
 * Runs multiple enhancement passes for difficult/glossy book covers.
 */
export async function decodeBarcodeFromImageOrCanvas(sourceImageOrFile) {
  if (!sourceImageOrFile) return null;

  let canvas = null;
  let file = null;

  if (sourceImageOrFile instanceof HTMLCanvasElement) {
    canvas = sourceImageOrFile;
  } else if (sourceImageOrFile instanceof HTMLVideoElement) {
    // Snapshot the video for one-shot decoding
    canvas = document.createElement('canvas');
    canvas.width = sourceImageOrFile.videoWidth || 1280;
    canvas.height = sourceImageOrFile.videoHeight || 720;
    canvas.getContext('2d').drawImage(sourceImageOrFile, 0, 0);
  } else if (sourceImageOrFile instanceof File || sourceImageOrFile instanceof Blob) {
    file = sourceImageOrFile;
    try {
      const bmp = await createImageBitmap(sourceImageOrFile);
      canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
    } catch (e) {
      console.warn('[decodeBarcodeFromImageOrCanvas] createImageBitmap failed:', e);
    }
  }

  const reader = getZxingReader();

  // Pass 1: Native BarcodeDetector (hardware fast path)
  const detector = await getNativeDetector();
  if (detector && canvas) {
    try {
      const res = await detector.detect(canvas);
      if (res?.length > 0 && res[0]?.rawValue) return String(res[0].rawValue).trim();
    } catch (e) {}
  }

  // Helper: decode a canvas with ZXing
  const zxingDecodeCanvas = (c) => {
    try {
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const lum = new RGBLuminanceSource(imgData.data, c.width, c.height);
      const bmp = new BinaryBitmap(new HybridBinarizer(lum));
      const result = reader.decodeBitmap(bmp);
      if (result && result.getText()) return result.getText().trim();
    } catch (e) {
      if (!(e instanceof NotFoundException)) console.debug('[ZXing still]', e.message);
    }
    return null;
  };

  // Pass 2: ZXing on original canvas
  if (canvas) {
    const code = zxingDecodeCanvas(canvas);
    if (code) return code;
  }

  // Pass 3: ZXing on contrast-enhanced canvas (essential for glossy covers)
  if (canvas) {
    const enhanced = enhanceCanvasContrast(canvas);
    const code = zxingDecodeCanvas(enhanced);
    if (code) return code;
  }

  // Pass 4: ZXing on 90° rotated canvas (books held portrait with barcode rotated)
  if (canvas) {
    const rotated = rotateCanvas90(canvas);
    const code = zxingDecodeCanvas(rotated);
    if (code) return code;
  }

  // Pass 5: Native BarcodeDetector on enhanced canvas
  if (detector && canvas) {
    try {
      const enhanced = enhanceCanvasContrast(canvas);
      const res = await detector.detect(enhanced);
      if (res?.length > 0 && res[0]?.rawValue) return String(res[0].rawValue).trim();
    } catch (e) {}
  }

  return null;
}

// ─── Canvas Enhancement Utilities ─────────────────────────────────────────────

/**
 * High-contrast binarization for low-light or glossy barcode images.
 * Uses Otsu-like midpoint threshold for automatic black/white conversion.
 */
export function enhanceCanvasContrast(sourceCanvas) {
  const { width, height } = sourceCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;

  let minLum = 255, maxLum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }
  const range = maxLum - minLum || 1;
  const threshold = minLum + range * 0.5;

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Rotate a canvas 90 degrees clockwise.
 */
export function rotateCanvas90(sourceCanvas) {
  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.height;
  canvas.height = sourceCanvas.width;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
  return canvas;
}

// ─── Audio Feedback ────────────────────────────────────────────────────────────

let _audioCtx = null;

/**
 * Supermarket-style beep using Web Audio API — 100% offline, zero latency.
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
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, _audioCtx.currentTime);
      gain.gain.setValueAtTime(0.28, _audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.12);
      osc.start();
      osc.stop(_audioCtx.currentTime + 0.12);
    }
  } catch (e) {
    // Autoplay policy
  }
}

// ─── Image Compression ────────────────────────────────────────────────────────

/**
 * Compress an image to a lightweight thumbnail data URL for product storage.
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
    sourceCanvas.getContext('2d').drawImage(bitmap, 0, 0);
  }

  if (!sourceCanvas) return '';

  let w = sourceCanvas.width, h = sourceCanvas.height;
  if (w > maxWidth || h > maxHeight) {
    const ratio = Math.min(maxWidth / w, maxHeight / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = w;
  thumbCanvas.height = h;
  thumbCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0, w, h);
  return thumbCanvas.toDataURL('image/jpeg', quality);
}

// ─── Global Hardware USB / Bluetooth Barcode Scanner Listener ─────────────────
// Handheld barcode scanners (Bluetooth or USB) work as HID keyboard devices.
// They "type" the barcode digits extremely fast (< 30ms between characters)
// followed by an Enter key. This function intercepts that pattern globally.
//
// HOW TO USE A BLUETOOTH SCANNER:
//   1. Pair the scanner to the phone/tablet via Bluetooth settings.
//   2. Open the Brushwell POS selling screen.
//   3. Scan any barcode — it will be caught here and added to cart instantly.
//   No app changes needed. Works right now.

export function initHardwareBarcodeListener(onBarcodeScanned) {
  if (typeof window === 'undefined') return () => {};

  let buffer = '';
  let lastKeyTime = Date.now();

  const handleKeyDown = (e) => {
    const activeTag = (document.activeElement?.tagName || '').toLowerCase();
    const isTextInput = activeTag === 'input' || activeTag === 'textarea';

    const now = Date.now();
    const charDelay = now - lastKeyTime;
    lastKeyTime = now;

    if (e.key === 'Enter') {
      // Barcode scanners type fast (< 30ms/char), humans type slow (> 100ms/char)
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
      if (charDelay > 150) {
        buffer = ''; // Reset on slow human typing
      }
      buffer += e.key;
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);
  return () => window.removeEventListener('keydown', handleKeyDown, true);
}
