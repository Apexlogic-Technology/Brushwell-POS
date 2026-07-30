import React, { useState } from 'react';
import { X, PackagePlus, Search, Check, RefreshCw, Plus, Trash2, ArrowUpRight } from 'lucide-react';
import { receiveStock } from '../services/supabaseService';

export default function StockReceivingModal({ isOpen, onClose, products, onRefreshProducts }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [restockList, setRestockList] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const matchedProducts = products.filter(p => 
    p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.barcode && p.barcode.includes(searchQuery))
  );

  const addItemToRestock = (product) => {
    const existing = restockList.find(r => r.id === product.id);
    if (existing) return;

    setRestockList(prev => [...prev, {
      id: product.id,
      product_name: product.product_name,
      barcode: product.barcode,
      current_stock: product.stock_quantity,
      quantity_added: 10,
      new_retail_price: product.retail_price,
      new_wholesale_price: product.wholesale_price
    }]);
    setSearchQuery('');
  };

  const updateRestockRow = (id, field, value) => {
    setRestockList(prev => prev.map(r => {
      if (r.id === id) {
        return { ...r, [field]: value };
      }
      return r;
    }));
  };

  const removeRow = (id) => {
    setRestockList(prev => prev.filter(r => r.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (restockList.length === 0) return;

    setIsSubmitting(true);
    try {
      await receiveStock(restockList);
      await onRefreshProducts();
      setRestockList([]);
      onClose();
    } catch (err) {
      console.error('Restock error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PackagePlus size={20} color="var(--primary)" />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Stock Receiving (Bulk Restock)</h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Increase inventory levels for delivered books</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Book Search Bar */}
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input 
                type="text"
                className="form-control"
                placeholder="Search title or scan ISBN to restock..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '2.1rem' }}
              />

              {/* Autocomplete Dropdown */}
              {searchQuery.trim().length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  zIndex: 50
                }}>
                  {matchedProducts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => addItemToRestock(p)}
                      style={{
                        padding: '0.6rem 0.8rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-subtle)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.85rem'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{p.product_name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>ISBN: {p.barcode} • Current: {p.stock_quantity}</div>
                      </div>
                      <Plus size={16} color="var(--primary)" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Restock List Table */}
            {restockList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {restockList.map(item => (
                  <div key={item.id} style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{item.product_name}</div>
                      <button type="button" className="btn-danger" style={{ padding: '0.25rem' }} onClick={() => removeRow(item.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="grid-2">
                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>+ Qty Received</label>
                        <input 
                          type="number"
                          min="1"
                          className="form-control"
                          value={item.quantity_added}
                          onChange={e => updateRestockRow(item.id, 'quantity_added', e.target.value)}
                        />
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem' }}>New Stock Total</label>
                        <div style={{
                          padding: '0.75rem',
                          background: 'var(--accent-emerald-light)',
                          color: 'var(--accent-emerald)',
                          fontWeight: 800,
                          borderRadius: 'var(--radius-md)',
                          textAlign: 'center'
                        }}>
                          {item.current_stock + (parseInt(item.quantity_added, 10) || 0)} copies
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-subtle)', fontSize: '0.85rem' }}>
                Search and select books above to build your restock list.
              </div>
            )}

          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || restockList.length === 0}>
              {isSubmitting ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
              Confirm & Restock Stock
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
