import React, { useEffect } from 'react';
import { BookOpen, X, Check, Package, AlertCircle } from 'lucide-react';

export default function BarcodeDisambiguationModal({
  isOpen,
  barcode = '',
  matchingProducts = [],
  onSelectProduct,
  onClose,
  currencySymbol = 'GH₵',
  priceMode = 'retail'
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= matchingProducts.length) {
          onSelectProduct(matchingProducts[num - 1]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, matchingProducts, onSelectProduct, onClose]);

  if (!isOpen || !matchingProducts || matchingProducts.length <= 1) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ maxWidth: '540px', width: '92vw', borderRadius: 'var(--radius-lg)' }}
      >
        <div className="modal-header" style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
              color: '#fff',
              padding: '0.45rem',
              borderRadius: 'var(--radius-md)',
              display: 'flex'
            }}>
              <BookOpen size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                Multiple Subjects for this Barcode
              </h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Shared ISBN: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)' }}>{barcode}</span>
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} title="Cancel">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{
            background: 'var(--primary-light)',
            border: '1px solid var(--primary)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.75rem',
            fontSize: '0.76rem',
            color: 'var(--text-main)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            <AlertCircle size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
            <span>
              This publisher shares one barcode across subjects. <strong>Tap the subject in your hand</strong> to add it to the sale:
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '340px', overflowY: 'auto' }}>
            {matchingProducts.map((prod, index) => {
              const price = priceMode === 'wholesale' 
                ? (parseFloat(prod.wholesale_price) || 0)
                : (parseFloat(prod.retail_price) || 0);
              const qty = parseInt(prod.stock_quantity, 10) || 0;
              const grade = prod.grade || prod.category_name || prod.class_name || 'General';

              return (
                <button
                  key={prod.id || index}
                  type="button"
                  onClick={() => onSelectProduct(prod)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 0.9rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--border-light)',
                    background: 'var(--bg-surface-elevated)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    gap: '0.65rem'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.background = 'var(--primary-light)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.background = 'var(--bg-surface-elevated)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--primary)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {index + 1}
                    </div>

                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {prod.product_name}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '3px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          padding: '0.08rem 0.4rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--accent-purple-light)',
                          color: 'var(--accent-purple)'
                        }}>
                          {grade}
                        </span>
                        {prod.publisher && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            🏢 {prod.publisher}
                          </span>
                        )}
                        <span style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          padding: '0.08rem 0.4rem',
                          borderRadius: 'var(--radius-sm)',
                          background: qty <= 5 ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)',
                          color: qty <= 5 ? 'var(--accent-rose)' : 'var(--accent-emerald)'
                        }}>
                          {qty} in stock
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--primary)' }}>
                      {currencySymbol}{price.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                      {priceMode} Price
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', textAlign: 'center', marginTop: '0.2rem' }}>
            Tip: Press <kbd style={{ padding: '0.1rem 0.35rem', background: 'var(--border-light)', borderRadius: '3px' }}>1</kbd>, <kbd style={{ padding: '0.1rem 0.35rem', background: 'var(--border-light)', borderRadius: '3px' }}>2</kbd>, <kbd style={{ padding: '0.1rem 0.35rem', background: 'var(--border-light)', borderRadius: '3px' }}>3</kbd> on your keyboard to pick quickly!
          </div>
        </div>
      </div>
    </div>
  );
}
