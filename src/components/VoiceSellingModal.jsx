import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, X, Volume2, VolumeX, RotateCcw, ShoppingCart, Zap, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import {
  isSpeechRecognitionSupported,
  parseVoiceSalesCommand,
  speakText
} from '../services/voiceService';

const COMMAND_TIPS = [
  '"Add 3 Aki-Ola Mathematics"',
  '"5 Kokroko English Class 4"',
  '"Remove Aki-Ola"',
  '"Switch to wholesale"',
  '"Apply 10 cedis discount"',
  '"Clear cart"',
  '"Checkout"',
];

export default function VoiceSellingModal({ isOpen, onClose, products = [], cart, onAddToCart, onRemoveFromCart, onUpdateQty, onSetPriceMode, onApplyDiscount, onToggleTax, onCheckout, onClearCart }) {
  const [isListening, setIsListening]       = useState(false);
  const [transcript, setTranscript]         = useState('');
  const [interimText, setInterimText]       = useState('');
  const [pendingAction, setPendingAction]   = useState(null);
  const [lastResult, setLastResult]         = useState(null);
  const [voiceFeedback, setVoiceFeedback]   = useState(true);
  const [errorMsg, setErrorMsg]             = useState('');
  const [tipIdx, setTipIdx]                 = useState(0);
  const [autoExecuteTimer, setAutoExecuteTimer] = useState(null);
  const [countdown, setCountdown]           = useState(null);
  const [pulseLevel, setPulseLevel]         = useState(0);

  const recognitionRef   = useRef(null);
  const isMountedRef     = useRef(false);
  const countdownRef     = useRef(null);
  const audioCtxRef      = useRef(null);

  const isSupported = isSpeechRecognitionSupported();

  // Cycle tips
  useEffect(() => {
    const t = setInterval(() => setTipIdx(i => (i + 1) % COMMAND_TIPS.length), 3500);
    return () => clearInterval(t);
  }, []);

  // Pulse animation when listening
  useEffect(() => {
    if (!isListening) { setPulseLevel(0); return; }
    const t = setInterval(() => {
      setPulseLevel(Math.random() * 100);
    }, 150);
    return () => clearInterval(t);
  }, [isListening]);

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
      setPendingAction(null);
      setTranscript('');
      setInterimText('');
      setLastResult(null);
      setErrorMsg('');
      clearAutoExecute();
    }
  }, [isOpen]);

  const clearAutoExecute = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(null);
    setAutoExecuteTimer(null);
  }, []);

  const executeAction = useCallback((action) => {
    if (!action) return;
    clearAutoExecute();
    let feedbackText = '';

    switch (action.intent) {
      case 'ADD_TO_CART': {
        if (action.product) {
          onAddToCart(action.product, action.quantity || 1);
          feedbackText = `Added ${action.quantity > 1 ? action.quantity + ' copies of ' : ''}${action.product.product_name} to cart`;
          setLastResult({ type: 'success', message: feedbackText, icon: '✓' });
        }
        break;
      }
      case 'REMOVE_FROM_CART': {
        if (action.product) {
          onRemoveFromCart(action.product.id);
          feedbackText = `Removed ${action.product.product_name} from cart`;
          setLastResult({ type: 'warning', message: feedbackText, icon: '✗' });
        }
        break;
      }
      case 'SET_PRICE_MODE': {
        if (onSetPriceMode) onSetPriceMode(action.mode);
        feedbackText = `Switched to ${action.mode} pricing`;
        setLastResult({ type: 'info', message: feedbackText, icon: '⇄' });
        break;
      }
      case 'APPLY_DISCOUNT': {
        if (onApplyDiscount) onApplyDiscount(action.amount);
        feedbackText = `Applied discount of GH₵ ${action.amount}`;
        setLastResult({ type: 'info', message: feedbackText, icon: '⊖' });
        break;
      }
      case 'TOGGLE_TAX': {
        if (onToggleTax) onToggleTax(action.value);
        feedbackText = action.value ? 'Tax enabled' : 'Tax disabled';
        setLastResult({ type: 'info', message: feedbackText, icon: '%' });
        break;
      }
      case 'CLEAR_CART': {
        if (onClearCart) onClearCart();
        feedbackText = 'Cart cleared';
        setLastResult({ type: 'warning', message: feedbackText, icon: '✗' });
        break;
      }
      case 'CHECKOUT': {
        feedbackText = 'Opening checkout';
        setLastResult({ type: 'success', message: feedbackText, icon: '✓' });
        if (onCheckout) onCheckout();
        setTimeout(() => onClose(), 600);
        break;
      }
      case 'SEARCH': {
        feedbackText = `Searching for "${action.query}"`;
        setLastResult({ type: 'info', message: feedbackText, icon: '🔍' });
        break;
      }
      default: {
        setLastResult({ type: 'error', message: 'Command not recognized. Try again.', icon: '?' });
        feedbackText = 'Command not recognized';
      }
    }

    if (voiceFeedback && feedbackText) {
      speakText(feedbackText);
    }

    setPendingAction(null);
    setTranscript('');
    setInterimText('');
  }, [voiceFeedback, onAddToCart, onRemoveFromCart, onSetPriceMode, onApplyDiscount, onToggleTax, onClearCart, onCheckout, onClose, clearAutoExecute]);

  const handleTranscriptFinal = useCallback((text) => {
    if (!text || !isMountedRef.current) return;
    setTranscript(text);
    setInterimText('');

    const parsed = parseVoiceSalesCommand(text, products);
    setPendingAction(parsed);

    if (parsed.intent === 'UNKNOWN') {
      setLastResult({ type: 'error', message: `Could not understand: "${text}"`, icon: '?' });
      return;
    }

    // Auto-execute with 2 second countdown
    let secs = 2;
    setCountdown(secs);
    countdownRef.current = setInterval(() => {
      secs -= 1;
      if (!isMountedRef.current) { clearInterval(countdownRef.current); return; }
      if (secs <= 0) {
        clearInterval(countdownRef.current);
        setCountdown(null);
        executeAction(parsed);
      } else {
        setCountdown(secs);
      }
    }, 1000);
  }, [products, executeAction, clearAutoExecute]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      recognitionRef.current = null;
    }
    if (isMountedRef.current) setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setErrorMsg('Voice recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-GH';
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
        setErrorMsg('No speech detected. Try speaking louder or closer to your mic.');
      } else if (event.error === 'not-allowed') {
        setErrorMsg('Microphone permission denied. Please allow mic access and try again.');
      } else {
        setErrorMsg(`Error: ${event.error}. Please try again.`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isMountedRef.current) setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, handleTranscriptFinal, clearAutoExecute]);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isOpen) return null;

  const pendingColor = pendingAction?.intent === 'UNKNOWN' ? 'var(--accent-amber)' :
    pendingAction?.intent === 'REMOVE_FROM_CART' || pendingAction?.intent === 'CLEAR_CART' ? 'var(--accent-rose)' :
    'var(--accent-emerald)';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
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
            animation: waveBar 0.6s ease-in-out infinite;
          }
        `}</style>

        {/* Header */}
        <div className="modal-header" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '0.35rem', borderRadius: 'var(--radius-sm)', display: 'flex' }}>
              <Mic size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Voice Selling Assistant</h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Speak to add items, set quantities, checkout</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setVoiceFeedback(v => !v)}
              title={voiceFeedback ? 'Mute voice responses' : 'Enable voice responses'}
              style={{ width: '28px', height: '28px' }}
            >
              {voiceFeedback ? <Volume2 size={15} color="var(--primary)" /> : <VolumeX size={15} />}
            </button>
            <button type="button" className="btn-icon" onClick={onClose} style={{ width: '28px', height: '28px' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* Unsupported warning */}
          {!isSupported && (
            <div style={{ background: 'var(--accent-amber-light)', border: '1px solid var(--accent-amber)', borderRadius: 'var(--radius-md)', padding: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <AlertCircle size={18} color="var(--accent-amber)" style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>Browser Not Supported</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Voice recognition requires Google Chrome or Microsoft Edge. You can still use barcode scanning or manual search.</div>
              </div>
            </div>
          )}

          {/* Microphone Visualizer */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.85rem',
            padding: '1.25rem 0 0.75rem'
          }}>
            {/* Pulsing Mic Button */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isListening && (
                <>
                  <div style={{
                    position: 'absolute',
                    width: '72px', height: '72px',
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    opacity: 0.15,
                    animation: 'pulseRing 1.2s ease-out infinite',
                  }} />
                  <div style={{
                    position: 'absolute',
                    width: '72px', height: '72px',
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    opacity: 0.1,
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
                {isListening ? <MicOff size={28} /> : <Mic size={28} />}
              </button>
            </div>

            {/* Waveform */}
            {isListening && (
              <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '28px' }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="voice-wave-bar"
                    style={{
                      height: `${12 + (Math.sin((pulseLevel / 100) * Math.PI * 2 + i * 0.5) + 1) * 8}px`,
                      animationDelay: `${i * 0.08}s`,
                      opacity: 0.7 + (i % 3) * 0.1
                    }}
                  />
                ))}
              </div>
            )}

            {/* Status text */}
            <div style={{ textAlign: 'center' }}>
              {isListening ? (
                <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--accent-rose)', margin: 0, animation: 'none' }}>
                  🔴 Listening… speak now
                </p>
              ) : (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                  Tap the mic and speak your command
                </p>
              )}
              <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', margin: '4px 0 0', fontStyle: 'italic' }}>
                Try: {COMMAND_TIPS[tipIdx]}
              </p>
            </div>
          </div>

          {/* Live Transcript */}
          {(transcript || interimText) && (
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.85rem',
              fontSize: '0.88rem',
              lineHeight: 1.5
            }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '4px' }}>You said</div>
              {transcript && <span style={{ fontWeight: 600 }}>"{transcript}"</span>}
              {interimText && !transcript && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>"{interimText}…"</span>}
            </div>
          )}

          {/* Pending Action Card with auto-execute countdown */}
          {pendingAction && pendingAction.intent !== 'UNKNOWN' && (
            <div style={{
              background: pendingAction.intent === 'REMOVE_FROM_CART' || pendingAction.intent === 'CLEAR_CART'
                ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)',
              border: `1.5px solid ${pendingColor}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.65rem 0.85rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: pendingColor, textTransform: 'uppercase', marginBottom: '2px' }}>
                    {pendingAction.intent === 'ADD_TO_CART' ? 'Adding to Cart' :
                     pendingAction.intent === 'REMOVE_FROM_CART' ? 'Removing from Cart' :
                     pendingAction.intent === 'CLEAR_CART' ? 'Clearing Cart' :
                     pendingAction.intent === 'SET_PRICE_MODE' ? 'Switching Price Mode' :
                     pendingAction.intent === 'APPLY_DISCOUNT' ? 'Applying Discount' :
                     pendingAction.intent === 'CHECKOUT' ? 'Going to Checkout' :
                     'Action Detected'}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                    {pendingAction.intent === 'ADD_TO_CART' && pendingAction.product &&
                      `${pendingAction.quantity > 1 ? pendingAction.quantity + ' × ' : ''}${pendingAction.product.product_name}`}
                    {pendingAction.intent === 'REMOVE_FROM_CART' && pendingAction.product && pendingAction.product.product_name}
                    {pendingAction.intent === 'SET_PRICE_MODE' && `${pendingAction.mode === 'wholesale' ? 'Wholesale' : 'Retail'} Mode`}
                    {pendingAction.intent === 'APPLY_DISCOUNT' && `GH₵ ${pendingAction.amount} Discount`}
                    {pendingAction.intent === 'CLEAR_CART' && 'Remove All Items'}
                    {pendingAction.intent === 'CHECKOUT' && 'Proceed to Payment'}
                  </div>
                  {pendingAction.intent === 'ADD_TO_CART' && pendingAction.product && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      GH₵ {parseFloat(pendingAction.product.retail_price || 0).toFixed(2)} each
                      • Stock: {pendingAction.product.stock_quantity}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                  {countdown !== null && (
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: pendingColor, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.9rem', fontWeight: 800
                    }}>
                      {countdown}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => executeAction(pendingAction)}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', flex: 1 }}
                >
                  <CheckCircle2 size={13} /> Confirm Now
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => { clearAutoExecute(); setPendingAction(null); setTranscript(''); }}
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
                >
                  <RotateCcw size={12} /> Cancel
                </button>
              </div>
            </div>
          )}

          {/* Last Result */}
          {lastResult && !pendingAction && (
            <div style={{
              background: lastResult.type === 'success' ? 'var(--accent-emerald-light)' :
                lastResult.type === 'error' ? 'var(--accent-rose-light)' : 'var(--accent-amber-light)',
              border: `1px solid ${lastResult.type === 'success' ? 'var(--accent-emerald)' :
                lastResult.type === 'error' ? 'var(--accent-rose)' : 'var(--accent-amber)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.6rem 0.85rem',
              fontSize: '0.84rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1rem' }}>{lastResult.icon}</span>
              {lastResult.message}
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--accent-rose)', background: 'var(--accent-rose-light)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.85rem' }}>
              <AlertCircle size={15} /> {errorMsg}
            </div>
          )}

          {/* Cart Summary Strip */}
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
              <button type="button" className="btn-secondary" onClick={() => { executeAction({ intent: 'CHECKOUT' }); }} style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                Checkout <ChevronRight size={12} />
              </button>
            </div>
          )}

          {/* Command Tips */}
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.65rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Voice Commands</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {['Add [qty] [book]', 'Remove [book]', 'Wholesale / Retail', 'Discount [amount]', 'Clear cart', 'Checkout'].map(tip => (
                <span key={tip} style={{
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.5rem',
                  borderRadius: 'var(--radius-full)',
                  fontFamily: 'var(--font-mono)'
                }}>{tip}</span>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
