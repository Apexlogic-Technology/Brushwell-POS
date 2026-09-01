import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, X, Volume2, VolumeX, RotateCcw, ShoppingCart, CheckCircle2, AlertCircle, Sparkles, HelpCircle } from 'lucide-react';
import {
  isSpeechRecognitionSupported,
  parseVoiceSalesCommand,
  speakText,
  stopSpeaking,
  isSpeakingNow
} from '../services/voiceService';

const COMMAND_TIPS = [
  '"Add 3 Aki-Ola Mathematics"',
  '"5 Kokroko English Class 4"',
  '"Aki-Ola Science"',
  '"Remove Aki-Ola"',
  '"Switch to wholesale"',
  '"Apply 10 cedis discount"',
  '"Clear cart"',
  '"Checkout"',
];

export default function VoiceSellingModal({ 
  isOpen, 
  onClose, 
  products = [], 
  cart = [], 
  onAddToCart, 
  onRemoveFromCart, 
  onUpdateQty, 
  onSetPriceMode, 
  onApplyDiscount, 
  onToggleTax, 
  onCheckout, 
  onClearCart 
}) {
  const [isListening, setIsListening]       = useState(false);
  const [transcript, setTranscript]         = useState('');
  const [interimText, setInterimText]       = useState('');
  const [pendingAction, setPendingAction]   = useState(null);
  const [lastResult, setLastResult]         = useState(null);
  const [voiceFeedback, setVoiceFeedback]   = useState(true);
  const [errorMsg, setErrorMsg]             = useState('');
  const [tipIdx, setTipIdx]                 = useState(0);
  const [countdown, setCountdown]           = useState(null);
  const [pulseLevel, setPulseLevel]         = useState(0);

  const recognitionRef    = useRef(null);
  const isMountedRef      = useRef(false);
  const countdownRef      = useRef(null);
  const silenceTimerRef   = useRef(null);
  const latestSpeechRef   = useRef('');

  const isSupported = isSpeechRecognitionSupported();

  // Cycle tips
  useEffect(() => {
    const t = setInterval(() => setTipIdx(i => (i + 1) % COMMAND_TIPS.length), 3500);
    return () => clearInterval(t);
  }, []);

  // Audio wave pulse animation
  useEffect(() => {
    if (!isListening) { setPulseLevel(0); return; }
    const t = setInterval(() => {
      setPulseLevel(Math.random() * 100);
    }, 120);
    return () => clearInterval(t);
  }, [isListening]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopSpeaking();
      stopListening();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const clearAutoExecute = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    setCountdown(null);
  }, []);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
    if (isMountedRef.current) setIsListening(false);
  }, []);

  const executeAction = useCallback((action) => {
    if (!action) return;
    clearAutoExecute();
    stopListening(); // Fully stop microphone before assistant speaks!

    let feedbackText = '';

    switch (action.intent) {
      case 'ADD_TO_CART': {
        if (action.product) {
          onAddToCart(action.product, action.quantity || 1);
          feedbackText = action.quantity > 1
            ? `Chale, added ${action.quantity} copies of ${action.product.product_name} to cart sharp sharp!`
            : `Added ${action.product.product_name} to cart for you!`;
          setLastResult({ type: 'success', message: feedbackText, icon: '✓' });
        }
        break;
      }
      case 'REMOVE_FROM_CART': {
        if (action.product) {
          onRemoveFromCart(action.product.id);
          feedbackText = `Removed ${action.product.product_name} from cart, boss.`;
          setLastResult({ type: 'warning', message: feedbackText, icon: '✗' });
        }
        break;
      }
      case 'SET_PRICE_MODE': {
        if (onSetPriceMode) onSetPriceMode(action.mode);
        feedbackText = action.mode === 'wholesale' 
          ? `Switched to wholesale price, my boss!`
          : `Switched to retail price.`;
        setLastResult({ type: 'info', message: feedbackText, icon: '⇄' });
        break;
      }
      case 'APPLY_DISCOUNT': {
        if (onApplyDiscount) onApplyDiscount(action.amount);
        feedbackText = `Applied discount of ${action.amount} Cedis for you!`;
        setLastResult({ type: 'info', message: feedbackText, icon: '⊖' });
        break;
      }
      case 'TOGGLE_TAX': {
        if (onToggleTax) onToggleTax(action.value);
        feedbackText = action.value ? 'Tax enabled for this sale.' : 'Tax removed for this sale.';
        setLastResult({ type: 'info', message: feedbackText, icon: '%' });
        break;
      }
      case 'CLEAR_CART': {
        if (onClearCart) onClearCart();
        feedbackText = 'Cart cleared sharp sharp!';
        setLastResult({ type: 'warning', message: feedbackText, icon: '✗' });
        break;
      }
      case 'CHECKOUT': {
        feedbackText = 'Proceeding to checkout now now!';
        setLastResult({ type: 'success', message: feedbackText, icon: '✓' });
        if (onCheckout) onCheckout();
        setTimeout(() => onClose(), 600);
        break;
      }
      case 'SEARCH': {
        feedbackText = `Looking for "${action.query}" in catalog.`;
        setLastResult({ type: 'info', message: feedbackText, icon: '🔍' });
        break;
      }
      case 'IGNORE': {
        // Echo filter: ignore silently
        return;
      }
      default: {
        setLastResult({ type: 'error', message: 'Chale, I didn\'t catch that well. Please try again.', icon: '?' });
        feedbackText = 'Chale, I didn\'t catch that well. Please speak again.';
      }
    }

    // Reset speech state
    setPendingAction(null);
    setTranscript('');
    setInterimText('');
    latestSpeechRef.current = '';

    if (voiceFeedback && feedbackText) {
      speakText(feedbackText, {}, () => {
        // Speech finished callback
      });
    }
  }, [voiceFeedback, onAddToCart, onRemoveFromCart, onSetPriceMode, onApplyDiscount, onToggleTax, onClearCart, onCheckout, onClose, clearAutoExecute, stopListening]);

  const handleTranscriptFinal = useCallback((text) => {
    if (!text || !isMountedRef.current || isSpeakingNow()) return;
    const cleanText = text.trim();
    if (!cleanText) return;

    clearAutoExecute();

    const parsed = parseVoiceSalesCommand(cleanText, products);
    if (!parsed || parsed.intent === 'IGNORE') {
      // Discard echo feedback
      setInterimText('');
      setTranscript('');
      latestSpeechRef.current = '';
      return;
    }

    setTranscript(cleanText);
    setInterimText('');
    setPendingAction(parsed);

    if (parsed.intent === 'UNKNOWN') {
      setLastResult({ type: 'error', message: `Could not match book or command for: "${cleanText}"`, icon: '?' });
      return;
    }

    // Auto-execute countdown: 2 seconds
    let secs = 2;
    setCountdown(secs);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      secs -= 1;
      if (!isMountedRef.current) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        return;
      }
      if (secs <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        setCountdown(null);
        executeAction(parsed);
      } else {
        setCountdown(secs);
      }
    }, 1000);
  }, [products, executeAction, clearAutoExecute]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setErrorMsg('Voice recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    if (isSpeakingNow()) {
      // Assistant is currently speaking; do not activate mic
      return;
    }

    stopListening();

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      // Use system language with fallback to en-US
      const lang = (typeof navigator !== 'undefined' && navigator.language && navigator.language.startsWith('en'))
        ? navigator.language
        : 'en-US';

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        if (isMountedRef.current) {
          setIsListening(true);
          setErrorMsg('');
          setTranscript('');
          setInterimText('');
          setPendingAction(null);
          setLastResult(null);
          clearAutoExecute();
          latestSpeechRef.current = '';
        }
      };

      recognition.onresult = (event) => {
        if (!isMountedRef.current || isSpeakingNow()) return;
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
        if (isSpeakingNow()) return;

        latestSpeechRef.current = combined;
        setInterimText(combined);

        // Reset silence timer: when user pauses for 1.3s, auto-process speech
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (!isSpeakingNow() && latestSpeechRef.current.trim()) {
            stopListening();
            handleTranscriptFinal(latestSpeechRef.current.trim());
          }
        }, 1300);
      };

      recognition.onerror = (event) => {
        if (!isMountedRef.current) return;
        if (event.error === 'no-speech') {
          // Keep listening or display gentle note
          setErrorMsg('No speech heard yet. Please speak clearly into your microphone.');
        } else if (event.error === 'not-allowed') {
          setErrorMsg('Microphone access blocked. Please click the camera/mic icon in your browser address bar to allow.');
        } else if (event.error === 'network') {
          setErrorMsg('Speech recognition network error. Please check your internet connection.');
        } else {
          setErrorMsg(`Microphone notice: ${event.error}.`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        if (isMountedRef.current) {
          setIsListening(false);
          // If we have speech captured that wasn't finalized yet and assistant is not speaking
          if (!isSpeakingNow() && latestSpeechRef.current.trim() && !pendingAction) {
            handleTranscriptFinal(latestSpeechRef.current.trim());
          }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Speech recognition start error:', err);
      setErrorMsg('Could not initialize microphone. Please check permissions.');
      setIsListening(false);
    }
  }, [isSupported, handleTranscriptFinal, clearAutoExecute, stopListening, pendingAction]);

  // Auto-start when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setTranscript('');
      setInterimText('');
      setPendingAction(null);
      setLastResult(null);
      latestSpeechRef.current = '';
      const timer = setTimeout(() => {
        startListening();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      stopSpeaking();
      stopListening();
      clearAutoExecute();
    }
  }, [isOpen, clearAutoExecute, startListening, stopListening]);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
      if (!isSpeakingNow() && latestSpeechRef.current.trim()) {
        handleTranscriptFinal(latestSpeechRef.current.trim());
      }
    } else {
      startListening();
    }
  };

  if (!isOpen) return null;

  const pendingColor = pendingAction?.intent === 'UNKNOWN' ? 'var(--accent-amber)' :
    pendingAction?.intent === 'REMOVE_FROM_CART' || pendingAction?.intent === 'CLEAR_CART' ? 'var(--accent-rose)' :
    'var(--accent-emerald)';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10001 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <style>{`
          @keyframes pulseRing {
            0% { transform: scale(1); opacity: 0.7; }
            100% { transform: scale(1.8); opacity: 0; }
          }
          @keyframes waveBar {
            0%, 100% { transform: scaleY(0.3); }
            50% { transform: scaleY(1); }
          }
          .voice-wave-bar {
            width: 4px;
            border-radius: 4px;
            transform-origin: bottom;
            background: var(--primary);
            animation: waveBar 0.5s ease-in-out infinite;
          }
        `}</style>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '0.35rem', borderRadius: 'var(--radius-sm)', display: 'flex' }}>
              <Mic size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Voice Sales Assistant</h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Speak naturally to add products and control sales</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setVoiceFeedback(v => !v)}
              title={voiceFeedback ? 'Mute voice responses' : 'Enable voice responses'}
              style={{ width: '32px', height: '32px' }}
            >
              {voiceFeedback ? <Volume2 size={16} color="var(--primary)" /> : <VolumeX size={16} />}
            </button>
            <button type="button" className="btn-icon" onClick={onClose} style={{ width: '32px', height: '32px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* Unsupported warning */}
          {!isSupported && (
            <div style={{ background: 'var(--accent-amber-light)', border: '1px solid var(--accent-amber)', borderRadius: 'var(--radius-md)', padding: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <AlertCircle size={18} color="var(--accent-amber)" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>Browser Not Supported</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Voice recognition requires Google Chrome or Microsoft Edge.</div>
              </div>
            </div>
          )}

          {/* Microphone Button & Waveform */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 0 0.5rem'
          }}>
            {/* Pulsing Mic Button */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isListening && (
                <>
                  <div style={{
                    position: 'absolute',
                    width: '74px', height: '74px',
                    borderRadius: '50%',
                    background: 'var(--accent-rose)',
                    opacity: 0.25,
                    animation: 'pulseRing 1.2s ease-out infinite',
                  }} />
                  <div style={{
                    position: 'absolute',
                    width: '74px', height: '74px',
                    borderRadius: '50%',
                    background: 'var(--accent-rose)',
                    opacity: 0.15,
                    animation: 'pulseRing 1.2s ease-out 0.4s infinite',
                  }} />
                </>
              )}
              <button
                type="button"
                onClick={isSupported ? toggleListening : undefined}
                disabled={!isSupported}
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '50%',
                  border: 'none',
                  background: isListening
                    ? 'linear-gradient(135deg, hsl(348, 83%, 52%), hsl(348, 83%, 40%))'
                    : 'linear-gradient(135deg, var(--primary), hsl(222, 89%, 44%))',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isSupported ? 'pointer' : 'not-allowed',
                  boxShadow: isListening
                    ? '0 8px 24px hsla(348, 83%, 52%, 0.4)'
                    : '0 8px 24px var(--primary-glow)',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {isListening ? <Mic size={28} /> : <MicOff size={28} />}
              </button>
            </div>

            {/* Waveform Bars */}
            {isListening && (
              <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '24px' }}>
                {Array.from({ length: 14 }).map((_, i) => (
                  <div
                    key={i}
                    className="voice-wave-bar"
                    style={{
                      height: `${10 + (Math.sin((pulseLevel / 100) * Math.PI * 2 + i * 0.4) + 1) * 7}px`,
                      animationDelay: `${i * 0.06}s`,
                      background: 'var(--accent-rose)',
                      opacity: 0.8
                    }}
                  />
                ))}
              </div>
            )}

            {/* Status text */}
            <div style={{ textAlign: 'center' }}>
              {isListening ? (
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-rose)', margin: 0 }}>
                  🔴 Listening… speak now
                </p>
              ) : (
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                  Tap mic to start speaking
                </p>
              )}
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '4px 0 0', fontStyle: 'italic' }}>
                Example: {COMMAND_TIPS[tipIdx]}
              </p>
            </div>
          </div>

          {/* Real-Time Live Spoken Transcript */}
          {(interimText || transcript) && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1.5px solid var(--primary-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 0.95rem',
              fontSize: '0.92rem',
              lineHeight: 1.5,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}>
              <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '3px' }}>
                {isListening ? 'Hearing You Say...' : 'You Said:'}
              </div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1rem' }}>
                "{interimText || transcript}"
              </div>
            </div>
          )}

          {/* Pending Action Card with countdown */}
          {pendingAction && pendingAction.intent !== 'UNKNOWN' && (
            <div style={{
              background: pendingAction.intent === 'REMOVE_FROM_CART' || pendingAction.intent === 'CLEAR_CART'
                ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)',
              border: `1.5px solid ${pendingColor}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 0.95rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: pendingColor, textTransform: 'uppercase', marginBottom: '2px' }}>
                    {pendingAction.intent === 'ADD_TO_CART' ? '🛒 Adding to Cart' :
                     pendingAction.intent === 'REMOVE_FROM_CART' ? '🗑️ Removing from Cart' :
                     pendingAction.intent === 'CLEAR_CART' ? '⚠️ Clearing Cart' :
                     pendingAction.intent === 'SET_PRICE_MODE' ? '⇄ Switching Price Mode' :
                     pendingAction.intent === 'APPLY_DISCOUNT' ? '🏷️ Applying Discount' :
                     pendingAction.intent === 'CHECKOUT' ? '💳 Going to Checkout' :
                     'Action Detected'}
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                    {pendingAction.intent === 'ADD_TO_CART' && pendingAction.product &&
                      `${pendingAction.quantity > 1 ? pendingAction.quantity + ' × ' : ''}${pendingAction.product.product_name}`}
                    {pendingAction.intent === 'REMOVE_FROM_CART' && pendingAction.product && pendingAction.product.product_name}
                    {pendingAction.intent === 'SET_PRICE_MODE' && `${pendingAction.mode === 'wholesale' ? 'Wholesale' : 'Retail'} Mode`}
                    {pendingAction.intent === 'APPLY_DISCOUNT' && `GH₵ ${pendingAction.amount} Discount`}
                    {pendingAction.intent === 'CLEAR_CART' && 'Remove All Items'}
                    {pendingAction.intent === 'CHECKOUT' && 'Proceed to Payment'}
                  </div>
                  {pendingAction.intent === 'ADD_TO_CART' && pendingAction.product && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Price: GH₵ {parseFloat(pendingAction.product.retail_price || 0).toFixed(2)} • Stock: {pendingAction.product.stock_quantity}
                    </div>
                  )}
                </div>
                {countdown !== null && (
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '50%',
                    background: pendingColor, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.95rem', fontWeight: 800,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                  }}>
                    {countdown}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => executeAction(pendingAction)}
                  style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem', flex: 1, justifyContent: 'center' }}
                >
                  <CheckCircle2 size={14} /> Confirm Now
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { clearAutoExecute(); setPendingAction(null); setTranscript(''); setInterimText(''); latestSpeechRef.current = ''; }}
                  style={{ fontSize: '0.78rem', padding: '0.4rem 0.7rem' }}
                >
                  <RotateCcw size={13} /> Cancel
                </button>
              </div>
            </div>
          )}

          {/* Last Result Notice */}
          {lastResult && !pendingAction && (
            <div style={{
              background: lastResult.type === 'success' ? 'var(--accent-emerald-light)' :
                lastResult.type === 'error' ? 'var(--accent-rose-light)' : 'var(--accent-amber-light)',
              border: `1px solid ${lastResult.type === 'success' ? 'var(--accent-emerald)' :
                lastResult.type === 'error' ? 'var(--accent-rose)' : 'var(--accent-amber)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.85rem',
              fontSize: '0.86rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1.1rem' }}>{lastResult.icon}</span>
              {lastResult.message}
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.82rem', color: 'var(--accent-rose)', background: 'var(--accent-rose-light)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.85rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} /> {errorMsg}
            </div>
          )}

          {/* Cart Strip */}
          {cart && cart.length > 0 && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.55rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.8rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)' }}>
                <ShoppingCart size={14} />
                <span><strong style={{ color: 'var(--text-main)' }}>{cart.length}</strong> items in cart</span>
              </div>
              <button type="button" className="btn-secondary" onClick={() => { executeAction({ intent: 'CHECKOUT' }); }} style={{ fontSize: '0.74rem', padding: '0.25rem 0.65rem' }}>
                Checkout →
              </button>
            </div>
          )}

          {/* Command Suggestions */}
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.65rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Supported Voice Commands</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {['Add [qty] [book]', 'Aki-Ola [Subject]', 'Remove [book]', 'Wholesale mode', 'Discount [amount]', 'Clear cart', 'Checkout'].map(tip => (
                <span 
                  key={tip} 
                  onClick={() => {
                    if (tip.startsWith('Add')) {
                      // test
                    }
                  }}
                  style={{
                    background: 'var(--primary-light)',
                    color: 'var(--primary)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.55rem',
                    borderRadius: 'var(--radius-full)',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  {tip}
                </span>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
