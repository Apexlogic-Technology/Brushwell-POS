import React, { useState, useMemo } from 'react';
import { 
  Search, ShoppingCart, Plus, Minus, Trash2, Tag, 
  CreditCard, DollarSign, Smartphone, Check, Sparkles, 
  AlertTriangle, Clock, ArrowRight, Zap, RefreshCw, Percent, ChevronDown, Barcode as BarcodeIcon, Mic, BookOpen
} from 'lucide-react';
import { processCheckout, DEFAULT_TAX_TYPES } from '../services/supabaseService';
import VoiceSellingModal from './VoiceSellingModal';

export default function SellingInterface({ 
  products, 
  categories, 
  cart, 
  setCart, 
  settings, 
  onCheckoutSuccess,
  onOpenScanner
}) {
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceMode, setPriceMode] = useState('retail');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashGiven, setCashGiven] = useState('');
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [applyTax, setApplyTax] = useState(settings.tax_enabled_default || false);
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const currencySymbol = settings.currency_symbol || 'GH₵';
  const taxTypes = (settings.tax_types && settings.tax_types.length > 0)
    ? settings.tax_types
    : DEFAULT_TAX_TYPES;

  const activeTaxTypes = taxTypes.filter(t => t.enabled);
  const totalTaxRatePct = activeTaxTypes.reduce((sum, t) => sum + (parseFloat(t.rate_pct) || 0), 0);

  // Filter products by category, title, publisher, author, and barcode
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (!p) return false;
      const matchesCat = selectedCat === 'all' || p.category_id === selectedCat || p.category_name === selectedCat;
      if (!matchesCat) return false;
      if (!searchQuery) return true;

      const q = searchQuery.toLowerCase().trim();
      const qTokens = q.split(/\s+/).filter(Boolean);

      const prodName = (p.product_name || '').toLowerCase();
      const publisher = (p.publisher || '').toLowerCase();
      const author = (p.author || '').toLowerCase();
      const category = (p.category_name || '').toLowerCase();
      const barcode = String(p.barcode || '').toLowerCase();

      // Combined searchable text across title, author/publisher, category, barcode
      const fullSearchable = `${prodName} ${publisher} ${author} ${category} ${barcode}`;

      // Match if all search words appear in the book's metadata or direct barcode match
      const allTokensMatch = qTokens.every(token => fullSearchable.includes(token));
      const barcodeMatch = barcode.includes(q);

      return allTokensMatch || barcodeMatch;
    });
  }, [products, selectedCat, searchQuery]);

  // Reset pagination on search or category change
  React.useEffect(() => {
    setVisibleCount(40);
  }, [searchQuery, selectedCat]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  // Calculate cart totals & multi-tax breakdown
  // grossSubtotal = sum of (basePrice × qty) — before any discounts, using per-item priceMode
  const grossSubtotal = cart.reduce((sum, item) => {
    const mode = item.priceMode || priceMode;
    const basePrice = mode === 'wholesale' ? (item.wholesale_price || 0) : (item.retail_price || 0);
    return sum + (basePrice * item.quantity);
  }, 0);

  // itemDiscountsTotal = sum of all per-item discounts × qty
  const itemDiscountsTotal = cart.reduce((sum, item) => {
    const disc = Math.max(0, parseFloat(item.discount) || 0);
    return sum + (disc * item.quantity);
  }, 0);

  // subtotal = grossSubtotal minus per-item discounts
  const subtotal = Math.max(0, grossSubtotal - itemDiscountsTotal);

  // subtotalAfterDiscount = subtotal minus the extra order-level discount
  const subtotalAfterDiscount = Math.max(0, subtotal - (parseFloat(orderDiscount) || 0));

  const taxBreakdown = activeTaxTypes.map(t => {
    const rate = parseFloat(t.rate_pct) || 0;
    const amount = applyTax ? (subtotalAfterDiscount * (rate / 100)) : 0;
    return {
      id: t.id,
      name: t.name,
      rate_pct: rate,
      amount: amount
    };
  });

  const totalTaxAmount = taxBreakdown.reduce((sum, t) => sum + t.amount, 0);
  const total = subtotalAfterDiscount + totalTaxAmount;

  const cashNum = parseFloat(cashGiven) || 0;
  const changeDue = Math.max(0, cashNum - total);

  const addToCart = (product) => {
    const existingIdx = cart.findIndex(c => c.id === product.id);
    if (existingIdx >= 0) {
      const updated = [...cart];
      updated[existingIdx].quantity += 1;
      setCart(updated);
    } else {
      setCart([...cart, { ...product, quantity: 1, discount: 0, priceMode: priceMode }]);
    }
  };

  const updateItemPriceMode = (id, mode) => {
    setCart(cart.map(item => item.id === id ? { ...item, priceMode: mode } : item));
  };

  const updateQty = (id, delta) => {
    const updated = cart.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean);
    setCart(updated);
  };

  const updateItemDiscount = (id, discAmount) => {
    const updated = cart.map(item => {
      if (item.id === id) {
        return { ...item, discount: discAmount };
      }
      return item;
    });
    setCart(updated);
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const playSuccessBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {}
  };

  const handleFinalCheckout = async () => {
    if (cart.length === 0) return;

    setIsSubmitting(true);
    setCheckoutError('');

    const nowIso = new Date().toISOString();
    const orderPayload = {
      order_id: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      timestamp: nowIso,
      created_at: nowIso,
      price_mode: priceMode,
      items: cart.map(item => {
        const mode = item.priceMode || priceMode;
        const basePrice = mode === 'wholesale' ? (item.wholesale_price || 0) : (item.retail_price || 0);
        const itemDisc = Math.max(0, parseFloat(item.discount) || 0);
        const effectivePrice = Math.max(0, basePrice - itemDisc);
        return {
          id: item.id,
          product_name: item.product_name,
          barcode: item.barcode || '',
          price_mode: mode,
          price: effectivePrice,
          original_price: basePrice,
          item_discount: itemDisc,
          quantity: item.quantity
        };
      }),
      subtotal: subtotal,
      discount: parseFloat(orderDiscount) || 0,
      apply_tax: applyTax,
      tax_applied: applyTax,
      total_tax_rate_pct: applyTax ? totalTaxRatePct : 0,
      tax_breakdown: applyTax ? taxBreakdown : [],
      tax_amount: totalTaxAmount,
      tax_total: totalTaxAmount,
      total: total,
      payment_method: paymentMethod,
      cash_given: paymentMethod === 'Cash' ? cashNum : total,
      amount_tendered: paymentMethod === 'Cash' ? cashNum : total,
      change_due: paymentMethod === 'Cash' ? changeDue : 0,
      change_given: paymentMethod === 'Cash' ? changeDue : 0,
      cashier_name: settings.cashier_name || 'Main Cashier',
      customer_name: customerName.trim() || 'Walk-in Customer',
      customer_phone: customerPhone.trim() || ''
    };

    try {
      await processCheckout(orderPayload);
      playSuccessBeep();

      setCart([]);
      setIsCartOpen(false);
      setCashGiven('');
      setOrderDiscount(0);
      setCustomerName('');
      setCustomerPhone('');
      setCheckoutError('');

      onCheckoutSuccess(orderPayload);
    } catch (err) {
      console.error('Checkout error:', err);
      const msg = err?.message || 'Checkout failed. Check network / database permissions.';
      setCheckoutError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      
      {/* Controls Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          
          {/* Price Tier Switcher */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-surface-elevated)',
            padding: '3px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)'
          }}>
            <button
              onClick={() => setPriceMode('retail')}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-sm)',
                background: priceMode === 'retail' ? 'var(--primary)' : 'transparent',
                color: priceMode === 'retail' ? '#fff' : 'var(--text-muted)'
              }}
            >
              Retail
            </button>
            <button
              onClick={() => setPriceMode('wholesale')}
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-sm)',
                background: priceMode === 'wholesale' ? 'var(--accent-purple)' : 'transparent',
                color: priceMode === 'wholesale' ? '#fff' : 'var(--text-muted)'
              }}
            >
              Wholesale
            </button>
          </div>

          {/* Search Bar */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-subtle)' }} />
            <input 
              type="text" 
              className="form-control"
              placeholder="Search title, author or ISBN..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.1rem', paddingRight: onOpenScanner ? '5rem' : '2.4rem', fontSize: '0.85rem' }}
            />
            {/* Voice mic button */}
            <button
              type="button"
              onClick={() => setIsVoiceModalOpen(true)}
              title="Voice Selling – speak to add products"
              style={{
                position: 'absolute',
                right: onOpenScanner ? '40px' : '6px',
                background: 'var(--accent-purple)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '0.35rem 0.5rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
            >
              <Mic size={16} />
            </button>
            {onOpenScanner && (
              <button
                type="button"
                onClick={onOpenScanner}
                title="Scan ISBN Barcode with Camera"
                style={{
                  position: 'absolute',
                  right: '6px',
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s'
                }}
              >
                <BarcodeIcon size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Categories Bar Pills */}
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          paddingBottom: '0.2rem',
          scrollbarWidth: 'none'
        }}>
          <button
            onClick={() => setSelectedCat('all')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              background: selectedCat === 'all' ? 'var(--primary)' : 'var(--bg-surface-elevated)',
              color: selectedCat === 'all' ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border-light)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '0.78rem',
              fontWeight: 600,
              flexShrink: 0
            }}
          >
            All ({products.length})
          </button>
          {categories.map(cat => {
            const count = products.filter(p => p.category_id === cat.id || p.category_name === cat.name).length;
            if (count === 0) return null; // hide empty categories
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-full)',
                  background: selectedCat === cat.id ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                  color: selectedCat === cat.id ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Book Catalog Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '0.75rem',
        alignContent: 'start'
      }}>
        {displayedProducts.map(product => {
          const price = priceMode === 'wholesale' ? product.wholesale_price : product.retail_price;
          const isLowStock = product.stock_quantity <= 10;
          const isOutOfStock = product.stock_quantity <= 0;
          const inCartItem = cart.find(c => c.id === product.id);

          return (
            <div
              key={product.id}
              onClick={() => !isOutOfStock && addToCart(product)}
              className="card-glass"
              style={{
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                opacity: isOutOfStock ? 0.5 : 1,
                position: 'relative',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                border: inCartItem ? '2px solid var(--primary)' : '1px solid var(--border-light)'
              }}
            >
              <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                {product.product_image ? (
                  <img 
                    src={product.product_image} 
                    alt={product.product_name}
                    style={{
                      width: '100%',
                      height: '90px',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-elevated)'
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      if (e.currentTarget.nextSibling) {
                        e.currentTarget.nextSibling.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}

                {/* Blank Image Placeholder */}
                <div 
                  style={{
                    width: '100%',
                    height: '90px',
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, var(--bg-surface-elevated), var(--border-subtle))',
                    border: '1px solid var(--border-light)',
                    display: product.product_image ? 'none' : 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem',
                    color: 'var(--text-subtle)'
                  }}
                >
                  <BookOpen size={24} style={{ opacity: 0.35 }} />
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, opacity: 0.5, letterSpacing: '0.05em' }}>BOOK</span>
                </div>

                <span className={`badge ${isLowStock ? 'badge-rose' : 'badge-emerald'}`} style={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '4px',
                  fontSize: '0.65rem'
                }}>
                  {isOutOfStock ? 'Out of stock' : `${product.stock_quantity} left`}
                </span>
              </div>

              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2, marginBottom: '0.2rem' }}>
                  {product.product_name}
                </h4>
                {product.publisher && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600, marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {product.publisher}
                  </div>
                )}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                  ISBN: {product.barcode}
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '0.5rem',
                paddingTop: '0.4rem',
                borderTop: '1px dashed var(--border-light)'
              }}>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)' }}>
                  {currencySymbol}{price.toFixed(2)}
                </div>

                {inCartItem ? (
                  <span style={{
                    background: 'var(--primary)',
                    color: '#fff',
                    borderRadius: 'var(--radius-full)',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 800
                  }}>
                    {inCartItem.quantity}
                  </span>
                ) : (
                  <button className="btn-primary" style={{ width: '28px', height: '28px', padding: 0, borderRadius: 'var(--radius-md)' }}>
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filteredProducts.length > visibleCount && (
          <div style={{ gridColumn: '1 / -1', textAlignment: 'center', padding: '0.75rem 0' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setVisibleCount(prev => prev + 60)}
              style={{ width: '100%', padding: '0.65rem', fontWeight: 700, fontSize: '0.85rem' }}
            >
              📥 Load More Books ({filteredProducts.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          margin: '0 -0.75rem -0.75rem',
          background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
          color: '#fff',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 -4px 20px var(--primary-glow)',
          zIndex: 80,
          cursor: 'pointer'
        }} onClick={() => setIsCartOpen(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '0.4rem 0.6rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 800,
              fontSize: '0.9rem'
            }}>
              {cart.reduce((a, b) => a + b.quantity, 0)} Items
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {priceMode} Checkout {applyTax && `(+${totalTaxRatePct.toFixed(1)}% Tax)`}
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>
                {currencySymbol}{total.toFixed(2)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.9rem' }}>
            Checkout <ArrowRight size={18} />
          </div>
        </div>
      )}

      {/* Checkout Drawer Modal */}
      {isCartOpen && (
        <div className="modal-overlay" onClick={() => setIsCartOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingCart size={20} color="var(--primary)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Order Cart & Checkout</h3>
              </div>
              <button className="btn-icon" onClick={() => setIsCartOpen(false)}><Trash2 size={16} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Item List Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ShoppingCart size={15} color="var(--primary)" />
                  Selected Products ({cart.length} item{cart.length > 1 ? 's' : ''})
                </div>
                <button 
                  type="button" 
                  style={{ fontSize: '0.72rem', color: 'var(--accent-rose)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setCart([])}
                >
                  Clear Cart
                </button>
              </div>

              {/* Item List — No artificial maxHeight cap so all items render clearly */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {cart.map(item => {
                  const itemMode = item.priceMode || priceMode;
                  const basePrice = itemMode === 'wholesale' ? (item.wholesale_price || 0) : (item.retail_price || 0);
                  const itemDisc = Math.max(0, parseFloat(item.discount) || 0);
                  const effectiveUnitPrice = Math.max(0, basePrice - itemDisc);
                  const lineTotal = effectiveUnitPrice * item.quantity;
                  const hasWholesale = (item.wholesale_price || 0) > 0;

                  return (
                    <div key={item.id} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      background: 'var(--bg-surface-elevated)',
                      padding: '0.65rem 0.8rem',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${itemMode === 'wholesale' ? 'var(--accent-purple)' : 'var(--border-light)'}`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '0.5rem' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.product_name}
                          </div>
                          {/* Per-item Price Mode Toggle */}
                          {hasWholesale && (
                            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.2rem', marginBottom: '0.15rem' }}>
                              <button
                                type="button"
                                onClick={() => updateItemPriceMode(item.id, 'retail')}
                                style={{
                                  fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                                  borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                                  background: itemMode === 'retail' ? 'var(--primary)' : 'var(--bg-surface)',
                                  color: itemMode === 'retail' ? '#fff' : 'var(--text-muted)'
                                }}
                              >Retail</button>
                              <button
                                type="button"
                                onClick={() => updateItemPriceMode(item.id, 'wholesale')}
                                style={{
                                  fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem',
                                  borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                                  background: itemMode === 'wholesale' ? 'var(--accent-purple)' : 'var(--bg-surface)',
                                  color: itemMode === 'wholesale' ? '#fff' : 'var(--text-muted)'
                                }}
                              >Wholesale</button>
                            </div>
                          )}
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            {currencySymbol}{basePrice.toFixed(2)}
                            {itemDisc > 0 && <span style={{ color: 'var(--accent-rose)', fontWeight: 700 }}> (-{currencySymbol}{itemDisc.toFixed(2)})</span>}
                            {' '}× <strong>{item.quantity}</strong> = <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{currencySymbol}{lineTotal.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Qty Controls & Delete */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <button type="button" className="btn-icon" style={{ width: '28px', height: '28px' }} onClick={() => updateQty(item.id, -1)}>
                            <Minus size={13} />
                          </button>
                          <input 
                            type="number"
                            min="1"
                            className="form-control"
                            value={item.quantity}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val > 0) {
                                setCart(cart.map(c => c.id === item.id ? { ...c, quantity: val } : c));
                              }
                            }}
                            style={{
                              width: '48px',
                              padding: '0.2rem 0.1rem',
                              textAlign: 'center',
                              fontWeight: 800,
                              fontSize: '0.85rem'
                            }}
                          />
                          <button type="button" className="btn-icon" style={{ width: '28px', height: '28px' }} onClick={() => updateQty(item.id, 1)}>
                            <Plus size={13} />
                          </button>
                          <button type="button" className="btn-danger" style={{ width: '28px', height: '28px', padding: 0 }} onClick={() => removeFromCart(item.id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Custom Item Discount Input (Amount in GH₵) */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.2rem', borderTop: '1px dashed var(--border-light)', fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Tag size={12} color={itemDisc > 0 ? 'var(--accent-rose)' : 'var(--text-muted)'} /> Item Discount ({currencySymbol}):
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control"
                          placeholder="0.00"
                          value={item.discount || ''}
                          onChange={e => updateItemDiscount(item.id, e.target.value)}
                          style={{
                            width: '85px',
                            padding: '0.2rem 0.4rem',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: itemDisc > 0 ? 'var(--accent-rose)' : 'inherit',
                            borderColor: itemDisc > 0 ? 'var(--accent-rose)' : 'var(--border-light)'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Customer Information (Optional) */}
              <div className="grid-2">
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Customer Name (Optional)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Kwame Mensah"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Phone / WhatsApp # (Optional)</label>
                  <input 
                    type="tel" 
                    className="form-control" 
                    placeholder="e.g. 0241234567"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Order Adjustments: Discount & Payment Method */}
              <div className="grid-2">
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Discount ({currencySymbol})</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={orderDiscount} 
                    onChange={e => setOrderDiscount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Payment Method</label>
                  <select 
                    className="form-control" 
                    value={paymentMethod} 
                    onChange={e => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">💵 Cash</option>
                    <option value="Card">💳 Debit / Credit Card</option>
                    <option value="Mobile Transfer">📱 Mobile Transfer / POS</option>
                  </select>
                </div>
              </div>

              {/* Optional Multi-Tax Breakdown Toggle */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                background: applyTax ? 'var(--primary-light)' : 'var(--bg-surface-elevated)',
                border: `1px solid ${applyTax ? 'var(--primary)' : 'var(--border-light)'}`,
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Percent size={18} color={applyTax ? 'var(--primary)' : 'var(--text-muted)'} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: applyTax ? 'var(--primary)' : 'var(--text-main)' }}>
                        Apply Tax & Levies ({totalTaxRatePct.toFixed(1)}%)
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {activeTaxTypes.map(t => `${t.name} (${t.rate_pct}%)`).join(', ') || 'No active taxes'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {applyTax && (
                      <button
                        type="button"
                        onClick={() => setShowTaxBreakdown(!showTaxBreakdown)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center' }}
                      >
                        <ChevronDown size={18} style={{ transform: showTaxBreakdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                      </button>
                    )}
                    <input 
                      type="checkbox"
                      checked={applyTax}
                      onChange={e => setApplyTax(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                {/* Expanded Itemized Tax Breakdown */}
                {applyTax && showTaxBreakdown && (
                  <div style={{
                    marginTop: '0.4rem',
                    paddingTop: '0.4rem',
                    borderTop: '1px dashed var(--primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.3rem',
                    fontSize: '0.78rem'
                  }}>
                    {taxBreakdown.map(t => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--primary)' }}>
                        <span>{t.name} ({t.rate_pct}%)</span>
                        <span style={{ fontWeight: 700 }}>+{currencySymbol}{t.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cash Calculator */}
              {paymentMethod === 'Cash' && (
                <div style={{
                  background: 'var(--primary-light)',
                  border: '1px solid var(--primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                      Cash Received ({currencySymbol})
                    </label>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: changeDue > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                      Change: {currencySymbol}{changeDue.toFixed(2)}
                    </div>
                  </div>

                  <input 
                    type="number"
                    className="form-control"
                    placeholder="Enter cash given by customer..."
                    value={cashGiven}
                    onChange={e => setCashGiven(e.target.value)}
                    style={{ fontSize: '1.1rem', fontWeight: 700 }}
                  />

                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {[10, 20, 50, 100].map(val => (
                      <button
                        key={val}
                        className="btn-secondary"
                        onClick={() => setCashGiven(val.toString())}
                        style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem' }}
                      >
                        {currencySymbol}{val}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Order Totals Box */}
              <div style={{
                background: 'var(--bg-surface-elevated)',
                padding: '0.85rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                border: '1px solid var(--border-light)'
              }}>
                {/* Gross subtotal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>Gross Subtotal</span>
                  <span>{currencySymbol}{grossSubtotal.toFixed(2)}</span>
                </div>

                {/* Per-item discounts applied */}
                {itemDiscountsTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--accent-rose)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Tag size={13} /> Item Discounts
                    </span>
                    <span style={{ fontWeight: 700 }}>-{currencySymbol}{itemDiscountsTotal.toFixed(2)}</span>
                  </div>
                )}

                {/* Subtotal after item discounts */}
                {itemDiscountsTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', paddingTop: '0.2rem', borderTop: '1px dashed var(--border-light)' }}>
                    <span>Subtotal</span>
                    <span>{currencySymbol}{subtotal.toFixed(2)}</span>
                  </div>
                )}

                {/* Extra order-level discount */}
                {orderDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--accent-rose)' }}>
                    <span>Extra Discount</span>
                    <span style={{ fontWeight: 700 }}>-{currencySymbol}{parseFloat(orderDiscount).toFixed(2)}</span>
                  </div>
                )}

                {/* Tax lines */}
                {applyTax && taxBreakdown.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--primary)' }}>
                    <span>{t.name} ({t.rate_pct}%)</span>
                    <span>+{currencySymbol}{t.amount.toFixed(2)}</span>
                  </div>
                ))}

                {/* Grand Total */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  paddingTop: '0.4rem',
                  borderTop: '2px solid var(--primary)',
                  color: 'var(--primary)',
                  marginTop: '0.1rem'
                }}>
                  <span>TOTAL DUE</span>
                  <span>{currencySymbol}{total.toFixed(2)}</span>
                </div>
              </div>

              {checkoutError && (
                <div style={{
                  padding: '0.6rem 0.8rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-rose-light)',
                  border: '1px solid var(--accent-rose)',
                  color: 'var(--accent-rose)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>{checkoutError}</span>
                </div>
              )}

            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsCartOpen(false)}>Cancel</button>
              <button 
                className="btn-accent" 
                onClick={handleFinalCheckout}
                disabled={isSubmitting || cart.length === 0}
                style={{ flex: 1 }}
              >
                {isSubmitting ? <RefreshCw className="animate-spin" size={18} /> : <Check size={18} />}
                Complete Sale & Save Receipt
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Voice Selling Modal */}
      <VoiceSellingModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        products={products}
        cart={cart}
        onAddToCart={(product, qty) => {
          setCart(prev => {
            const existing = prev.find(c => c.id === product.id);
            if (existing) {
              return prev.map(c => c.id === product.id ? { ...c, quantity: c.quantity + qty } : c);
            }
            return [...prev, { ...product, quantity: qty }];
          });
        }}
        onRemoveFromCart={(productId) => {
          setCart(prev => prev.filter(c => c.id !== productId));
        }}
        onSetPriceMode={(mode) => setPriceMode(mode)}
        onApplyDiscount={(amount) => setOrderDiscount(Number(amount) || 0)}
        onToggleTax={(val) => setApplyTax(val)}
        onClearCart={() => setCart([])}
        onCheckout={() => { setIsCartOpen(true); setIsVoiceModalOpen(false); }}
      />

    </div>
  );
}

