// barcodeScannerService.js — Brushwell POS
// 100% OFFLINE barcode & ISBN scanner engine.
//
// ENGINE STACK (in order of preference):
//  1. Native BarcodeDetector API  — hardware-accelerated, ~5ms  (Android Chrome / Edge)
//  2. zxing-wasm readBarcodes    — C++ WASM ZXing, ~8–15ms     (ALL browsers incl. iOS Safari)
//     This is the modern C++ port — 3–5× faster than the old JS ZXing port.
//     Works perfectly in iOS PWA (saved to home screen) because iOS Safari 14.5+
//     has full WebAssembly support.
//  3. @zxing/library safety net  — JS fallback, ~30–60ms       (if WASM fails to load)
//  4. Global hardware USB/Bluetooth scanner listener (keyboard HID emulation)
//
// NO internet needed. All decoding is local pixel math.

import { readBarcodes } from 'zxing-wasm/reader';

import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
  NotFoundException,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer
} from '@zxing/library';

// ─── zxing-wasm Reader Options ────────────────────────────────────────────────
// Restrict to formats relevant for books/retail — fewer formats = faster decode.

/** @type {object} */
const WASM_READER_OPTIONS = {
  formats: [
    'EAN-13',      // ISBN — primary format for all books
    'EAN-8',       // Compact EAN
    'Code128',     // Generic retail / logistics
    'Code39',      // Some older institutional barcodes
    'UPCA',        // North American retail
    'UPCE',        // Compact UPC
    'QRCode',      // QR codes on newer books / promotional
    'ITF',         // Interleaved 2 of 5
    'DataMatrix',  // Compact square codes
    'PDF417',      // Library / institutional
    'Aztec',       // Some newer barcodes
  ],
  tryHarder: true,         // More thorough — critical for glossy/laminated book covers
  tryRotate: true,         // Handle books held at an angle
  tryInvert: false,        // Skip dark-on-light inversion (not needed for standard barcodes)
  tryDownscale: true,      // Downsample large images for speed
  maxNumberOfSymbols: 1,   // Stop after first result — no need to find all barcodes
};

// Backward-compatible export — used by BarcodeScannerModal and other components
export const ALL_BARCODE_FORMATS = WASM_READER_OPTIONS.formats;
export const CORE_RETAIL_BARCODE_FORMATS = WASM_READER_OPTIONS.formats;

// ─── zxing-wasm Initialization ────────────────────────────────────────────────
// The WASM module loads asynchronously. We pre-load it at module startup
// so the first scan doesn't pay the cold-start penalty.

let _wasmReady = false;
let _wasmInitPromise = null;

async function ensureWasmReady() {
  if (_wasmReady) return true;
  if (_wasmInitPromise) return _wasmInitPromise;

  _wasmInitPromise = (async () => {
    try {
      // Calling readBarcodes once triggers WASM module loading.
      // We pass a tiny 1×1 dummy ImageData — it will return no barcodes but
      // forces the WASM binary to download and compile ahead of time.
      const dummy = new ImageData(new Uint8ClampedArray(4), 1, 1);
      await readBarcodes(dummy, WASM_READER_OPTIONS);
      _wasmReady = true;
      return true;
    } catch (e) {
      console.warn('[zxing-wasm] Pre-warm failed:', e.message);
      return false;
    }
  })();

  return _wasmInitPromise;
}

// ─── @zxing/library Safety Net (JS fallback) ──────────────────────────────────
// Only used if zxing-wasm WASM fails to load (extremely rare).

const _zxingJsFormats = [
  BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
  BarcodeFormat.QR_CODE, BarcodeFormat.ITF, BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417, BarcodeFormat.AZTEC
];
const _zxingJsHints = new Map();
_zxingJsHints.set(DecodeHintType.POSSIBLE_FORMATS, _zxingJsFormats);
_zxingJsHints.set(DecodeHintType.TRY_HARDER, true);

let _zxingJsReader = null;
export function getZxingReader() {
  if (!_zxingJsReader) {
    _zxingJsReader = new BrowserMultiFormatReader(_zxingJsHints, {
      delayBetweenScanAttempts: 0,
      delayBetweenScanSuccess: 0
    });
  }
  return _zxingJsReader;
}

