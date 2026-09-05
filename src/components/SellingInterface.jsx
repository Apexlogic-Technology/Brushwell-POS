import React, { useState, useMemo } from 'react';
import { 
  Search, ShoppingCart, Plus, Minus, Trash2, Tag, 
  CreditCard, DollarSign, Smartphone, Check, Sparkles, 
  AlertTriangle, Clock, ArrowRight, Zap, RefreshCw, Percent, ChevronDown, Barcode as BarcodeIcon, Mic, BookOpen,
  Handshake, Store, Info, HelpCircle, Camera
} from 'lucide-react';
import { processCheckout, DEFAULT_TAX_TYPES } from '../services/supabaseService';
import VoiceSellingModal from './VoiceSellingModal';
import VisualSearchModal from './VisualSearchModal';
import FullscreenCameraScanner from './FullscreenCameraScanner';

export default function SellingInterface({ 
  products, 
  categories, 
  cart, 
  setCart, 
  settings, 
  onCheckoutSuccess,
  onOpenScanner,
  onOpenSettings,
  onQuickRegister
}) {
  const [sellViewMode, setSellViewMode] = useState(() => {
    return localStorage.getItem('brushwell_sell_mode') || 'camera';
  });

  const handleSwitchSellMode = (mode) => {
    setSellViewMode(mode);
    try {
      localStorage.setItem('brushwell_sell_mode', mode);
    } catch (e) {}
  };

  const [isVisualSearchOpen, setIsVisualSearchOpen] = useState(false);
  const [visualSearchMode, setVisualSearchMode] = useState('snap_cart');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
  const [borrowForm, setBorrowForm] = useState({
    product_name: '',
    grade: '',
    publisher: '',
    borrow_supplier: '',
    borrow_cost_price: '',
    retail_price: '',
    quantity: 1,
    is_custom: false,
    selected_product_id: ''
  });
  const [borrowCatalogSearch, setBorrowCatalogSearch] = useState('');
  const [borrowEditId, setBorrowEditId] = useState(null); // cart item id being inline-edited for borrow details
  const [borrowInlineForm, setBorrowInlineForm] = useState({ borrow_supplier: '', borrow_cost_price: '' });

  const [selectedCat, setSelectedCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceMode, setPriceMode] = useState('retail');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashGiven, setCashGiven] = useState('');
  const [splitPayments, setSplitPayments] = useState({
    Cash: '',
    Card: '',
    'Mobile Transfer': ''
  });
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

  // Helper to extract the Class / Grade from any product field
  const getProductGrade = (p) => {
    if (!p) return '';
    const raw = (p.grade || p.class_name || p.level || p.category_name || p.category || '').toString().trim();
    if (!raw || raw.toLowerCase() === 'general' || raw.toLowerCase() === 'uncategorized') return '';
    return raw;
  };

  // Helper to expand educational level synonyms (e.g., "Class 3" <-> "Book 3" <-> "Basic 3" <-> "BS 3")
  const getGradeSynonyms = (text) => {
    if (!text) return '';
    const lower = text.toLowerCase();
    const matches = lower.match(/(?:class|grade|basic|book|primary|stage|bs|p|b|jhs|shs|kg|nursery)\s*([0-9]+)/gi);
    if (!matches) return '';
    const syns = [];
    matches.forEach(m => {
      const numMatch = m.match(/[0-9]+/);
      if (numMatch) {
        const n = numMatch[0];
        syns.push(`class ${n}`, `book ${n}`, `basic ${n}`, `grade ${n}`, `primary ${n}`, `stage ${n}`, `bs ${n}`, `b${n}`, `p${n}`);
      }
    });
    return syns.join(' ');
  };

  // Filter products by category, title, publisher, author, grade/class, and barcode
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
      const gradeSynonyms = getGradeSynonyms(`${prodName} ${category}`);

      // Combined searchable text across title, author/publisher, class/grade, barcode, and educational aliases
      const fullSearchable = `${prodName} ${publisher} ${author} ${category} ${gradeSynonyms} ${barcode}`;

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

  const handleAddBorrowedBook = (e) => {
    e?.preventDefault();
    if (!borrowForm.is_custom && !borrowForm.selected_product_id) {
      alert('Please search and choose a book from the catalog, or click "Custom / Rare Book" above to type details.');
      return;
    }
    if (!borrowForm.product_name.trim()) {
      alert('Please enter or select a book title.');
      return;
    }
    if (!borrowForm.borrow_supplier.trim()) {
      alert('Please enter the lender / supplier store name.');
      return;
    }
    const rPrice = parseFloat(borrowForm.retail_price) || 0;
    const cPrice = parseFloat(borrowForm.borrow_cost_price) || 0;
    const qty = parseInt(borrowForm.quantity, 10) || 1;
    const supplier = borrowForm.borrow_supplier.trim();

    const newItem = {
      id: borrowForm.selected_product_id || ('borrow-' + Date.now()),
      product_name: borrowForm.product_name.trim(),
      grade: borrowForm.grade.trim(),
      category_name: borrowForm.grade.trim() || 'General',
      publisher: borrowForm.publisher.trim(),
      retail_price: rPrice,
      wholesale_price: rPrice,
      priceMode: 'retail',
      discount: 0,
      quantity: qty,
      is_borrowed: true,
      borrow_supplier: supplier,
      borrow_cost_price: cPrice,
      borrow_settlement_status: 'unpaid'
    };

    setCart(prev => [...prev, newItem]);
    setIsBorrowModalOpen(false);
  };

  const toggleCartItemBorrowed = (id) => {
    const item = cart.find(c => c.id === id);
    if (!item) return;
    if (item.is_borrowed) {
      // Unmark
      setCart(prev => prev.map(c => c.id === id ? { ...c, is_borrowed: false, borrow_supplier: null, borrow_cost_price: null, borrow_settlement_status: null } : c));
      setBorrowEditId(null);
    } else {
      // Open inline edit form so cashier can type supplier + cost
      setBorrowInlineForm({
        borrow_supplier: item.borrow_supplier || '',
        borrow_cost_price: item.borrow_cost_price != null ? String(item.borrow_cost_price) : String((item.wholesale_price || (item.retail_price * 0.8)).toFixed(2))
      });
      setBorrowEditId(id);
    }
  };

  const confirmBorrowInline = (id) => {
    const supplier = borrowInlineForm.borrow_supplier.trim();
    if (!supplier) { alert('Please enter a lender / supplier name.'); return; }
    const cost = parseFloat(borrowInlineForm.borrow_cost_price) || 0;
    setCart(prev => prev.map(c => c.id === id ? { ...c, is_borrowed: true, borrow_supplier: supplier, borrow_cost_price: cost, borrow_settlement_status: 'unpaid' } : c));
    setBorrowEditId(null);
  };

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

    // Calculate split payments if chosen
    let effectivePaymentMethod = paymentMethod;
    let splitList = null;
    let effectiveAmountTendered = paymentMethod === 'Cash' ? cashNum : total;
    let effectiveChangeDue = paymentMethod === 'Cash' ? changeDue : 0;

    if (paymentMethod === 'Split') {
      const sCash = parseFloat(splitPayments.Cash) || 0;
      const sCard = parseFloat(splitPayments.Card) || 0;
      const sMobile = parseFloat(splitPayments['Mobile Transfer']) || 0;
      const splitSum = sCash + sCard + sMobile;

      if (Math.abs(splitSum - total) > 0.05) {
        alert(`Split payment sum (${currencySymbol}${splitSum.toFixed(2)}) must equal order total (${currencySymbol}${total.toFixed(2)}).\nDifference: ${currencySymbol}${Math.abs(total - splitSum).toFixed(2)}`);
        setIsSubmitting(false);
        return;
      }

      splitList = [
        sCash > 0 && { method: 'Cash', amount: sCash },
        sCard > 0 && { method: 'Card', amount: sCard },
        sMobile > 0 && { method: 'Mobile Transfer', amount: sMobile }
      ].filter(Boolean);

      effectivePaymentMethod = splitList.map(s => s.method).join(' + ') || 'Split';
      effectiveAmountTendered = total;
      effectiveChangeDue = 0;
    }

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
        const grade = getProductGrade(item);
        const displayName = (grade && !item.product_name.toLowerCase().includes(grade.toLowerCase()))
          ? `${item.product_name} (${grade})`
          : item.product_name;

        const isBorrowed = Boolean(item.is_borrowed);
        const borrowCost = parseFloat(item.borrow_cost_price) || 0;
        const lineProfit = isBorrowed ? Math.max(0, (effectivePrice - borrowCost) * item.quantity) : 0;

        return {
          id: item.id,
          product_name: displayName,
          barcode: item.barcode || '',
          grade: grade,
          price_mode: mode,
          price: effectivePrice,
          original_price: basePrice,
          item_discount: itemDisc,
          quantity: item.quantity,
          is_borrowed: isBorrowed,
          borrow_supplier: isBorrowed ? (item.borrow_supplier || 'Neighbor Bookstore') : null,
          borrow_cost_price: isBorrowed ? borrowCost : null,
          borrow_settlement_status: isBorrowed ? (item.borrow_settlement_status || 'unpaid') : null,
          borrow_profit: lineProfit
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
      payment_method: effectivePaymentMethod,
      split_payments: splitList,
      cash_given: effectiveAmountTendered,
      amount_tendered: effectiveAmountTendered,
      change_due: effectiveChangeDue,
      change_given: effectiveChangeDue,
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
      setSplitPayments({ Cash: '', Card: '', 'Mobile Transfer': '' });
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      {sellViewMode === 'camera' ? (
        <FullscreenCameraScanner
          products={products}
          cart={cart}
          priceMode={priceMode}
          setPriceMode={setPriceMode}
          onAddToCart={addToCart}
          onOpenCart={() => setIsCartOpen(true)}
          onCheckout={() => setIsCartOpen(true)}
          onSwitchToCatalog={() => handleSwitchSellMode('catalog')}
          onQuickRegister={onQuickRegister}
          currencySymbol={currencySymbol}
          isPaused={isCartOpen || isBorrowModalOpen || isVisualSearchOpen || isVoiceModalOpen}
        />
      ) : (
        <>
          {/* Controls Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              
              {/* Switch to Camera Scanner Button */}
              <button
                type="button"
                onClick={() => handleSwitchSellMode('camera')}
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-sm)',
                  background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  boxShadow: '0 2px 6px var(--primary-glow)'
                }}
                title="Switch to Fullscreen Camera Scanner POS"
              >
                <Camera size={15} /> 📷 Fullscreen Scanner
              </button>

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

          {/* Spot Borrow Button */}
          <button
            type="button"
            onClick={() => {
              setBorrowForm({
                product_name: '',
                grade: '',
                publisher: '',
                borrow_supplier: '',
                borrow_cost_price: '',
                retail_price: '',
                quantity: 1,
                is_custom: false,
                selected_product_id: ''
              });
              setIsBorrowModalOpen(true);
            }}
            style={{
              padding: '0.4rem 0.75rem',
              fontSize: '0.78rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, hsl(38, 92%, 50%), hsl(28, 90%, 45%))',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: '0 2px 6px rgba(245, 158, 11, 0.25)'
            }}
            title="Borrow books from neighbor store or supplier to sell on the spot"
          >
            <Handshake size={15} /> Spot Borrow
          </button>

          {/* Search Bar */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-subtle)' }} />
            <input 
              type="text" 
              className="form-control"
              placeholder="Search title, author or ISBN..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.1rem', paddingRight: onOpenScanner ? '6.8rem' : '4.6rem', fontSize: '0.85rem' }}
            />
            {/* Visual Search / Snap to Cart button */}
            <button
              type="button"
              onClick={() => { setVisualSearchMode('snap_cart'); setIsVisualSearchOpen(true); }}
              title="AI Visual Search – Snap photo to add to cart or check prices"
              style={{
                position: 'absolute',
                right: onOpenScanner ? '72px' : '38px',
                background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '0.35rem 0.5rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'opacity 0.2s',
                boxShadow: '0 2px 6px var(--primary-glow)'
              }}
            >
              <Camera size={16} />
            </button>
            {/* Voice mic button */}
            <button
              type="button"
              onClick={() => setIsVoiceModalOpen(true)}
              title="Voice Selling – speak to add products"
              style={{
                position: 'absolute',
                right: onOpenScanner ? '38px' : '6px',
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

      {/* Book Catalog List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {displayedProducts.map(product => {
          const price = priceMode === 'wholesale' ? (product.wholesale_price || 0) : (product.retail_price || 0);
          const lowThreshold = parseInt(settings.low_stock_threshold, 10) || 5;
          const isOutOfStock = (product.stock_quantity || 0) <= 0;
          const isLowStock = !isOutOfStock && product.stock_quantity <= lowThreshold;
          const inCartItem = cart.find(c => c.id === product.id);

          return (
            <div
              key={product.id}
              onClick={() => !isOutOfStock && addToCart(product)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.55rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: inCartItem ? '2px solid var(--primary)' : '1px solid var(--border-light)',
                background: inCartItem ? 'var(--primary-light)' : 'var(--bg-surface-elevated)',
                cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                opacity: isOutOfStock ? 0.5 : 1,
                transition: 'background 0.12s ease, border-color 0.12s ease',
              }}
            >
              {/* Book icon */}
              <div style={{
                width: '36px', height: '36px', flexShrink: 0,
                borderRadius: 'var(--radius-sm)',
                background: inCartItem ? 'var(--primary)' : 'linear-gradient(135deg, var(--bg-surface), var(--border-subtle))',
                border: '1px solid var(--border-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {product.product_image ? (
                  <img src={product.product_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                ) : (
                  <BookOpen size={16} style={{ opacity: inCartItem ? 1 : 0.35, color: inCartItem ? '#fff' : 'var(--text-subtle)' }} />
                )}
              </div>

              {/* Title + Prominent Grade/Class Badge + Publisher */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  flexWrap: 'wrap'
                }}>
                  <span style={{
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: inCartItem ? 'var(--primary)' : 'var(--text-main)'
                  }}>
                    {product.product_name}
                  </span>

                  {/* Prominent High-Contrast Class/Grade Badge */}
                  {getProductGrade(product) && (
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '0.12rem 0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'linear-gradient(135deg, var(--accent-purple), hsl(265,83%,45%))',
                      color: '#ffffff',
                      letterSpacing: '0.02em',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                    }}>
                      {getProductGrade(product)}
                    </span>
                  )}
                </div>

                {product.publisher && (
                  <div style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    marginTop: '0.15rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {product.publisher}
                  </div>
                )}
              </div>

              {/* Stock badge */}
              {isOutOfStock ? (
                <span className="badge badge-rose" style={{ fontSize: '0.62rem', flexShrink: 0 }}>
                  Out
                </span>
              ) : isLowStock ? (
                <span className="badge badge-amber" style={{ fontSize: '0.62rem', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.2rem', background: 'var(--accent-amber-light)', color: 'hsl(35, 90%, 25%)', border: '1px solid var(--accent-amber)', fontWeight: 800 }}>
                  ⚠ Low ({product.stock_quantity})
                </span>
              ) : (
                <span className="badge badge-emerald" style={{ fontSize: '0.62rem', flexShrink: 0 }}>
                  {product.stock_quantity}
                </span>
              )}

              {/* Price */}
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--primary)', flexShrink: 0, minWidth: '58px', textAlign: 'right' }}>
                {currencySymbol}{price.toFixed(2)}
              </div>

              {/* Cart qty / Add button */}
              <div style={{ flexShrink: 0 }}>
                {inCartItem ? (
                  <span style={{
                    background: 'var(--primary)', color: '#fff',
                    borderRadius: 'var(--radius-full)',
                    width: '26px', height: '26px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 800
                  }}>
                    {inCartItem.quantity}
                  </span>
                ) : (
                  <button className="btn-primary" style={{ width: '28px', height: '28px', padding: 0, borderRadius: 'var(--radius-md)', flexShrink: 0 }}>
                    <Plus size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filteredProducts.length > visibleCount && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setVisibleCount(prev => prev + 80)}
            style={{ width: '100%', padding: '0.65rem', fontWeight: 700, fontSize: '0.85rem', marginTop: '0.25rem' }}
          >
            📥 Load More Books ({filteredProducts.length - visibleCount} remaining)
          </button>
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
        </>
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
                          <div style={{
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            flexWrap: 'wrap'
                          }}>
                            <span>{item.product_name}</span>
                            {getProductGrade(item) && (
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                padding: '0.08rem 0.35rem',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--accent-purple)',
                                color: '#fff'
                              }}>
                                {getProductGrade(item)}
                              </span>
                            )}
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

                          {/* Borrowed Status Tag / Toggle */}
                          {item.is_borrowed ? (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'var(--accent-amber-light)',
                              border: '1px solid var(--accent-amber)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.2rem 0.45rem',
                              marginTop: '0.25rem',
                              marginBottom: '0.15rem',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: 'hsl(35, 90%, 25%)'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Handshake size={13} color="var(--accent-amber)" />
                                <span>Lender: <strong>{item.borrow_supplier || 'Unknown'}</strong> (Cost: {currencySymbol}{(parseFloat(item.borrow_cost_price) || 0).toFixed(2)})</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleCartItemBorrowed(item.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--accent-rose)',
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  padding: 0,
                                  textDecoration: 'underline'
                                }}
                              >
                                Unmark
                              </button>
                            </div>
                          ) : borrowEditId === item.id ? (
                            <div style={{ marginTop: '0.25rem', marginBottom: '0.15rem', background: 'var(--bg-card)', border: '1px solid var(--accent-amber)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'hsl(35,90%,22%)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.1rem' }}>
                                <Handshake size={12} color="var(--accent-amber)" /> Mark as Borrowed
                              </div>
                              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-end' }}>
                                <div style={{ flex: 2 }}>
                                  <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Lender / Supplier</div>
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="e.g. Sedco Bookshop"
                                    value={borrowInlineForm.borrow_supplier}
                                    onChange={e => setBorrowInlineForm(f => ({ ...f, borrow_supplier: e.target.value }))}
                                    style={{ fontSize: '0.74rem', padding: '0.2rem 0.35rem' }}
                                    autoFocus
                                  />
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Cost ({currencySymbol})</div>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    className="form-control"
                                    placeholder="0.00"
                                    value={borrowInlineForm.borrow_cost_price}
                                    onChange={e => setBorrowInlineForm(f => ({ ...f, borrow_cost_price: e.target.value }))}
                                    style={{ fontSize: '0.74rem', padding: '0.2rem 0.35rem' }}
                                  />
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.1rem' }}>
                                <button type="button" onClick={() => confirmBorrowInline(item.id)} style={{ flex: 1, fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent-amber)', color: '#fff', cursor: 'pointer' }}>✔ Confirm</button>
                                <button type="button" onClick={() => setBorrowEditId(null)} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ marginTop: '0.15rem', marginBottom: '0.1rem' }}>
                              <button
                                type="button"
                                onClick={() => toggleCartItemBorrowed(item.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--accent-amber)',
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  padding: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.2rem'
                                }}
                              >
                                <Handshake size={11} /> Mark as Borrowed?
                              </button>
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
                    <option value="Split">🔀 Split / Multiple Methods</option>
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

              {/* Split Payments Calculator */}
              {paymentMethod === 'Split' && (() => {
                const sCash = parseFloat(splitPayments.Cash) || 0;
                const sCard = parseFloat(splitPayments.Card) || 0;
                const sMobile = parseFloat(splitPayments['Mobile Transfer']) || 0;
                const totalEntered = sCash + sCard + sMobile;
                const diff = total - totalEntered;
                const isMatched = Math.abs(diff) <= 0.01;

                return (
                  <div style={{
                    background: 'var(--bg-surface-elevated)',
                    border: `1px solid ${isMatched ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        🔀 Split Payment Breakdown
                      </label>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '0.1rem 0.4rem',
                        borderRadius: 'var(--radius-sm)',
                        background: isMatched ? 'var(--accent-emerald-light)' : 'var(--accent-amber-light)',
                        color: isMatched ? 'var(--accent-emerald)' : 'hsl(35, 90%, 25%)'
                      }}>
                        {isMatched ? '✔ Total Matched' : diff > 0 ? `Remaining: ${currencySymbol}${diff.toFixed(2)}` : `Over by: ${currencySymbol}${Math.abs(diff).toFixed(2)}`}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                      <div>
                        <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>💵 Cash</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="form-control"
                          placeholder="0.00"
                          value={splitPayments.Cash}
                          onChange={e => setSplitPayments(s => ({ ...s, Cash: e.target.value }))}
                          style={{ padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>💳 Card</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="form-control"
                          placeholder="0.00"
                          value={splitPayments.Card}
                          onChange={e => setSplitPayments(s => ({ ...s, Card: e.target.value }))}
                          style={{ padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>📱 Mobile</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="form-control"
                          placeholder="0.00"
                          value={splitPayments['Mobile Transfer']}
                          onChange={e => setSplitPayments(s => ({ ...s, 'Mobile Transfer': e.target.value }))}
                          style={{ padding: '0.3rem 0.4rem', fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>

                    {diff > 0.01 && (
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.7rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Quick fill remainder to:</span>
                        <button
                          type="button"
                          onClick={() => setSplitPayments(s => ({ ...s, Cash: ((parseFloat(s.Cash) || 0) + diff).toFixed(2) }))}
                          style={{ fontSize: '0.68rem', padding: '0.15rem 0.35rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer' }}
                        >+ Cash</button>
                        <button
                          type="button"
                          onClick={() => setSplitPayments(s => ({ ...s, 'Mobile Transfer': ((parseFloat(s['Mobile Transfer']) || 0) + diff).toFixed(2) }))}
                          style={{ fontSize: '0.68rem', padding: '0.15rem 0.35rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer' }}
                        >+ Mobile</button>
                      </div>
                    )}
                  </div>
                );
              })()}

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

      {/* Visual Search / Snap-to-Cart Modal */}
      <VisualSearchModal
        isOpen={isVisualSearchOpen}
        onClose={() => setIsVisualSearchOpen(false)}
        initialMode={visualSearchMode}
        products={products}
        categories={categories}
        onAddToCart={(product) => addToCart(product)}
        onOpenSettings={onOpenSettings}
      />

      {/* Spot Borrow Modal */}
      {isBorrowModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBorrowModalOpen(false)} style={{ zIndex: 10002 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{
                  background: 'linear-gradient(135deg, hsl(38,92%,50%), hsl(28,90%,45%))',
                  color: '#fff',
                  padding: '0.45rem',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex'
                }}>
                  <Handshake size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Spot Borrow / Sourced Book</h3>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sell books borrowed on credit from neighbor stores</div>
                </div>
              </div>
              <button type="button" className="btn-icon" onClick={() => setIsBorrowModalOpen(false)}>
                <Trash2 size={16} />
              </button>
            </div>

            <form onSubmit={handleAddBorrowedBook} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              
              {/* Type Switch: Catalog Book vs Custom */}
              <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-surface)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
                <button
                  type="button"
                  onClick={() => setBorrowForm(f => ({ ...f, is_custom: false }))}
                  style={{
                    flex: 1,
                    padding: '0.35rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: !borrowForm.is_custom ? 'var(--primary)' : 'transparent',
                    color: !borrowForm.is_custom ? '#fff' : 'var(--text-muted)'
                  }}
                >
                  From Catalog ({products.length} books)
                </button>
                <button
                  type="button"
                  onClick={() => setBorrowForm(f => ({ ...f, is_custom: true, selected_product_id: '' }))}
                  style={{
                    flex: 1,
                    padding: '0.35rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    cursor: 'pointer',
                    background: borrowForm.is_custom ? 'var(--primary)' : 'transparent',
                    color: borrowForm.is_custom ? '#fff' : 'var(--text-muted)'
                  }}
                >
                  Custom / Rare Book
                </button>
              </div>

              {!borrowForm.is_custom ? (
                <div>
                  <label className="form-label">Search Book from Catalog *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Type title, class, or publisher…"
                    value={borrowCatalogSearch}
                    onChange={e => setBorrowCatalogSearch(e.target.value)}
                    autoFocus
                  />
                  {borrowForm.selected_product_id && (
                    <div style={{ marginTop: '0.3rem', padding: '0.35rem 0.5rem', background: 'var(--accent-amber-light)', border: '1px solid var(--accent-amber)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 700, color: 'hsl(35,90%,22%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>✔ {borrowForm.product_name} {borrowForm.grade ? `[${borrowForm.grade}]` : ''}</span>
                      <button type="button" onClick={() => { setBorrowForm(f => ({ ...f, selected_product_id: '', product_name: '', grade: '', publisher: '', retail_price: '', borrow_cost_price: '' })); setBorrowCatalogSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--accent-rose)', fontWeight: 700 }}>✕ Clear</button>
                    </div>
                  )}
                  {borrowCatalogSearch.trim().length > 0 && !borrowForm.selected_product_id && (() => {
                    const q = borrowCatalogSearch.toLowerCase();
                    const matches = products.filter(p =>
                      (p.product_name || '').toLowerCase().includes(q) ||
                      (getProductGrade(p) || '').toLowerCase().includes(q) ||
                      (p.publisher || '').toLowerCase().includes(q)
                    ).slice(0, 12);
                    return (
                      <div style={{ marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)' }}>
                        {matches.length === 0 ? (
                          <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>No matching books found.</div>
                        ) : matches.map(p => {
                          const grade = getProductGrade(p);
                          return (
                            <div
                              key={p.id}
                              onClick={() => {
                                setBorrowForm(f => ({ ...f, selected_product_id: p.id, product_name: p.product_name, grade: grade, publisher: p.publisher || '', retail_price: p.retail_price || 0, borrow_cost_price: p.wholesale_price || (p.retail_price * 0.8) }));
                                setBorrowCatalogSearch('');
                              }}
                              style={{ padding: '0.4rem 0.7rem', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', fontSize: '0.76rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.product_name}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{grade ? `Class: ${grade}` : ''}{p.publisher ? ` · ${p.publisher}` : ''}</div>
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.5rem' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)' }}>GH₵{p.retail_price}</div>
                                <div style={{ fontSize: '0.65rem', color: p.stock_quantity > 0 ? 'var(--accent-green)' : 'var(--accent-rose)' }}>Stock: {p.stock_quantity}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <label className="form-label">Book Title *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Aki-Ola Core Mathematics"
                      value={borrowForm.product_name}
                      onChange={e => setBorrowForm(f => ({ ...f, product_name: e.target.value }))}
                      required
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <label className="form-label">Class / Grade</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. SHS 2, Class 4"
                        value={borrowForm.grade}
                        onChange={e => setBorrowForm(f => ({ ...f, grade: e.target.value }))}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="form-label">Publisher</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Aki-Ola, Sedco"
                        value={borrowForm.publisher}
                        onChange={e => setBorrowForm(f => ({ ...f, publisher: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Supplier / Lender Store */}
              <div>
                <label className="form-label">Borrowed From (Lender / Store Name) *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Sedco Bookshop, Shop 4B, Golden Books"
                  value={borrowForm.borrow_supplier}
                  onChange={e => setBorrowForm(f => ({ ...f, borrow_supplier: e.target.value }))}
                  required
                />
              </div>

              {/* Prices & Quantity */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label className="form-label">Borrow Cost (GH₵) *</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="form-control"
                    placeholder="Owed per copy"
                    value={borrowForm.borrow_cost_price}
                    onChange={e => setBorrowForm(f => ({ ...f, borrow_cost_price: e.target.value }))}
                    required
                  />
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>What you pay lender</div>
                </div>
                <div>
                  <label className="form-label">Selling Price (GH₵) *</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="form-control"
                    placeholder="Customer price"
                    value={borrowForm.retail_price}
                    onChange={e => setBorrowForm(f => ({ ...f, retail_price: e.target.value }))}
                    required
                  />
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>Customer price</div>
                </div>
                <div>
                  <label className="form-label">Qty *</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={borrowForm.quantity}
                    onChange={e => setBorrowForm(f => ({ ...f, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    required
                  />
                </div>
              </div>

              {/* Live Profit Preview */}
              {(() => {
                const sell = (parseFloat(borrowForm.retail_price) || 0) * (borrowForm.quantity || 1);
                const cost = (parseFloat(borrowForm.borrow_cost_price) || 0) * (borrowForm.quantity || 1);
                const profit = sell - cost;
                return (
                  <div style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--accent-amber)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.65rem 0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    fontSize: '0.78rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Customer Total:</span>
                      <strong style={{ color: 'var(--text-main)' }}>{currencySymbol}{sell.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-rose)' }}>
                      <span>Payout Owed to {borrowForm.borrow_supplier || 'Supplier'}:</span>
                      <strong>-{currencySymbol}{cost.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-light)', paddingTop: '0.25rem', color: 'var(--accent-emerald)', fontWeight: 800 }}>
                      <span>Your Net Profit:</span>
                      <span>+{currencySymbol}{profit.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsBorrowModalOpen(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{
                    flex: 2,
                    background: 'linear-gradient(135deg, hsl(38,92%,50%), hsl(28,90%,45%))',
                    borderColor: 'hsl(38,92%,45%)',
                    color: '#fff',
                    fontWeight: 800
                  }}
                >
                  <Handshake size={16} /> Add to Cart (Spot Borrow)
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

