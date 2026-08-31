/**
 * Voice Service for Brushwell POS
 * 100% Free - Built using standard browser Web Speech API & Speech Synthesis
 */

// Check if browser supports speech recognition
export function isSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Check if browser supports speech synthesis (voice response)
export function isSpeechSynthesisSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean('speechSynthesis' in window);
}

// Spoken numbers dictionary
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  dozen: 12, 'a dozen': 12, 'one dozen': 12, 'two dozen': 24, 'three dozen': 36,
  'half dozen': 6, 'half a dozen': 6
};

const STOP_WORDS = new Set([
  'please', 'can', 'you', 'i', 'want', 'to', 'buy', 'sell', 'give', 'me',
  'add', 'a', 'an', 'the', 'book', 'books', 'copy', 'copies', 'piece',
  'pieces', 'item', 'items', 'of', 'for', 'put', 'get', 'in', 'cart', 'some'
]);

/**
 * Convert spoken number phrases to numeric values
 * Example: "three" -> 3, "twenty five" -> 25, "a dozen" -> 12, "50" -> 50
 */
export function parseSpokenNumber(text) {
  if (!text) return null;
  const clean = String(text).toLowerCase().trim();

  // Extract direct digits if present
  const digitMatch = clean.match(/(\d+(?:\.\d+)?)/);
  if (digitMatch) {
    const num = parseFloat(digitMatch[1]);
    if (!isNaN(num)) return num;
  }

  // Check direct word match
  if (NUMBER_WORDS[clean] !== undefined) {
    return NUMBER_WORDS[clean];
  }

  // Check compound words like "twenty five" -> 25
  const words = clean.split(/[\s-]+/);
  let total = 0;
  let current = 0;
  let found = false;

  for (const w of words) {
    if (NUMBER_WORDS[w] !== undefined) {
      found = true;
      const val = NUMBER_WORDS[w];
      if (val === 100 || val === 1000) {
        current = (current || 1) * val;
      } else {
        current += val;
      }
    } else if (/^\d+$/.test(w)) {
      found = true;
      current += parseInt(w, 10);
    }
  }

  total += current;
  return found && total > 0 ? total : null;
}

/**
 * Clean text for phonetic / token matching
 */
export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fuzzy score a product against speech query tokens
 */
function calculateMatchScore(product, queryTokens) {
  if (!product || queryTokens.length === 0) return 0;

  const nameTokens = normalizeText(product.product_name || '').split(' ').filter(Boolean);
  const pubTokens = normalizeText(product.publisher || '').split(' ').filter(Boolean);
  const catTokens = normalizeText(product.category_name || '').split(' ').filter(Boolean);
  const barcode = String(product.barcode || '').toLowerCase();

  let matchedTokens = 0;
  let exactPhraseBonus = 0;

  const fullQuery = queryTokens.join(' ');
  const fullProdName = normalizeText(product.product_name || '');

  if (fullProdName.includes(fullQuery)) {
    exactPhraseBonus = 4;
  }

  for (const token of queryTokens) {
    if (token.length < 2) continue;

    // Direct match in barcode
    if (barcode && barcode.includes(token)) {
      matchedTokens += 5;
      continue;
    }

    // Direct token match in product name
    const foundInName = nameTokens.some(nt => 
      nt === token || 
      nt.startsWith(token) || 
      token.startsWith(nt) || 
      (token.length >= 3 && nt.includes(token)) ||
      (nt.length >= 3 && token.includes(nt))
    );
    if (foundInName) {
      matchedTokens += 2.5;
      continue;
    }

    // Match in publisher
    const foundInPub = pubTokens.some(pt => pt === token || pt.startsWith(token));
    if (foundInPub) {
      matchedTokens += 1.5;
      continue;
    }

    // Match in category
    const foundInCat = catTokens.some(ct => ct === token || ct.startsWith(token));
    if (foundInCat) {
      matchedTokens += 0.8;
    }
  }

  return matchedTokens + exactPhraseBonus;
}

/**
 * Parse Sales Voice Command
 * Handles:
 * - "Add 3 copies of Aki-Ola Core Mathematics"
 * - "2 Kokroko English"
 * - "Aki-Ola Science"
 * - "Remove Aki-Ola"
 * - "Wholesale mode" / "Retail mode"
 * - "Checkout" / "Pay"
 * - "Clear cart"
 * - "Apply 10 cedis discount"
 */