// ─── Reusable off-screen crop canvas (no GC pressure) ─────────────────────────
// We scan a center crop of the frame — less pixels = faster decode.
// 640×320 is more than enough for EAN-13 (needs ~200px width minimum).

let _cropCanvas = null;
let _cropCtx = null;
const CROP_W = 640;
const CROP_H = 320;

export function getCropCanvas() {
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
// Synchronous flag — true once native detector is confirmed functional.
let _nativeReady = false;

export function isNativeBarcodeDetectorSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/** True only after getNativeDetector() has resolved and the detector works. */
export function isNativeReady() {
  return _nativeReady;
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
          _nativeReady = true;
          return _cachedNativeDetector;
        }
      }
      _cachedNativeDetector = new window.BarcodeDetector({ formats: desired });
      _nativeReady = true;
      return _cachedNativeDetector;
    } catch (e) {
      console.warn('[BarcodeDetector] Init failed:', e.message);
      _nativeReady = false;
      return null;
    }
  })();

  return _nativeDetectorPromise;
}

/**
 * Pre-warm all scan engines so the first scan has zero cold-start delay.
 * Called automatically 200ms after module load.
 */
export function prewarmScanEngines() {
  getNativeDetector().catch(() => {});  // Warm up native detector (async, fire-and-forget)
  ensureWasmReady();                     // Warm up zxing-wasm WASM module
  getCropCanvas();                       // Pre-allocate the off-screen canvas
}

// Auto-prewarm on module load — deferred slightly to not block first paint
if (typeof window !== 'undefined') {
  setTimeout(prewarmScanEngines, 200);
}

// ─── Engine 1: Native BarcodeDetector ─────────────────────────────────────────

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

// ─── Engine 2: zxing-wasm Live Frame Decode ────────────────────────────────────

/**
 * Fast live video frame decode using zxing-wasm (C++ WebAssembly).
 *
 * Strategy:
 * 1. Crop the CENTER of the video frame to 640×320 (where the reticle is).
 * 2. Run zxing-wasm readBarcodes() on the ImageData — near-native C++ speed.
 * 3. Falls back to @zxing/library JS if WASM hasn't loaded yet.
 *
 * Speed on iOS Safari: ~8–15ms per frame (vs ~30–60ms with old JS ZXing).
 * This is the critical fix for iPhone PWA scanning performance.
 */
export async function decodeLiveVideoFrameFast(video) {
  if (!video || video.readyState < 2 || !video.videoWidth || video.paused) return null;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const { canvas, ctx } = getCropCanvas();

  // Always clear previous frame pixels to prevent any ghosting or sticky barcodes
  ctx.clearRect(0, 0, CROP_W, CROP_H);

  // Responsive crop geometry: handles portrait sensors (vw < vh) and landscape sensors (vw >= vh)
  let srcX, srcY, srcW, srcH;
  if (vw < vh) {
    srcX = Math.floor(vw * 0.05);
    srcY = Math.floor(vh * 0.25);
    srcW = Math.floor(vw * 0.90);
    srcH = Math.floor(vh * 0.50);
  } else {
    srcX = Math.floor(vw * 0.10);
    srcY = Math.floor(vh * 0.20);
    srcW = Math.floor(vw * 0.80);
    srcH = Math.floor(vh * 0.60);
  }

  ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, CROP_W, CROP_H);

  // ── Path A: zxing-wasm (C++ WASM) — fast on ALL browsers including iOS Safari ──
  try {
    const imageData = ctx.getImageData(0, 0, CROP_W, CROP_H);
    const results = await readBarcodes(imageData, WASM_READER_OPTIONS);
    if (results && results.length > 0 && results[0]?.text) {
      return String(results[0].text).trim();
    }
  } catch (wasmErr) {
    // WASM not ready yet or unexpected error — fall through to JS safety net
    console.debug('[zxing-wasm live]', wasmErr?.message);
  }

  // ── Path B: @zxing/library JS safety net — only if WASM path threw ───────────
  try {
    const imageData = ctx.getImageData(0, 0, CROP_W, CROP_H);
    const reader = getZxingReader();
    const luminance = new RGBLuminanceSource(imageData.data, CROP_W, CROP_H);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));
    const result = reader.decodeBitmap(bitmap);
    if (result && result.getText()) {
      return result.getText().trim();
    }
  } catch (e) {
    if (!(e instanceof NotFoundException)) {
      console.debug('[ZXing JS live]', e.message);
    }
  }

  return null;
}

