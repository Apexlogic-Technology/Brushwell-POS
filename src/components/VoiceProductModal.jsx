import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, X, Volume2, VolumeX, CheckCircle2, AlertCircle, Package, RotateCcw } from 'lucide-react';
import {
  isSpeechRecognitionSupported,
  parseVoiceProductCommand,
  speakText
} from '../services/voiceService';

// Voice command: "Add product, Aki-Ola Mathematics Class 6, retail price 25, wholesale 20, stock 50, barcode 1234567890"
// OR step-by-step: first "product name", then "price", then "stock"

const STEPS = ['name', 'retail_price', 'wholesale_price', 'stock', 'barcode', 'confirm'];
const STEP_PROMPTS = {
  name:            'Say the product name. For example: "Aki-Ola Mathematics Class 6"',
  retail_price:    'Say the retail price. For example: "25 cedis" or "12.50"',
  wholesale_price: 'Say the wholesale price or say "skip" to set same as retail',
  stock:           'Say the stock quantity. For example: "50" or "one hundred"',
  barcode:         'Say the barcode number, or say "skip" to leave it blank',
  confirm:         'Say "confirm" to add the product, or "restart" to start over',
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

  const recognitionRef = useRef(null);
  const isMountedRef   = useRef(false);

  const isSupported = isSpeechRecognitionSupported();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopListening();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopListening();
      resetForm();
    } else if (isOpen && isSupported) {
      // Auto-read first prompt
      setTimeout(() => {
        if (voiceFeedback) speakText(STEP_PROMPTS.name);
      }, 600);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isListening) { setPulseLevel(0); return; }
    const t = setInterval(() => setPulseLevel(Math.random() * 100), 150);
    return () => clearInterval(t);
  }, [isListening]);

  const resetForm = () => {
    setStep('name');
    setProductData({});
    setIsListening(false);
    setInterimText('');
    setErrorMsg('');
    setLastMsg('');
    setIsComplete(false);
  };

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
    if (isMountedRef.current) setIsListening(false);
  }, []);

  const advanceStep = useCallback((currentStep, value, currentData) => {
    const newData = { ...currentData };
    let feedback = '';

    if (currentStep === 'name') {
      newData.name = value;
      feedback = `Got it! Product name: ${value}. Now, ${STEP_PROMPTS.retail_price}`;
      setStep('retail_price');
    } else if (currentStep === 'retail_price') {
      const price = parseFloat(value.replace(/[^0-9.]/g, ''));
      if (isNaN(price)) {
        setErrorMsg('Could not parse price. Try saying a number like "25" or "12.50"');
        return;
      }
      newData.retail_price = price;
      feedback = `Retail price: GH₵ ${price}. Now, ${STEP_PROMPTS.wholesale_price}`;
      setStep('wholesale_price');
    } else if (currentStep === 'wholesale_price') {
      const skipped = /skip|same|no|none/i.test(value);
      const price = parseFloat(value.replace(/[^0-9.]/g, ''));
      newData.wholesale_price = skipped ? newData.retail_price : (isNaN(price) ? newData.retail_price : price);
      feedback = skipped ? `Wholesale same as retail. Now, ${STEP_PROMPTS.stock}` : `Wholesale: GH₵ ${newData.wholesale_price}. Now, ${STEP_PROMPTS.stock}`;
      setStep('stock');
    } else if (currentStep === 'stock') {
      const qty = parseInt(value.replace(/[^0-9]/g, ''), 10);
      if (isNaN(qty)) {
        setErrorMsg('Could not parse quantity. Say a number like "50"');
        return;
      }
      newData.stock = qty;
      feedback = `Stock: ${qty}. Now, ${STEP_PROMPTS.barcode}`;
      setStep('barcode');
    } else if (currentStep === 'barcode') {
      const skipped = /skip|no|none|blank/i.test(value);
      newData.barcode = skipped ? '' : value.replace(/\s/g, '');
      feedback = skipped ? `No barcode. ${STEP_PROMPTS.confirm}` : `Barcode: ${newData.barcode}. ${STEP_PROMPTS.confirm}`;
      setStep('confirm');
    } else if (currentStep === 'confirm') {
      if (/confirm|yes|ok|add|save/i.test(value)) {
        // Final product object
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
        feedback = `Product "${newData.name}" added successfully!`;
        setIsComplete(true);
        if (voiceFeedback) speakText(feedback);
        setLastMsg(feedback);
        setProductData(newData);
        setTimeout(() => onClose(), 2000);
        return;
      } else if (/restart|again|redo|cancel/i.test(value)) {
        resetForm();
        feedback = 'Starting over. ' + STEP_PROMPTS.name;
        if (voiceFeedback) speakText(feedback);
        setLastMsg(feedback);
        setProductData({});
        return;
      } else {
        setErrorMsg('Say "confirm" to save or "restart" to start again.');
        return;
      }
    }

    setErrorMsg('');
    setLastMsg(feedback);
    setProductData(newData);
    if (voiceFeedback) speakText(feedback);
  }, [voiceFeedback, onProductAdded, onClose]);

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

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-GH';

    recognition.onstart = () => {
      if (isMountedRef.current) {
        setIsListening(true);
        setErrorMsg('');
        setInterimText('');
      }
    };

    recognition.onresult = (event) => {
      if (!isMountedRef.current) return;
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      if (interim) setInterimText(interim);
      if (final) handleTranscriptFinal(final.trim());
    };

    recognition.onerror = (event) => {
      if (!isMountedRef.current) return;
      if (event.error === 'no-speech') {
        setErrorMsg('No speech detected. Please try again.');
      } else {
        setErrorMsg(`Error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isMountedRef.current) setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, handleTranscriptFinal]);

  if (!isOpen) return null;

  const stepIndex = STEPS.indexOf(step);
  const progress = (stepIndex / (STEPS.length - 1)) * 100;

  const readCurrentPrompt = () => {
    if (voiceFeedback) speakText(STEP_PROMPTS[step]);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1001 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
        <style>{`
          @keyframes voicePulse {
            0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
            50% { box-shadow: 0 0 0 12px rgba(59,130,246,0); }
          }
        `}</style>

        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: 'var(--accent-purple)', color: '#fff', padding: '0.35rem', borderRadius: 'var(--radius-sm)', display: 'flex' }}>
              <Package size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Add Product by Voice</h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Step-by-step guided voice entry</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button type="button" className="btn-icon" onClick={() => setVoiceFeedback(v => !v)} style={{ width: '28px', height: '28px' }}>
              {voiceFeedback ? <Volume2 size={15} color="var(--primary)" /> : <VolumeX size={15} />}
            </button>
            <button type="button" className="btn-icon" onClick={onClose} style={{ width: '28px', height: '28px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* Progress */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>
                Step {Math.min(stepIndex + 1, STEPS.length)}: {step.replace('_', ' ')}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--accent-purple))', borderRadius: '4px', transition: 'width 0.4s ease' }} />
            </div>
          </div>

          {/* Current Prompt */}
          <div style={{
            background: 'var(--primary-light)',
            borderRadius: 'var(--radius-md)',
            padding: '0.7rem 0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem'
          }}>
            <div style={{ fontSize: '0.84rem', color: 'var(--primary)', fontWeight: 500, flex: 1 }}>
              {STEP_PROMPTS[step]}
            </div>
            <button type="button" onClick={readCurrentPrompt} title="Read prompt aloud" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: '2px', display: 'flex' }}>
              <Volume2 size={16} />
            </button>
          </div>

          {/* Mic Button */}
          {!isComplete && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={!isSupported}
                style={{
                  width: '60px', height: '60px',
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
                {isListening ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              <span style={{ fontSize: '0.78rem', color: isListening ? 'var(--accent-rose)' : 'var(--text-muted)', fontWeight: isListening ? 600 : 400 }}>
                {isListening ? '🔴 Listening...' : 'Tap to speak'}
              </span>
              {interimText && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  "{interimText}…"
                </div>
              )}
            </div>
          )}

          {/* Success */}
          {isComplete && (
            <div style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--accent-emerald)' }}>
              <CheckCircle2 size={40} style={{ margin: '0 auto 0.5rem' }} />
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>Product Added!</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Closing in a moment…</div>
            </div>
          )}

          {/* Feedback Message */}
          {lastMsg && !isComplete && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.6rem 0.85rem',
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              fontStyle: 'italic'
            }}>
              {lastMsg}
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.79rem', color: 'var(--accent-rose)', background: 'var(--accent-rose-light)', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.75rem' }}>
              <AlertCircle size={14} /> {errorMsg}
            </div>
          )}

          {/* Collected Data Preview */}
          {Object.keys(productData).length > 0 && !isComplete && (
            <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '0.65rem 0.85rem' }}>
              <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Collected so far</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {productData.name && <span style={{ fontSize: '0.75rem', background: 'var(--primary-light)', color: 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>Name: {productData.name}</span>}
                {productData.retail_price !== undefined && <span style={{ fontSize: '0.75rem', background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>Retail: GH₵{productData.retail_price}</span>}
                {productData.wholesale_price !== undefined && <span style={{ fontSize: '0.75rem', background: 'var(--accent-emerald-light)', color: 'var(--accent-emerald)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>Wholesale: GH₵{productData.wholesale_price}</span>}
                {productData.stock !== undefined && <span style={{ fontSize: '0.75rem', background: 'var(--accent-amber-light)', color: 'var(--accent-amber)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>Stock: {productData.stock}</span>}
                {productData.barcode !== undefined && <span style={{ fontSize: '0.75rem', background: 'var(--bg-app)', color: 'var(--text-muted)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>{productData.barcode ? `Barcode: ${productData.barcode}` : 'No barcode'}</span>}
              </div>
            </div>
          )}

          {/* Restart Button */}
          {step !== 'name' && !isComplete && (
            <button type="button" className="btn-secondary" onClick={resetForm} style={{ fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <RotateCcw size={13} /> Start Over
            </button>
          )}

          {!isSupported && (
            <div style={{ background: 'var(--accent-amber-light)', border: '1px solid var(--accent-amber)', borderRadius: 'var(--radius-md)', padding: '0.65rem 0.85rem', fontSize: '0.8rem' }}>
              <AlertCircle size={15} style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
              Voice recognition requires Google Chrome or Microsoft Edge.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
