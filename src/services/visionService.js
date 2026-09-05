// visionService.js — Brushwell POS
// Uses Google Gemini 1.5 Flash (free tier) for book cover recognition & ISBN extraction.
// API key is stored in Settings (gemini_api_key).

import { getSettings } from './supabaseService';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a File or Blob to a base64 data string (without the data: prefix).
 * @param {File|Blob} file
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(',');
      const base64 = result.substring(comma + 1);
      const mimeType = file.type || 'image/jpeg';
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a canvas or video frame to base64.
 * @param {HTMLCanvasElement} canvas
 * @returns {{base64: string, mimeType: string}}
 */
export function canvasToBase64(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const comma = dataUrl.indexOf(',');
  return {
    base64: dataUrl.substring(comma + 1),
    mimeType: 'image/jpeg'
  };
}

export async function testGeminiApiKey(apiKey) {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: 'Please enter a Gemini API key.' };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${GEMINI_API_BASE}?key=${apiKey.trim()}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data?.error?.message || `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Connection timed out. Check your internet connection.' };
    }
    return { ok: false, error: err.message || 'Network error connecting to Gemini API' };
  }
}

/**
 * Core Gemini Vision call with model fallbacks and timeout.
 * @param {string} prompt
 * @param {string} imageBase64
 * @param {string} mimeType
 * @returns {Promise<string>} raw text response
 */
async function callGemini(prompt, imageBase64, mimeType = 'image/jpeg') {
  const settings = getSettings();
  const apiKey = (settings.gemini_api_key || '').trim();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  let lastError = null;

  for (const model of MODELS) {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 512
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${res.status}`;
        lastError = new Error(msg);
        if (res.status === 404) continue; // try next model
        throw lastError;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return text.trim();
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      if (err.name === 'AbortError') {
        throw new Error('Network timeout reaching Google AI (offline). Switched to offline mode.');
      }
      if (err.message && err.message.includes('API_KEY')) throw err;
    }
  }

  throw lastError || new Error('Network offline or Google AI service unreachable.');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyses a book cover image and returns structured metadata.
 * @param {string} imageBase64
 * @param {string} mimeType
 * @returns {Promise<BookAnalysis>}
 *
 * @typedef {Object} BookAnalysis
 * @property {string} title
 * @property {string} publisher
 * @property {string} author
 * @property {string} isbn        — 10 or 13-digit ISBN if visible, else ''
 * @property {string} category_hint — Ghana school category hint e.g. 'Primary School'
 * @property {string} grade       — e.g. 'Class 3', 'JHS 2', 'SHS'
 * @property {number} confidence  — 0–1
 * @property {string} raw         — raw Gemini response for debugging
 */
export async function analyzeBookCover(imageBase64, mimeType = 'image/jpeg') {
  const prompt = `You are an AI assistant for a Ghanaian educational bookshop POS system.
Analyze this book cover image and extract the following information.
Respond ONLY with a valid JSON object — no markdown, no explanation.

Required fields:
- "title": The full book title as printed on the cover. If unclear, your best guess.
- "publisher": Publisher name if visible, else "".
- "author": Author name(s) if visible, else "".
- "isbn": 10 or 13-digit ISBN if visible anywhere on the cover, else "".
- "grade": School grade/class/level if mentioned (e.g. "Class 3", "JHS 2", "SHS", "Basic 5"), else "".
- "category_hint": One of: "Crèche & Nursery", "Primary School", "Junior High School", "SHS Core Subjects", "SHS Science", "SHS General Arts", "SHS Business", "SHS Visual Arts", "BECE & WASSCE Past Questions", "Children Storybooks", "Stationery & School Supplies", or "" if unknown.
- "confidence": A number from 0 to 1 reflecting how confident you are in the title extraction (1 = very clear, 0 = very unclear/not a book).

Example response:
{"title":"Mathematics for Basic Schools Book 4","publisher":"Akrong Publications","author":"C.K. Arthur","isbn":"","grade":"Class 4","category_hint":"Primary School","confidence":0.95}`;

  const raw = await callGemini(prompt, imageBase64, mimeType);

  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      title: parsed.title || '',
      publisher: parsed.publisher || '',
      author: parsed.author || '',
      isbn: parsed.isbn || '',
      grade: parsed.grade || '',
      category_hint: parsed.category_hint || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      raw
    };
  } catch {
    // If JSON parse fails, try to extract a title from the raw text
    return {
      title: '',
      publisher: '',
      author: '',
      isbn: '',
      grade: '',
      category_hint: '',
      confidence: 0,
      raw
    };
  }
}

/**
 * Extracts an ISBN/barcode number from a back-cover image (OCR fallback).
 * Returns the raw ISBN string or '' if none found.
 * @param {string} imageBase64
 * @param {string} mimeType
 * @returns {Promise<string>}
 */