// ─── Still-Image / Photo Decode (multi-pass for difficult covers) ──────────────

/**
 * Decode a barcode from a still image file, photo canvas, or manual capture.
 * Use this for the "take a photo" flow — NOT in the live video loop.
 * Runs multiple enhancement passes for difficult/glossy book covers.
 */
export async function decodeBarcodeFromImageOrCanvas(sourceImageOrFile) {
  if (!sourceImageOrFile) return null;

  let canvas = null;

  if (sourceImageOrFile instanceof HTMLCanvasElement) {
    canvas = sourceImageOrFile;
  } else if (sourceImageOrFile instanceof HTMLVideoElement) {
    canvas = document.createElement('canvas');
    canvas.width = sourceImageOrFile.videoWidth || 1280;
    canvas.height = sourceImageOrFile.videoHeight || 720;
    canvas.getContext('2d').drawImage(sourceImageOrFile, 0, 0);
  } else if (sourceImageOrFile instanceof File || sourceImageOrFile instanceof Blob) {
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

  // Pass 1: Native BarcodeDetector (hardware fast path)
  const detector = await getNativeDetector();
  if (detector && canvas) {
    try {
      const res = await detector.detect(canvas);
      if (res?.length > 0 && res[0]?.rawValue) return String(res[0].rawValue).trim();
    } catch (e) {}
  }

  // Pass 2: zxing-wasm on original canvas
  if (canvas) {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const results = await readBarcodes(imageData, WASM_READER_OPTIONS);
      if (results?.length > 0 && results[0]?.text) return String(results[0].text).trim();
    } catch (e) {}
  }

  // Pass 3: zxing-wasm on contrast-enhanced canvas (glossy covers)
  if (canvas) {
    try {
      const enhanced = enhanceCanvasContrast(canvas);
      const ctx = enhanced.getContext('2d', { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, enhanced.width, enhanced.height);
      const results = await readBarcodes(imageData, WASM_READER_OPTIONS);
      if (results?.length > 0 && results[0]?.text) return String(results[0].text).trim();
    } catch (e) {}
  }

  // Pass 4: zxing-wasm on 90° rotated canvas (books held portrait)
  if (canvas) {
    try {
      const rotated = rotateCanvas90(canvas);
      const ctx = rotated.getContext('2d', { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, rotated.width, rotated.height);
      const results = await readBarcodes(imageData, WASM_READER_OPTIONS);
      if (results?.length > 0 && results[0]?.text) return String(results[0].text).trim();
    } catch (e) {}
  }

  // Pass 5: @zxing/library JS safety net on original canvas
  if (canvas) {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const reader = getZxingReader();
      const lum = new RGBLuminanceSource(imgData.data, canvas.width, canvas.height);
      const bmp = new BinaryBitmap(new HybridBinarizer(lum));
      const result = reader.decodeBitmap(bmp);
      if (result && result.getText()) return result.getText().trim();
    } catch (e) {
      if (!(e instanceof NotFoundException)) console.debug('[ZXing JS still]', e.message);
    }
  }

  return null;
}

// ─── Canvas Enhancement Utilities ─────────────────────────────────────────────

/**
 * High-contrast binarization for low-light or glossy barcode images.
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

// Pre-unlock Web Audio on first user tap/touch for seamless playback on iOS & Android
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!_audioCtx) _audioCtx = new AudioCtx();
        if (_audioCtx.state === 'suspended') {
          _audioCtx.resume();
        }
      }
    } catch (e) {}
    window.removeEventListener('touchstart', unlockAudio, true);
    window.removeEventListener('touchend', unlockAudio, true);
    window.removeEventListener('click', unlockAudio, true);
  };
  window.addEventListener('touchstart', unlockAudio, true);
  window.addEventListener('touchend', unlockAudio, true);
  window.addEventListener('click', unlockAudio, true);
}

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
    // Autoplay policy — silently ignored
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
// Handheld scanners work as HID keyboard devices — they type digits fast
// (<30ms between chars) followed by Enter. This intercepts that pattern globally.

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
      if (charDelay > 150) buffer = ''; // Reset on slow human typing
      buffer += e.key;
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);
  return () => window.removeEventListener('keydown', handleKeyDown, true);
}
