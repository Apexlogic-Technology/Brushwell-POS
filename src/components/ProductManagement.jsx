import React, { useState } from 'react';
import { 
  Package, Plus, Search, Edit3, Trash2, Barcode as BarcodeIcon, 
  Upload, Calendar, Tag, AlertCircle, Clock, RefreshCw, Check 
} from 'lucide-react';
import { saveProductToDB, deleteProductFromDB } from '../services/n8nService';

export default function ProductManagement({ 
  products, 
  categories, 
  onRefreshProducts, 
  onOpenBarcodeGen,
  isAdmin = false,
  onOpenStockReceive
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'low_stock', 'expiring'
  const [selectedCat, setSelectedCat] = useState('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    product_name: '',
    category_id: categories[0]?.id || '',
    barcode: '',
    retail_price: '',
    wholesale_price: '',
    stock_quantity: '',
    expiry_date: '',
    product_image: ''
  });

  const todayStr = new Date().toISOString().split('T')[0];

  // Filtering products
  const filteredProducts = products.filter(p => {
    const matchesQuery = p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (p.barcode && p.barcode.includes(searchQuery));
    const matchesCat = selectedCat === 'all' || p.category_id === selectedCat;

    if (!matchesQuery || !matchesCat) return false;

    if (filterType === 'low_stock') {
      return p.stock_quantity <= 10;
    }
    if (filterType === 'expiring') {
      if (!p.expiry_date) return false;
      const days = (new Date(p.expiry_date) - new Date()) / (1000 * 60 * 60 * 24);
      return days <= 30;
    }

    return true;
  });

  // Open modal for New or Edit
  const openFormModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        id: product.id,
        product_name: product.product_name || '',
        category_id: product.category_id || (categories[0]?.id || ''),
        barcode: product.barcode || '',
        retail_price: product.retail_price || '',
        wholesale_price: product.wholesale_price || '',
        stock_quantity: product.stock_quantity || '',
        expiry_date: product.expiry_date || '',
        product_image: product.product_image || ''
      });
    } else {
      setEditingProduct(null);
      setFormData({
        id: '',
        product_name: '',
        category_id: categories[0]?.id || '',
        barcode: Math.floor(100000000000 + Math.random() * 900000000000).toString(),
        retail_price: '',
        wholesale_price: '',
        stock_quantity: '20',
        expiry_date: '',
        product_image: ''
      });
    }
    setIsModalOpen(true);
  };

  // Image File Uploader to Base64 Data URI
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, product_image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Generate random 12-digit barcode
  const generateRandomBarcode = () => {
    const randomCode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    setFormData(prev => ({ ...prev, barcode: randomCode }));
  };

  // Save product submit
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.product_name || !formData.retail_price) return;

    setIsSubmitting(true);
    const payload = {
      ...formData,
      retail_price: parseFloat(formData.retail_price) || 0,
      wholesale_price: parseFloat(formData.wholesale_price) || parseFloat(formData.retail_price) * 0.8,
      stock_quantity: parseInt(formData.stock_quantity, 10) || 0
    };

    try {
      await saveProductToDB(payload);
      await onRefreshProducts();
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete product
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      await deleteProductFromDB(id);
      await onRefreshProducts();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      
      {/* Top Header & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Book Catalogue Manager</h2>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            PostgreSQL synced inventory
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {onOpenStockReceive && (
            <button className="btn-secondary" onClick={onOpenStockReceive} style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}>
              Restock
            </button>
          )}
          <button className="btn-primary" onClick={() => openFormModal(null)} style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem' }}>
            <Plus size={18} />
            Add Book
          </button>
        </div>
      </div>

      {/* Filter Tabs — Admin only */}
      {isAdmin && (
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button
          className={`badge ${filterType === 'all' ? 'badge-primary' : ''}`}
          onClick={() => setFilterType('all')}
          style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
        >
          All Items ({products.length})
        </button>

        <button
          className={`badge ${filterType === 'low_stock' ? 'badge-rose' : ''}`}
          onClick={() => setFilterType('low_stock')}
          style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
        >
          Low Stock ({products.filter(p => p.stock_quantity <= 10).length})
        </button>

        <button
          className={`badge ${filterType === 'expiring' ? 'badge-amber' : ''}`}
          onClick={() => setFilterType('expiring')}
          style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}
        >
          Expiring Soon ({products.filter(p => p.expiry_date && p.expiry_date <= todayStr).length} titles)
        </button>
      </div>
      )}

      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
        <input 
          type="text"
          className="form-control"
          placeholder="Search by title, author or ISBN..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ paddingLeft: '2.1rem' }}
        />
      </div>

      {/* Product Table / Cards */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredProducts.map(product => {
          const isLowStock = product.stock_quantity <= 10;
          const isExpired = product.expiry_date && product.expiry_date <= todayStr;

          return (
            <div 
              key={product.id}
              className="card-glass"
              style={{
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem'
              }}
            >
              {/* Image Thumbnail */}
              <img 
                src={product.product_image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200'}
                alt={product.product_name}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-md)',
                  objectFit: 'cover'
                }}
              />

              {/* Main Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{product.product_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span>Genre: {product.category_name || 'General'}</span>
                  <span>• ISBN: <strong style={{ fontFamily: 'var(--font-mono)' }}>{product.barcode}</strong></span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '2px' }}>
                  Retail: <strong>${product.retail_price.toFixed(2)}</strong> | Wholesale: <strong>${product.wholesale_price?.toFixed(2) || 'N/A'}</strong>
                </div>
              </div>

              {/* Badges & Actions — full for admin, view-only for attendant */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <span className={`badge ${isLowStock ? 'badge-rose' : 'badge-emerald'}`}>
                    {product.stock_quantity} in stock
                  </span>
                  {isExpired && <span className="badge badge-rose">Expired</span>}
                </div>

                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  {isAdmin && (
                    <button className="btn-icon" style={{ width: '32px', height: '32px' }} onClick={() => onOpenBarcodeGen(product)} title="Generate Barcode">
                      <BarcodeIcon size={16} />
                    </button>
                  )}

                  {isAdmin && (
                    <button className="btn-icon" style={{ width: '32px', height: '32px' }} onClick={() => openFormModal(product)} title="Edit Book">
                      <Edit3 size={16} />
                    </button>
                  )}

                  {isAdmin && (
                    <button className="btn-danger" style={{ padding: '0.3rem' }} onClick={() => handleDelete(product.id)} title="Delete Book">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Product Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {editingProduct ? 'Edit Book' : 'Add New Book'}
              </h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}><Trash2 size={16} /></button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                
                {/* Product Name */}
                <div className="form-group">
                  <label>Book Title & Author *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    placeholder="e.g. The Midnight Library – Matt Haig"
                    value={formData.product_name}
                    onChange={e => setFormData({ ...formData, product_name: e.target.value })}
                  />
                </div>

                {/* Category & Barcode */}
                <div className="grid-2">
                  <div className="form-group">
                    <label>Genre / Category</label>
                    <select 
                      className="form-control"
                      value={formData.category_id}
                      onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label>ISBN / Barcode *</label>
                      <button type="button" style={{ fontSize: '0.7rem', color: 'var(--primary)' }} onClick={generateRandomBarcode}>
                        Auto-Gen
                      </button>
                    </div>
                    <input 
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. 9780747532743"
                      value={formData.barcode}
                      onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                    />
                  </div>
                </div>

                {/* Prices & Stock */}
                <div className="grid-2">
                  <div className="form-group">
                    <label>Retail Price ($) *</label>
                    <input 
                      type="number"
                      step="0.01"
                      className="form-control"
                      required
                      placeholder="3.50"
                      value={formData.retail_price}
                      onChange={e => setFormData({ ...formData, retail_price: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Wholesale Price ($)</label>
                    <input 
                      type="number"
                      step="0.01"
                      className="form-control"
                      placeholder="2.80"
                      value={formData.wholesale_price}
                      onChange={e => setFormData({ ...formData, wholesale_price: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label>Stock Quantity *</label>
                    <input 
                      type="number"
                      className="form-control"
                      required
                      placeholder="50"
                      value={formData.stock_quantity}
                      onChange={e => setFormData({ ...formData, stock_quantity: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Expiry Date (Optional)</label>
                    <input 
                      type="date"
                      className="form-control"
                      value={formData.expiry_date}
                      onChange={e => setFormData({ ...formData, expiry_date: e.target.value })}
                    />
                  </div>
                </div>

                {/* Product Image URL or File Upload */}
                <div className="form-group">
                  <label>Product Image</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {formData.product_image && (
                      <img 
                        src={formData.product_image} 
                        alt="Preview" 
                        style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
                      />
                    )}
                    <label className="btn-secondary" style={{ flex: 1, cursor: 'pointer', textAlign: 'center', margin: 0 }}>
                      <Upload size={16} /> Upload Image File
                      <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                    </label>
                  </div>
                  <input 
                    type="text"
                    className="form-control"
                    placeholder="Or enter image URL..."
                    value={formData.product_image}
                    onChange={e => setFormData({ ...formData, product_image: e.target.value })}
                    style={{ marginTop: '0.4rem', fontSize: '0.8rem' }}
                  />
                </div>

              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
                  Save Product to DB
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