export async function extractISBNFromImage(imageBase64, mimeType = 'image/jpeg') {
  const prompt = `Look at this image of a book back cover.
Find the ISBN number (either ISBN-10 or ISBN-13). It usually appears near the barcode.
Respond with ONLY the digits of the ISBN (no hyphens, spaces, or other text).
If no ISBN is visible, respond with exactly the word: NONE`;

  const raw = await callGemini(prompt, imageBase64, mimeType);
  const cleaned = raw.trim().toUpperCase();
  if (cleaned === 'NONE' || cleaned === '') return '';

  // Extract only digits, verify length
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 13 || digits.length === 10) return digits;
  if (digits.length > 0) return digits; // return whatever we got
  return '';
}

/**
 * Finds the best matching product from a local products array given book analysis.
 * Uses title similarity (token matching) and ISBN.
 * @param {BookAnalysis} analysis
 * @param {Array} products
 * @returns {{ product: Object|null, score: number, matchType: string }}
 */
export function matchProductByVisual(analysis, products) {
  if (!analysis || !products || products.length === 0) {
    return { product: null, score: 0, matchType: 'none' };
  }

  // 1. Exact ISBN match (highest confidence)
  if (analysis.isbn) {
    const isbnMatch = products.find(p =>
      p && String(p.barcode || '').replace(/\D/g, '') === analysis.isbn.replace(/\D/g, '')
    );
    if (isbnMatch) return { product: isbnMatch, score: 1.0, matchType: 'isbn' };
  }

  // 2. Title token matching
  if (!analysis.title) return { product: null, score: 0, matchType: 'none' };

  const titleTokens = analysis.title.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (titleTokens.length === 0) return { product: null, score: 0, matchType: 'none' };

  let bestProduct = null;
  let bestScore = 0;

  for (const p of products) {
    if (!p || !p.product_name) continue;
    const productName = p.product_name.toLowerCase();
    const productPublisher = (p.publisher || '').toLowerCase();

    const matchingTokens = titleTokens.filter(t => productName.includes(t));
    let score = matchingTokens.length / titleTokens.length;

    // Bonus for publisher match
    if (analysis.publisher && productPublisher.includes(analysis.publisher.toLowerCase().substring(0, 5))) {
      score = Math.min(1, score + 0.15);
    }

    if (score > bestScore) {
      bestScore = score;
      bestProduct = p;
    }
  }

  if (bestScore >= 0.6) {
    return { product: bestProduct, score: bestScore, matchType: 'title' };
  }

  return { product: null, score: bestScore, matchType: 'none' };
}

/**
 * Maps a Gemini category hint to the nearest Ghana school category ID.
 * @param {string} hint
 * @returns {{ id: string, name: string } | null}
 */
export function mapCategoryHint(hint) {
  if (!hint) return null;

  const hintLower = hint.toLowerCase();
  const mapping = [
    { keys: ['crèche', 'creche', 'nursery', 'kg'], id: 'cat-gh-1', name: 'Crèche & Nursery (KG 1 - 2)' },
    { keys: ['primary', 'class', 'basic'], id: 'cat-gh-2', name: 'Primary School (Class 1 - 6)' },
    { keys: ['junior', 'jhs', 'bece prep'], id: 'cat-gh-3', name: 'Junior High School (JHS 1 - 3 / BECE)' },
    { keys: ['shs core', 'english', 'maths', 'science', 'social'], id: 'cat-gh-4', name: 'SHS Core Subjects (English, Maths, Science, Social)' },
    { keys: ['shs science', 'elective math'], id: 'cat-gh-5', name: 'SHS Science & Elective Mathematics' },
    { keys: ['general arts', 'literature'], id: 'cat-gh-6', name: 'SHS General Arts & Literature' },
    { keys: ['business', 'accounting', 'economics'], id: 'cat-gh-7', name: 'SHS Business, Accounting & Economics' },
    { keys: ['visual arts', 'home econ', 'technical'], id: 'cat-gh-8', name: 'SHS Visual Arts, Home Econ & Technical' },
    { keys: ['bece', 'wassce', 'pasco', 'past question'], id: 'cat-gh-9', name: 'BECE & WASSCE Past Questions (Pasco)' },
    { keys: ['storybook', 'children', 'ghanaian lang'], id: 'cat-gh-10', name: 'Children Storybooks & Ghanaian Languages' },
    { keys: ['stationery', 'school suppl'], id: 'cat-gh-11', name: 'Stationery & School Supplies' }
  ];

  for (const entry of mapping) {
    if (entry.keys.some(k => hintLower.includes(k))) {
      return { id: entry.id, name: entry.name };
    }
  }

  // Default: primary school
  return { id: 'cat-gh-2', name: 'Primary School (Class 1 - 6)' };
}