export function parseVoiceSalesCommand(rawTranscript, products = []) {
  if (!rawTranscript) return { intent: 'UNKNOWN', raw: '' };

  const transcript = rawTranscript.trim();
  const normalized = normalizeText(transcript);

  // 1. Navigation & System Commands
  if (/(checkout|pay|complete sale|payment|process sale|finish sale)/i.test(normalized)) {
    return { intent: 'CHECKOUT', raw: transcript };
  }

  if (/(clear cart|empty cart|delete cart|remove all|clear all)/i.test(normalized)) {
    return { intent: 'CLEAR_CART', raw: transcript };
  }

  if (/(wholesale|switch to wholesale|wholesale mode|wholesale price)/i.test(normalized)) {
    return { intent: 'SET_PRICE_MODE', mode: 'wholesale', raw: transcript };
  }

  if (/(retail|switch to retail|retail mode|retail price)/i.test(normalized)) {
    return { intent: 'SET_PRICE_MODE', mode: 'retail', raw: transcript };
  }

  if (/(enable tax|apply tax|with tax|add tax)/i.test(normalized)) {
    return { intent: 'TOGGLE_TAX', value: true, raw: transcript };
  }

  if (/(disable tax|remove tax|without tax|no tax)/i.test(normalized)) {
    return { intent: 'TOGGLE_TAX', value: false, raw: transcript };
  }

  // 2. Discount Command: "Discount 10 cedis" or "Apply 5 discount"
  const discountMatch = normalized.match(/(?:discount|apply discount|give discount|less)\s+(?:of\s+)?(\d+(?:\.\d+)?|[a-z\s]+)(?:\s+cedis|\s+ghc|\s+ghs)?/);
  if (discountMatch) {
    const num = parseSpokenNumber(discountMatch[1]);
    if (num !== null && num >= 0) {
      return { intent: 'APPLY_DISCOUNT', amount: num, raw: transcript };
    }
  }

  // 3. Remove/Delete from Cart Command
  const removeMatch = normalized.match(/^(?:remove|delete|cancel|drop)\s+(?:item\s+)?(.+)$/);
  if (removeMatch) {
    const queryPart = removeMatch[1].trim();
    const queryTokens = queryPart.split(' ').filter(w => !STOP_WORDS.has(w));
    let bestMatch = null;
    let highestScore = 0;

    for (const p of products) {
      const score = calculateMatchScore(p, queryTokens);
      if (score > highestScore && score >= 1.2) {
        highestScore = score;
        bestMatch = p;
      }
    }

    if (bestMatch) {
      return {
        intent: 'REMOVE_FROM_CART',
        product: bestMatch,
        raw: transcript
      };
    }
  }

  // 4. Add to Cart with Quantity:
  // e.g. "Add 3 copies of Aki-Ola Science", "5 Kokroko English", "Aki-Ola Mathematics"
  let quantity = 1;
  let queryText = normalized;

  // Extract quantity from beginning
  const leadingQtyMatch = queryText.match(/^(\d+|a dozen|half dozen|half a dozen|one dozen|two dozen|three dozen|[a-z]+)\s+(?:copies\s+of|pieces\s+of|copies|pieces|pcs|qty\s+)?(.+)$/);
  if (leadingQtyMatch) {
    const potentialQty = parseSpokenNumber(leadingQtyMatch[1]);
    if (potentialQty && potentialQty > 0) {
      quantity = potentialQty;
      queryText = leadingQtyMatch[2].trim();
    }
  }

  // Also check quantity at the end: e.g. "Aki-Ola Science 3 pieces"
  const trailingQtyMatch = queryText.match(/^(.+?)\s+(?:quantity|qty|pieces|copies|pcs)\s+(\d+|[a-z]+)$/);
  if (trailingQtyMatch) {
    const potentialQty = parseSpokenNumber(trailingQtyMatch[2]);
    if (potentialQty && potentialQty > 0) {
      quantity = potentialQty;
      queryText = trailingQtyMatch[1].trim();
    }
  }

  // Clean tokens by removing filler words
  const allTokens = queryText.split(' ').filter(Boolean);
  const meaningfulTokens = allTokens.filter(w => !STOP_WORDS.has(w) && w.length >= 2);
  const tokensToUse = meaningfulTokens.length > 0 ? meaningfulTokens : allTokens;

  // Match against catalog
  let bestMatch = null;
  let highestScore = 0;

  for (const p of products) {
    const score = calculateMatchScore(p, tokensToUse);
    if (score > highestScore && score >= 1.0) {
      highestScore = score;
      bestMatch = p;
    }
  }

  if (bestMatch) {
    return {
      intent: 'ADD_TO_CART',
      product: bestMatch,
      quantity: Math.min(quantity, 500),
      raw: transcript
    };
  }

  // Search intent fallback if no direct product found
  if (tokensToUse.length > 0) {
    return {
      intent: 'SEARCH',
      query: tokensToUse.join(' '),
      raw: transcript
    };
  }

  return { intent: 'UNKNOWN', raw: transcript };
}

/**
 * Parse Voice Product Addition Command
 * Extracts Title, Publisher, Retail Price, Wholesale Price, Stock, Category, Barcode
 * Example: "Add book Aki-Ola Core Mathematics SHS 1, publisher Aki-Ola, retail 45, wholesale 38, quantity 100"
 */
