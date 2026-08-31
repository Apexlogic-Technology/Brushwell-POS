import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, X, Volume2, VolumeX, CheckCircle2, AlertCircle, Package, RotateCcw, ArrowRight } from 'lucide-react';
import {
  isSpeechRecognitionSupported,
  parseSpokenNumber,
  speakText
} from '../services/voiceService';

const STEPS = ['name', 'retail_price', 'wholesale_price', 'stock', 'barcode', 'confirm'];
const STEP_PROMPTS = {
  name:            'Please say the book title or product name. (e.g. "Aki-Ola Core Mathematics SHS 1")',
  retail_price:    'Nice! What is the retail price in Ghana Cedis? (e.g. "25 cedis" or "twenty five")',
  wholesale_price: 'Got it! What is the wholesale price, or say "skip" to use 80% default?',
  stock:           'Proper! How many copies or stock quantity do you have? (e.g. "50" or "one hundred")',
  barcode:         'Say the barcode or ISBN number, or say "skip" to auto-generate am.',
  confirm:         'All set, my boss! Say "confirm" to save to database, or say "restart".',
};

export default function VoiceProductModal({ isOpen, onClose, onProductAdded, existingCategories = [] }) {
  const [step, setStep]               = useState('name');
  const [productData, setProductData] = useState({});
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [errorMsg, setErrorMsg]       = useState('');
  const [lastMsg, setLastMsg]         = useState('');
  const [voiceFeedback, setVoiceFeedback] = useState(true);
  const [pulseLevel, setPulseLevel]   = useState(0);
  const [isComplete, setIsComplete]   = useState(false);

  const recognitionRef    = useRef(null);
  const isMountedRef      = useRef(false);
  const silenceTimerRef   = useRef(null);
  const latestSpeechRef   = useRef('');

  const isSupported = isSpeechRecognitionSupported();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopListening();
    };
  }, []);

  useEffect(() => {
    if (!isListening) { setPulseLevel(0); return; }
    const t = setInterval(() => setPulseLevel(Math.random() * 100), 120);
    return () => clearInterval(t);
  }, [isListening]);

  const resetForm = useCallback(() => {
    setStep('name');
    setProductData({});
    setIsListening(false);
    setInterimText('');
    setErrorMsg('');
    setLastMsg('');
    setIsComplete(false);
    latestSpeechRef.current = '';
  }, []);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
    if (isMountedRef.current) setIsListening(false);
  }, []);

  const advanceStep = useCallback((currentStep, rawValue, currentData) => {
    if (!rawValue) return;
    const value = rawValue.trim();
    const newData = { ...currentData };
    let feedback = '';

    if (currentStep === 'name') {
      const cleanName = value.replace(/^(the\s+name\s+is|product\s+name\s+is|it\s+is|title\s+is)\s+/i, '');
      newData.name = cleanName;
      feedback = `Aane! Book title is ${cleanName}. Now, what about the retail price in Cedis?`;
      setStep('retail_price');
    } else if (currentStep === 'retail_price') {
      const price = parseSpokenNumber(value);
      if (price === null || isNaN(price) || price <= 0) {
        setErrorMsg(`Chale, I couldn't get the price from "${value}". Say e.g. "25 cedis" or "15".`);
        return;
      }
      newData.retail_price = price;
      feedback = `Retail price is ${price.toFixed(2)} Cedis. What about the wholesale price, or should I skip am?`;
      setStep('wholesale_price');
    } else if (currentStep === 'wholesale_price') {
      const skipped = /skip|same|no|none|default/i.test(value);
      const price = parseSpokenNumber(value);
      if (skipped || price === null || isNaN(price)) {
        newData.wholesale_price = parseFloat((newData.retail_price * 0.8).toFixed(2));
        feedback = `Wholesale set to ${newData.wholesale_price} Cedis. Now how many copies in stock?`;
      } else {
        newData.wholesale_price = price;
        feedback = `Wholesale price is ${price.toFixed(2)} Cedis. Now how many copies in stock?`;
      }
      setStep('stock');
    } else if (currentStep === 'stock') {
      const qty = parseSpokenNumber(value);
      if (qty === null || isNaN(qty) || qty <= 0) {
        setErrorMsg(`Couldn't get quantity from "${value}". Try saying "50" or "one hundred".`);
        return;
      }
      newData.stock = Math.round(qty);
      feedback = `Proper! Stock is ${Math.round(qty)} copies. Say the barcode, or say skip to auto-generate.`;
      setStep('barcode');
    } else if (currentStep === 'barcode') {
      const skipped = /skip|no|none|blank|auto/i.test(value);
      const digits = value.replace(/\D/g, '');
      newData.barcode = (skipped || !digits) ? Math.floor(100000000000 + Math.random() * 900000000000).toString() : digits;
      feedback = skipped 
        ? `Barcode auto-generated. All set, my boss! Say confirm to save the book.` 
        : `Barcode is ${newData.barcode}. All set, my boss! Say confirm to save the book.`;
      setStep('confirm');
    } else if (currentStep === 'confirm') {
      if (/confirm|yes|ok|save|add|proceed|done/i.test(value)) {
        const product = {
          product_name: newData.name,
          retail_price: newData.retail_price,
          wholesale_price: newData.wholesale_price,
          stock_quantity: newData.stock,
          barcode: newData.barcode || '',
          category: 'Uncategorized',
          description: '',
        };
        if (onProductAdded) onProductAdded(product);
        feedback = `Great! Book "${newData.name}" added successfully to database. More sales to you!`;
        setIsComplete(true);
        if (voiceFeedback) speakText(feedback);
        setLastMsg(feedback);
        setProductData(newData);
        setTimeout(() => onClose(), 2200);
        return;
      } else if (/restart|again|redo|cancel|reset/i.test(value)) {
        resetForm();
        feedback = 'Starting over, my boss. ' + STEP_PROMPTS.name;
        if (voiceFeedback) speakText(feedback);
        setLastMsg(feedback);
        return;
      } else {
        setErrorMsg('Say "confirm" to save to database or "restart" to start over.');
        return;
      }
    }

    setErrorMsg('');
    setLastMsg(feedback);
    setProductData(newData);
    setInterimText('');
    latestSpeechRef.current = '';
    if (voiceFeedback) speakText(feedback);
  }, [voiceFeedback, onProductAdded, onClose, resetForm]);

  const handleTranscriptFinal = useCallback((text) => {
    if (!text || !isMountedRef.current) return;
    setInterimText('');
    advanceStep(step, text.trim(), productData);
  }, [step, productData, advanceStep]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setErrorMsg('Voice recognition not supported. Use Chrome or Edge.');
      return;
    }

    stopListening();

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      const lang = (typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('en'))
        ? navigator.language
        : 'en-US';

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onstart = () => {
        if (isMountedRef.current) {
          setIsListening(true);
          setErrorMsg('');
          setInterimText('');
          latestSpeechRef.current = '';
        }
      };

      recognition.onresult = (event) => {
        if (!isMountedRef.current) return;
        let interim = '';
        let final = '';

        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript + ' ';
          } else {
            interim += item[0].transcript + ' ';
          }
        }

        const combined = (final + interim).trim();
        latestSpeechRef.current = combined;
        setInterimText(combined);

        // Auto-advance step after 1.3s of silence
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (latestSpeechRef.current.trim()) {
            stopListening();
            handleTranscriptFinal(latestSpeechRef.current.trim());
          }
        }, 1400);
      };

      recognition.onerror = (event) => {
        if (!isMountedRef.current) return;
        if (event.error === 'no-speech') {
          setErrorMsg('No speech detected. Speak clearly into your mic.');
        } else if (event.error === 'not-allowed') {
          setErrorMsg('Microphone blocked. Please grant mic permission in your browser.');
        } else {
          setErrorMsg(`Notice: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        if (isMountedRef.current) {
          setIsListening(false);
          if (latestSpeechRef.current.trim()) {
            handleTranscriptFinal(latestSpeechRef.current.trim());
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Error starting speech recognition:', err);
      setIsListening(false);
    }
  }, [isSupported, handleTranscriptFinal, stopListening]);

  // Auto-start when modal opens or step changes
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      const timer = setTimeout(() => {
        if (voiceFeedback && step === 'name' && Object.keys(productData).length === 0) {
          speakText(STEP_PROMPTS.name);
        }
        startListening();
      }, 400);
      return () => clearTimeout(timer);
    } else {
      stopListening();
      resetForm();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const stepIndex = STEPS.indexOf(step);
  const progress = (stepIndex / (STEPS.length - 1)) * 100;

  const readCurrentPrompt = () => {
    if (voiceFeedback) speakText(STEP_PROMPTS[step]);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10001 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
        <style>{`
          @keyframes voicePulse {
            0%,100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
            50% { box-shadow: 0 0 0 14px rgba(124,58,237,0); }
          }
        `}</style>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: 'var(--accent-purple)', color: '#fff', padding: '0.35rem', borderRadius: 'var(--radius-sm)', display: 'flex' }}>
              <Package size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Add Product by Voice</h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Hands-free guided speech entry</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            <button type="button" className="btn-icon" onClick={() => setVoiceFeedback(v => !v)} style={{ width: '32px', height: '32px' }}>
              {voiceFeedback ? <Volume2 size={16} color="var(--primary)" /> : <VolumeX size={16} />}
            </button>
            <button type="button" className="btn-icon" onClick={onClose} style={{ width: '32px', height: '32px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* Step Progress */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              <span style={{ textTransform: 'capitalize', fontWeight: 800, color: 'var(--primary)' }}>
                Step {Math.min(stepIndex + 1, STEPS.length)} of {STEPS.length}: {step.replace('_', ' ')}
              </span>
              <span style={{ fontWeight: 700 }}>{Math.round(progress)}%</span>
            </div>
            <div style={{ height: '5px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--accent-purple))', borderRadius: '4px', transition: 'width 0.4s ease' }} />
            </div>
          </div>

          {/* Current Step Instruction Card */}
          <div style={{
            background: 'var(--primary-light)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 0.95rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            border: '1px solid hsla(222, 89%, 56%, 0.2)'
          }}>
            <div style={{ fontSize: '0.86rem', color: 'var(--primary)', fontWeight: 600, flex: 1 }}>
              {STEP_PROMPTS[step]}
            </div>
            <button type="button" onClick={readCurrentPrompt} title="Read prompt aloud" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: '4px', display: 'flex' }}>
              <Volume2 size={18} />
            </button>
          </div>

          {/* Mic Button & Waveform */}
          {!isComplete && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0' }}>
              <button
                type="button"
                onClick={isListening ? () => { stopListening(); if (latestSpeechRef.current.trim()) handleTranscriptFinal(latestSpeechRef.current.trim()); } : startListening}
                disabled={!isSupported}
                style={{
                  width: '64px', height: '64px',
                  borderRadius: '50%',
                  border: 'none',
                  background: isListening
                    ? 'linear-gradient(135deg, var(--accent-rose), hsl(348,83%,42%))'
                    : 'linear-gradient(135deg, var(--accent-purple), hsl(265,83%,45%))',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isSupported ? 'pointer' : 'not-allowed',
                  animation: isListening ? 'voicePulse 1.2s infinite' : 'none',
                  boxShadow: isListening ? '0 6px 20px rgba(239,68,68,0.35)' : '0 6px 20px rgba(124,58,237,0.3)',
                  transition: 'all 0.2s ease',
                }}
              >
                {isListening ? <Mic size={26} /> : <MicOff size={26} />}
              </button>
              <span style={{ fontSize: '0.82rem', color: isListening ? 'var(--accent-rose)' : 'var(--text-muted)', fontWeight: isListening ? 700 : 500 }}>
                {isListening ? '🔴 Listening... speak your answer' : 'Tap mic to speak'}
              </span>

              {/* Real-time transcribed text */}
              {interimText && (
                <div style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1.5px solid var(--accent-purple)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem 0.85rem',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: 'var(--text-main)',
                  width: '100%',
                  textAlign: 'center'
                }}>
                  "{interimText}"
                </div>
              )}
            </div>
          )}

          {/* Success screen */}
          {isComplete && (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--accent-emerald)' }}>
              <CheckCircle2 size={44} style={{ margin: '0 auto 0.5rem' }} />
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Book Saved to Database!</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>Closing dialog…</div>
            </div>
          )}

          {/* Feedback announcement */}
          {lastMsg && !isComplete && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.6rem 0.85rem',
              fontSize: '0.84rem',
              color: 'var(--text-main)',
              fontWeight: 500
            }}>
              💬 {lastMsg}
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--accent-rose)', background: 'var(--accent-rose-light)', borderRadius: 'var(--radius-md)', padding: '0.55rem 0.75rem' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} /> {errorMsg}
            </div>
          )}

          {/* Collected Data Summary */}
          {Object.keys(productData).length > 0 && !isComplete && (
            <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '0.65rem 0.85rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Saved Values</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {productData.name && <span style={{ fontSize: '0.74rem', background: 'var(--primary-light)', color: 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>Title: {productData.name}</span>}
                {productData.retail_price !== undefined && <span style={{ fontSize: '0.74rem', background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>Retail: GH₵{productData.retail_price.toFixed(2)}</span>}
                {productData.wholesale_price !== undefined && <span style={{ fontSize: '0.74rem', background: 'var(--accent-purple)', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>Wholesale: GH₵{productData.wholesale_price.toFixed(2)}</span>}
                {productData.stock !== undefined && <span style={{ fontSize: '0.74rem', background: 'var(--accent-amber-light)', color: 'var(--accent-amber)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>Stock: {productData.stock}</span>}
                {productData.barcode !== undefined && <span style={{ fontSize: '0.74rem', background: 'var(--bg-app)', color: 'var(--text-muted)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>ISBN: {productData.barcode}</span>}
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            {step !== 'name' && !isComplete && (
              <button type="button" className="btn-secondary" onClick={resetForm} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <RotateCcw size={13} /> Start Over
              </button>
            )}
            {step === 'confirm' && !isComplete && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => advanceStep('confirm', 'confirm', productData)}
                style={{ flex: 1, fontSize: '0.82rem', justifyContent: 'center' }}
              >
                <CheckCircle2 size={15} /> Save Book Now
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
