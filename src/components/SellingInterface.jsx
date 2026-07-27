import React, { useState } from 'react';
import { 
  Search, ShoppingCart, Plus, Minus, Trash2, Tag, 
  CreditCard, DollarSign, Smartphone, Check, Sparkles, 
  AlertTriangle, Clock, ArrowRight, Zap, RefreshCw, Percent
} from 'lucide-react';
import { processCheckout } from '../services/n8nService';

export default function SellingInterface({ 
  products, 
  categories, 
  cart, 
  setCart, 
  settings, 
  onCheckoutSuccess,
  onOpenScanner
}) {
  const [selectedCat, setSelectedCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceMode, setPriceMode] = useState('retail'); // 'retail' or 'wholesale'
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashGiven, setCashGiven] = useState('');
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [applyTax, setApplyTax] = useState(settings.tax_enabled_default || false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const taxRate = settings.tax_rate_pct || 15;

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesCat = selectedCat === 'all' || p.category_id === selectedCat;
    const matchesQuery = p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (p.barcode && p.barcode.includes(searchQuery));
    return matchesCat && matchesQuery;
  });

  // Calculate cart totals with optional VAT
  const subtotal = cart.reduce((sum, item) => {
    const price = priceMode === 'wholesale' ? item.wholesale_price : item.retail_price;
    return sum + (price * item.quantity);
  }, 0);

  const subtotalAfterDiscount = Math.max(0, subtotal - (parseFloat(orderDiscount) || 0));
  const taxAmount = applyTax ? (subtotalAfterDiscount * (taxRate / 100)) : 0;
  const total = subtotalAfterDiscount + taxAmount;

  const cashNum = parseFloat(cashGiven) || 0;
  const changeDue = Math.max(0, cashNum - total);

  // Add item to cart
  const addToCart = (product) => {
    const existingIdx = cart.findIndex(c => c.id === product.id);
    if (existingIdx >= 0) {
      const updated = [...cart];
      updated[existingIdx].quantity += 1;
      setCart(updated);
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  // Update item quantity
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

  // Remove single item
  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  // Web Audio Success Beep
  const playSuccessBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch (e) {}
  };

  // Handle Checkout submission
  const handleFinalCheckout = async () => {
    if (cart.length === 0) return;

    setIsSubmitting(true);

    const orderPayload = {
      order_id: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      timestamp: new Date().toISOString(),
      price_mode: priceMode,
      items: cart.map(item => ({
        id: item.id,
        product_name: item.product_name,
        barcode: item.barcode,
        price: priceMode === 'wholesale' ? item.wholesale_price : item.retail_price,
        quantity: item.quantity
      })),
      subtotal: subtotal,
      discount: parseFloat(orderDiscount) || 0,
      apply_tax: applyTax,
      tax_rate_pct: applyTax ? taxRate : 0,
      tax_amount: taxAmount,
      total: total,
      payment_method: paymentMethod,
      cash_given: paymentMethod === 'Cash' ? cashNum : total,
      change_due: paymentMethod === 'Cash' ? changeDue : 0,
      cashier_name: settings.cashier_name || 'Main Cashier'
    };

    try {
      await processCheckout(orderPayload);
      playSuccessBeep();

      setCart([]);
      setIsCartOpen(false);
      setCashGiven('');
      setOrderDiscount(0);

      onCheckoutSuccess(orderPayload);
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      
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
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
            <input 
              type="text" 
              className="form-control"
              placeholder="Search title, author or ISBN..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.1rem', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {/* Categories Bar Pills */}
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          paddingBottom: '0.2rem'
        }}>
          <button
            onClick={() => setSelectedCat('all')}
            className={`badge ${selectedCat === 'all' ? 'badge-primary' : ''}`}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              background: selectedCat === 'all' ? 'var(--primary)' : 'var(--bg-surface-elevated)',
              color: selectedCat === 'all' ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border-light)',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            All Genres ({products.length})
          </button>
          {categories.map(cat => (
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
                whiteSpace: 'nowrap'
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Book Catalog Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '0.75rem',
        alignContent: 'start',
        overflowY: 'auto',
        flex: 1
      }}>
        {filteredProducts.map(product => {
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
              {/* Product Thumbnail & Stock */}
              <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                <img 
                  src={product.product_image || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=200'} 
                  alt={product.product_name}
                  style={{
                    width: '100%',
                    height: '90px',
                    objectFit: 'cover',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--border-subtle)'
                  }}
                />

                <span className={`badge ${isLowStock ? 'badge-rose' : 'badge-emerald'}`} style={{
                  position: 'absolute',
                  bottom: '4px',
                  right: '4px',
                  fontSize: '0.65rem'
                }}>
                  {isOutOfStock ? 'Out of stock' : `${product.stock_quantity} left`}
                </span>
              </div>

              {/* Info */}
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2, marginBottom: '0.25rem' }}>
                  {product.product_name}
                </h4>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                  ISBN: {product.barcode}
                </div>
              </div>

              {/* Price & Add */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '0.5rem',
                paddingTop: '0.4rem',
                borderTop: '1px dashed var(--border-light)'
              }}>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)' }}>
                  ${price.toFixed(2)}
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
      </div>

      {/* Floating Bottom Cart Bar */}
      {cart.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '70px',
          left: '1rem',
          right: '1rem',
          background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
          color: '#fff',
          borderRadius: 'var(--radius-lg)',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 10px 25px var(--primary-glow)',
          zIndex: 80,
          cursor: 'pointer',
          animation: 'slideUp 0.2s ease-out'
        }} onClick={() => setIsCartOpen(true)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '0.4rem 0.6rem',
              borderRadius: 'var(--radius-md)',
              fontWeight: 800,
              fontSize: '0.9rem'
            }}>
              {cart.reduce((a, b) => a + b.quantity, 0)} Books
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {priceMode} Checkout {applyTax && `(+${taxRate}% VAT)`}
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>
                ${total.toFixed(2)}
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
              
              {/* Item List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '180px', overflowY: 'auto' }}>
                {cart.map(item => {
                  const itemPrice = priceMode === 'wholesale' ? item.wholesale_price : item.retail_price;
                  return (
                    <div key={item.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--bg-surface-elevated)',
                      padding: '0.6rem 0.8rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-light)'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.product_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ${itemPrice.toFixed(2)} each
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button className="btn-icon" style={{ width: '28px', height: '28px' }} onClick={() => updateQty(item.id, -1)}>
                          <Minus size={14} />
                        </button>
                        <span style={{ fontWeight: 800, minWidth: '20px', textAlign: 'center' }}>{item.quantity}</span>
                        <button className="btn-icon" style={{ width: '28px', height: '28px' }} onClick={() => updateQty(item.id, 1)}>
                          <Plus size={14} />
                        </button>
                        <button className="btn-danger" style={{ padding: '0.3rem' }} onClick={() => removeFromCart(item.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Order Adjustments: Discount & Optional Tax/VAT */}
              <div className="grid-2">
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Discount ($)</label>
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

              {/* Optional VAT Toggle Checkbox */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: applyTax ? 'var(--primary-light)' : 'var(--bg-surface-elevated)',
                border: `1px solid ${applyTax ? 'var(--primary)' : 'var(--border-light)'}`,
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Percent size={18} color={applyTax ? 'var(--primary)' : 'var(--text-muted)'} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: applyTax ? 'var(--primary)' : 'var(--text-main)' }}>
                      Apply Sales Tax / VAT ({taxRate}%)
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Optional per order switch
                    </div>
                  </div>
                </div>

                <label style={{ cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={applyTax}
                    onChange={e => setApplyTax(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                  />
                </label>
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
                      Cash Received ($)
                    </label>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: changeDue > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                      Change: ${changeDue.toFixed(2)}
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
                        ${val}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {orderDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--accent-rose)' }}>
                    <span>Discount</span>
                    <span>-${orderDiscount.toFixed(2)}</span>
                  </div>
                )}
                {applyTax && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--primary)' }}>
                    <span>VAT / Sales Tax ({taxRate}%)</span>
                    <span>+${taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  paddingTop: '0.4rem',
                  borderTop: '1px solid var(--border-light)',
                  color: 'var(--primary)'
                }}>
                  <span>TOTAL DUE</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

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
                Complete Sale & Print
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