export function parseVoiceProductCommand(rawTranscript, categories = []) {
  if (!rawTranscript) return null;
  const transcript = rawTranscript.trim();
  const lower = transcript.toLowerCase();

  const extracted = {
    product_name: '',
    publisher: '',
    retail_price: '',
    wholesale_price: '',
    stock_quantity: '10000',
    category_id: categories.length > 0 ? categories[0].id : 'cat-gh-1',
    category_name: categories.length > 0 ? categories[0].name : 'Primary School',
    barcode: ''
  };

  // 1. Extract Retail Price: "retail price 45", "retail 45", "price 45 cedis", "sell 45"
  const retailMatch = lower.match(/(?:retail\s+price|retail|selling\s+price|price)\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?|[a-z\s]+?)(?:\s+cedis|\s+ghc|\s+ghs|,|$)/i);
  if (retailMatch) {
    const num = parseSpokenNumber(retailMatch[1]);
    if (num !== null) extracted.retail_price = String(num);
  }

  // 2. Extract Wholesale Price: "wholesale price 38", "wholesale 38"
  const wholesaleMatch = lower.match(/(?:wholesale\s+price|wholesale)\s*(?:is|of|:)?\s*(\d+(?:\.\d+)?|[a-z\s]+?)(?:\s+cedis|\s+ghc|\s+ghs|,|$)/i);
  if (wholesaleMatch) {
    const num = parseSpokenNumber(wholesaleMatch[1]);
    if (num !== null) extracted.wholesale_price = String(num);
  }

  // 3. Extract Stock Quantity: "stock 200", "quantity 200", "stock quantity 200", "150 pieces"
  const stockMatch = lower.match(/(?:stock\s+quantity|stock|quantity|qty)\s*(?:is|of|:)?\s*(\d+|[a-z\s]+?)(?:\s+copies|\s+pieces|\s+pcs|,|$)/i);
  if (stockMatch) {
    const num = parseSpokenNumber(stockMatch[1]);
    if (num !== null && num >= 0) extracted.stock_quantity = String(num);
  }

  // 4. Extract Publisher / Author: "publisher Aki-Ola", "author Sedco", "by Aki Ola"
  const pubMatch = transcript.match(/(?:publisher|author|by)\s*(?:is|:)?\s*([A-Za-z0-9\s\-&]+?)(?:,|retail|wholesale|stock|price|category|barcode|$)/i);
  if (pubMatch) {
    extracted.publisher = pubMatch[1].trim();
  }

  // 5. Extract Barcode / ISBN: "barcode 9789988123456", "isbn 978..."
  const barcodeMatch = transcript.match(/(?:barcode|isbn)\s*(?:is|:)?\s*([0-9\-]+)/i);
  if (barcodeMatch) {
    extracted.barcode = barcodeMatch[1].replace(/[^0-9]/g, '');
  }

  // 6. Extract Category
  if (categories && categories.length > 0) {
    for (const cat of categories) {
      const catKeywords = cat.name.toLowerCase().split(/[\s,()&-]+/).filter(w => w.length > 3);
      const isMatch = catKeywords.some(kw => lower.includes(kw));
      if (isMatch) {
        extracted.category_id = cat.id;
        extracted.category_name = cat.name;
        break;
      }
    }
  }

  // 7. Extract Product Name / Title
  let titleCandidate = transcript;
  const explicitTitleMatch = transcript.match(/(?:title|book\s+title|name|add\s+book)\s*(?:is|:)?\s*([^,]+?)(?:,|publisher|author|by|retail|wholesale|stock|price|category|barcode|$)/i);
  if (explicitTitleMatch && explicitTitleMatch[1].trim().length > 2) {
    titleCandidate = explicitTitleMatch[1].trim();
  } else {
    titleCandidate = titleCandidate
      .replace(/^(add|create|new)\s+(book|product|item)\s+/i, '')
      .split(/(?:,|\s+publisher|\s+author|\s+by|\s+retail|\s+wholesale|\s+stock|\s+price|\s+category|\s+barcode)/i)[0];
  }

  extracted.product_name = titleCandidate.trim();

  // If wholesale wasn't spoken, default to 85% of retail price
  if (extracted.retail_price && !extracted.wholesale_price) {
    const rVal = parseFloat(extracted.retail_price);
    if (!isNaN(rVal) && rVal > 0) {
      extracted.wholesale_price = (rVal * 0.85).toFixed(2);
    }
  }

  // Auto-generate barcode if none spoken
  if (!extracted.barcode) {
    extracted.barcode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
  }

  return extracted;
}

/**
 * Text-to-Speech synthesis for spoken audio feedback
 * Prioritizes West African/African English or warm natural voices
 */
export function speakText(text, options = {}) {
  if (!isSpeechSynthesisSupported() || !text) return;
  try {
    window.speechSynthesis.cancel(); // cancel any active speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate || 0.98; // Slightly relaxed, natural Ghanaian pace
    utterance.pitch = options.pitch || 1.02;
    utterance.volume = options.volume !== undefined ? options.volume : 0.95;

    // Prioritize African / West African / warm English voices
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const preferredVoice = 
        voices.find(v => v.lang === 'en-GH' || v.lang === 'en-NG') ||
        voices.find(v => v.lang === 'en-ZA') ||
        voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Arthur')));
      if (preferredVoice) utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Speech synthesis failed:', e);
  }
}
