import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Package, Plus, Search, Edit3, Trash2, Barcode as BarcodeIcon, 
  Upload, Calendar, Tag, AlertCircle, Clock, RefreshCw, Check, Camera, Filter, 
  FolderPlus, X, FileSpreadsheet, Loader, Download, LayoutGrid, List, Sliders, Zap
} from 'lucide-react';
import { 
  saveProduct as saveProductToDB, 
  deleteProduct as deleteProductFromDB, 
  bulkImportProducts,
  bulkUpdateProducts,
  bulkDeleteProducts,
  deleteAllProducts
} from '../services/supabaseService';
import BarcodeScannerModal from './BarcodeScannerModal';
import VisualSearchModal from './VisualSearchModal';

const DEFAULT_CATEGORIES = [
  { id: 'cat-gh-1',  name: 'Crèche & Nursery (KG 1 - 2)' },
  { id: 'cat-gh-2',  name: 'Primary School (Class 1 - 6)' },
  { id: 'cat-gh-3',  name: 'Junior High School (JHS 1 - 3 / BECE)' },
  { id: 'cat-gh-4',  name: 'SHS Core Subjects (English, Maths, Science, Social)' },
  { id: 'cat-gh-5',  name: 'SHS Science & Elective Mathematics' },
  { id: 'cat-gh-6',  name: 'SHS General Arts & Literature' },
  { id: 'cat-gh-7',  name: 'SHS Business, Accounting & Economics' },
  { id: 'cat-gh-8',  name: 'SHS Visual Arts, Home Econ & Technical' },
  { id: 'cat-gh-9',  name: 'BECE & WASSCE Past Questions (Pasco)' },
  { id: 'cat-gh-10', name: 'Children Storybooks & Ghanaian Languages' },
  { id: 'cat-gh-11', name: 'Stationery & School Supplies' }
];

export default function ProductManagement({ 
  products = [], 
  categories = [], 
  onRefreshProducts, 
  onOpenBarcodeGen,
  isAdmin = false,
  onOpenStockReceive,
  onOpenSettings,
  initialBarcode = null,
  onClearInitialBarcode
}) {
  const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];
  const safeCategories = Array.isArray(categories) ? categories.filter(Boolean) : [];

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'low_stock', 'expiring'
  const [selectedCat, setSelectedCat] = useState('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isVisualRegisterOpen, setIsVisualRegisterOpen] = useState(false);
  const [scanMode, setScanMode] = useState('new'); // 'new' | 'form'
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  // Bulk Import state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importStatus, setImportStatus] = useState('idle'); // 'idle' | 'preview' | 'importing' | 'done'
  const [importError, setImportError] = useState('');
  const importFileRef = useRef(null);

  // Selection state for multi-select bulk edit
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Pagination & View Mode state
  const [visibleCount, setVisibleCount] = useState(40);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Bulk Edit state
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState('price');
  const [bulkRetailPrice, setBulkRetailPrice] = useState('');
  const [bulkWholesalePrice, setBulkWholesalePrice] = useState('');
  const [bulkWholesalePct, setBulkWholesalePct] = useState('80');
  const [bulkStockQty, setBulkStockQty] = useState('10000');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPublisher, setBulkPublisher] = useState('');
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState('');
  const [bulkErrorMsg, setBulkErrorMsg] = useState('');

  // Categories list
  const allCategories = useMemo(() => {
    const map = new Map();
    DEFAULT_CATEGORIES.forEach(c => {
      if (c && c.name) map.set(c.name.toLowerCase(), c);
    });
    safeCategories.forEach(c => {
      if (c && c.name) map.set(c.name.toLowerCase(), c);
    });
    safeProducts.forEach(p => {
      if (p && p.category_name && !map.has(p.category_name.toLowerCase())) {
        const id = p.category_id || 'cat-' + p.category_name.toLowerCase().replace(/\s+/g, '-');
        map.set(p.category_name.toLowerCase(), { id, name: p.category_name });
      }
    });
    const result = Array.from(map.values());
    return result.length > 0 ? result : DEFAULT_CATEGORIES;
  }, [safeCategories, safeProducts]);

  const todayStr = new Date().toISOString().split('T')[0];
  const lowStockCount = safeProducts.filter(p => p && (p.stock_quantity || 0) <= 10).length;
  const expiringCount = safeProducts.filter(p => p && p.expiry_date && p.expiry_date <= todayStr).length;

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    product_name: '',
    publisher: '',
    category_id: '',
    category_name: '',
    barcode: '',
    retail_price: '',
    wholesale_price: '',
    stock_quantity: '20',
    expiry_date: '',
    product_image: ''
  });

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return safeProducts.filter(p => {
      if (!p) return false;
      const matchesQuery = !searchQuery || 
                           (p.product_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (p.barcode && String(p.barcode).includes(searchQuery)) ||
                           (p.publisher && String(p.publisher).toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCat = selectedCat === 'all' || p.category_id === selectedCat || p.category_name === selectedCat;

      if (!matchesQuery || !matchesCat) return false;

      if (filterType === 'low_stock') {
        return (p.stock_quantity || 0) <= 10;
      }
      if (filterType === 'expiring') {
        if (!p.expiry_date) return false;
        const days = (new Date(p.expiry_date) - new Date()) / (1000 * 60 * 60 * 24);
        return days <= 30;
      }

      return true;
    });
  }, [safeProducts, searchQuery, selectedCat, filterType]);

  React.useEffect(() => {
    setVisibleCount(40);
  }, [searchQuery, selectedCat, filterType]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const openFormModal = (product = null, initialBarcode = '', initialFields = null) => {
    setIsCustomCategory(false);
    setCustomCategoryInput('');
    const defaultCat = (allCategories && allCategories.length > 0) ? allCategories[0] : DEFAULT_CATEGORIES[0];

    if (product) {
      setEditingProduct(product);
      setFormData({
        id: product.id || '',
        product_name: initialFields?.product_name || product.product_name || '',
        publisher: initialFields?.publisher || product.publisher || '',
        category_id: initialFields?.category_id || product.category_id || defaultCat.id,
        category_name: initialFields?.category_name || product.category_name || defaultCat.name,
        barcode: initialBarcode || initialFields?.barcode || product.barcode || '',
        retail_price: product.retail_price || '',
        wholesale_price: product.wholesale_price || '',
        stock_quantity: product.stock_quantity !== undefined && product.stock_quantity !== null ? String(product.stock_quantity) : '0',
        expiry_date: product.expiry_date || '',
        product_image: initialFields?.product_image || product.product_image || ''
      });
    } else {
      setEditingProduct(null);
      setFormData({
        id: '',
        product_name: initialFields?.product_name || '',
        publisher: initialFields?.publisher || '',
        category_id: initialFields?.category_id || defaultCat.id,
        category_name: initialFields?.category_name || defaultCat.name,
        barcode: initialBarcode || initialFields?.barcode || Math.floor(100000000000 + Math.random() * 900000000000).toString(),
        retail_price: initialFields?.retail_price || '',
        wholesale_price: initialFields?.wholesale_price || '',
        stock_quantity: initialFields?.stock_quantity != null ? String(initialFields.stock_quantity) : '10000',
        expiry_date: '',
        product_image: initialFields?.product_image || ''
      });
    }
    setIsModalOpen(true);
  };

  const handleVisualRegisterSuccess = (existingProduct, barcode, initialData) => {
    setIsVisualRegisterOpen(false);
    openFormModal(existingProduct, barcode, initialData);
  };

  useEffect(() => {
    if (initialBarcode) {
      openFormModal(null, initialBarcode);
      if (onClearInitialBarcode) onClearInitialBarcode();
    }
  }, [initialBarcode]);

  const handleScanToAddSuccess = (code, matchedProduct) => {
    setIsScanModalOpen(false);
    if (scanMode === 'form') {
      setFormData(prev => ({ ...prev, barcode: code }));
    } else {
      if (matchedProduct) {
        openFormModal(matchedProduct);
      } else {
        openFormModal(null, code);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.product_name.trim()) {
      alert('Please enter a product title.');
      return;
    }
    setIsSubmitting(true);
    try {
      let finalCatId = formData.category_id;
      let finalCatName = formData.category_name;

      if (isCustomCategory && customCategoryInput.trim()) {
        finalCatName = customCategoryInput.trim();
        finalCatId = 'cat-' + finalCatName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      }

      const payload = {
        ...formData,
        category_id: finalCatId,
        category_name: finalCatName,
        retail_price: parseFloat(formData.retail_price) || 0,
        wholesale_price: parseFloat(formData.wholesale_price) || (parseFloat(formData.retail_price) * 0.8) || 0,
        stock_quantity: parseInt(formData.stock_quantity, 10) || 0
      };

      await saveProductToDB(payload);
      setIsModalOpen(false);
      if (onRefreshProducts) await onRefreshProducts();
    } catch (err) {
      alert('Error saving product: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteProductFromDB(id);
        if (onRefreshProducts) await onRefreshProducts();
      } catch (err) {
        alert('Error deleting product: ' + err.message);
      }
    }
  };

  const handleImportFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportError('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawJson = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rawJson.length) {
          setImportError('Uploaded file contains no data rows.');
          return;
        }

        const rows = rawJson
          .filter(r => (r['Books'] || r['Product Name'] || r['Title'] || '').toString().trim() !== '')
          .map(r => ({
            product_name:    (r['Books'] || r['Product Name'] || r['Title'] || '').toString().trim(),
            grade:           (r['Grade'] || r['Class'] || r['Level'] || '').toString().trim(),
            category_name:   (r['Grade'] || r['Class'] || r['Category'] || 'General').toString().trim(),
            category_id:     'cat-' + (r['Grade'] || r['Class'] || r['Category'] || 'General').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            publisher:       (r['Publisher'] || r['Author'] || '').toString().trim(),
            retail_price:    parseFloat(r['Retail'] || r['Price'] || 0) || 0,
            wholesale_price: parseFloat(r['Wholesale'] || 0) || (parseFloat(r['Retail'] || 0) * 0.8) || 0,
            barcode:         (r['BARCODE'] || r['Barcode'] || r['ISBN'] || Math.floor(100000000000 + Math.random() * 900000000000).toString()).toString().trim(),
            stock_quantity:  parseInt(r['QUANTITY'] || r['Stock'], 10) || 10000,
            product_image:   '',
            expiry_date:     ''
          }));

        setImportRows(rows);
        setImportTotal(rows.length);
        setImportStatus('preview');
      } catch (err) {
        setImportError('Could not parse file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const runBulkImport = async () => {
    if (!importRows.length) return;
    setImportStatus('importing');
    setImportProgress(0);
    setImportError('');
    try {
      await bulkImportProducts(importRows, (done, total) => {
        setImportProgress(done);
        setImportTotal(total);
      });
      setImportStatus('done');
      if (onRefreshProducts) await onRefreshProducts();
    } catch (err) {
      setImportError(err.message);
      setImportStatus('preview');
    }
  };

  const closeImportModal = () => {
    setIsImportModalOpen(false);
    setImportRows([]);
    setImportFileName('');
    setImportStatus('idle');
    setImportProgress(0);
    setImportError('');
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const handleExportExcel = () => {
    const listToExport = selectedIds.size > 0 
      ? safeProducts.filter(p => selectedIds.has(p.id))
      : (filteredProducts.length > 0 ? filteredProducts : safeProducts);

    if (!listToExport.length) {
      alert('No products available to export.');
      return;
    }

    const excelRows = listToExport.map(p => ({
      'Books': p.product_name || '',
      'Grade': p.category_name || '',
      'Publisher': p.publisher || '',
      'Retail': p.retail_price || 0,
      'Wholesale': p.wholesale_price || 0,
      'BARCODE': p.barcode || '',
      'QUANTITY': p.stock_quantity !== undefined ? p.stock_quantity : 10000
    }));

    const ws = XLSX.utils.json_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Price List');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `brushwell_price_list_export_${dateStr}.xlsx`);
  };

  const toggleSelectProduct = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const ids = filteredProducts.map(p => p.id).filter(Boolean);
    setSelectedIds(new Set(ids));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size) return;
    const count = selectedIds.size;
    if (window.confirm(`Are you sure you want to delete the ${count} selected products?`)) {
      try {
        await bulkDeleteProducts(Array.from(selectedIds));
        clearSelection();
        if (onRefreshProducts) await onRefreshProducts();
      } catch (err) {
        alert('Error deleting selected products: ' + err.message);
      }
    }
  };

  const handleApplyBulkEdit = async () => {
    const targetProducts = selectedIds.size > 0 
      ? safeProducts.filter(p => selectedIds.has(p.id))
      : filteredProducts;

    if (!targetProducts.length) return;
    setIsBulkSubmitting(true);
    setBulkErrorMsg('');
    setBulkSuccessMsg('');
    setBulkProgress(0);
    setBulkTotal(targetProducts.length);

    try {
      if (bulkMode === 'clear') {
        if (!window.confirm(`⚠️ PERMANENTLY DELETE ALL ${safeProducts.length} PRODUCTS from database?`)) {
          setIsBulkSubmitting(false);
          return;
        }
        await deleteAllProducts();
        setSelectedIds(new Set());
        setBulkSuccessMsg('All products deleted successfully.');
      } else {
        const updatedList = targetProducts.map(p => {
          const updated = { ...p };
          if (bulkMode === 'price') {
            if (bulkRetailPrice !== '') updated.retail_price = parseFloat(bulkRetailPrice) || 0;
            if (bulkWholesalePrice !== '') {
              updated.wholesale_price = parseFloat(bulkWholesalePrice) || 0;
            } else if (bulkWholesalePct !== '') {
              const pct = parseFloat(bulkWholesalePct) || 80;
              updated.wholesale_price = (updated.retail_price * (pct / 100));
            }
          } else if (bulkMode === 'stock') {
            updated.stock_quantity = parseInt(bulkStockQty, 10) || 10000;
          } else if (bulkMode === 'category') {
            if (bulkCategory.trim()) {
              updated.category_name = bulkCategory.trim();
              updated.category_id = 'cat-' + bulkCategory.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
            }
          } else if (bulkMode === 'publisher') {
            if (bulkPublisher.trim()) updated.publisher = bulkPublisher.trim();
          }
          return updated;
        });

        await bulkUpdateProducts(updatedList, (done, total) => {
          setBulkProgress(done);
          setBulkTotal(total);
        });

        setBulkSuccessMsg(`Successfully updated ${updatedList.length} selected products!`);
      }

      if (onRefreshProducts) await onRefreshProducts();
    } catch (err) {
      console.error(err);
      setBulkErrorMsg(err.message || 'Failed to apply bulk update.');
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      
      {/* Top Header & Actions Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            Inventory
            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: 'var(--radius-full)', background: 'var(--primary-light)', color: 'var(--primary)' }}>
              {safeProducts.length}
            </span>
          </h2>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Database synced catalog ({filteredProducts.length} showing)
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          {/* Primary Add Button */}
          <button 
            type="button"
            className="btn-primary" 
            onClick={() => openFormModal(null)} 
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem', gap: '0.3rem' }}
          >
            <Plus size={17} /> Add Product
          </button>

          {/* AI Smart Book Register (Front & Back) */}
          <button 
            type="button"
            className="btn-secondary" 
            onClick={() => setIsVisualRegisterOpen(true)} 
            style={{ 
              fontSize: '0.8rem', 
              padding: '0.45rem 0.75rem', 
              gap: '0.35rem',
              borderColor: 'var(--primary)',
              color: 'var(--primary)',
              fontWeight: 700,
              background: 'var(--primary-light)'
            }}
            title="Scan Front & Back of book to auto-fill Title, Publisher, Category & Barcode"
          >
            <Camera size={16} /> 
            <span>Photo Register</span>
          </button>

          {/* Tools & Bulk Operations Dropdown / Trigger */}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsToolsMenuOpen(prev => !prev)}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.65rem', gap: '0.3rem', position: 'relative' }}
            title="Bulk Tools & Excel Import/Export"
          >
            <Zap size={15} color="var(--primary)" />
            <span>Tools</span>
          </button>

          {/* Grid / Table View Switcher */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-surface-elevated)',
            padding: '2px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)'
          }}>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              style={{
                padding: '0.35rem 0.55rem',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-sm)',
                background: viewMode === 'grid' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'grid' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer'
              }}
              title="Cards Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                padding: '0.35rem 0.55rem',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-sm)',
                background: viewMode === 'table' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'table' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer'
              }}
              title="Detailed Table View"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Tools Popover Menu */}
      {isToolsMenuOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setIsToolsMenuOpen(false)} />
          <div className="popover-menu" style={{ right: '4rem', top: '3.5rem', width: '230px' }}>
            <button
              type="button"
              className="popover-menu-item"
              onClick={() => { setIsToolsMenuOpen(false); setScanMode('new'); setIsScanModalOpen(true); }}
            >
              <Camera size={16} color="var(--primary)" />
              <span>Scan Barcode to Add</span>
            </button>

            {onOpenStockReceive && (
              <button
                type="button"
                className="popover-menu-item"
                onClick={() => { setIsToolsMenuOpen(false); onOpenStockReceive(); }}
              >
                <Package size={16} color="var(--accent-amber)" />
                <span>Restock Inventory</span>
              </button>
            )}

            <button
              type="button"
              className="popover-menu-item"
              onClick={() => { setIsToolsMenuOpen(false); setIsImportModalOpen(true); setImportStatus('idle'); setImportRows([]); }}
            >
              <FileSpreadsheet size={16} color="var(--accent-emerald)" />
              <span>Import from Excel</span>
            </button>

            <button
              type="button"
              className="popover-menu-item"
              onClick={() => { setIsToolsMenuOpen(false); handleExportExcel(); }}
            >
              <Download size={16} color="var(--primary)" />
              <span>Export to Excel</span>
            </button>

            <button
              type="button"
              className="popover-menu-item"
              onClick={() => { setIsToolsMenuOpen(false); setIsBulkEditOpen(true); setBulkSuccessMsg(''); setBulkErrorMsg(''); }}
            >
              <Edit3 size={16} color="var(--accent-purple)" />
              <span>Bulk Edit Prices & Stock</span>
            </button>
          </div>
        </>
      )}

      {/* Search Input with Integrated Barcode Scan Button */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={18} style={{ position: 'absolute', left: '12px', color: 'var(--text-subtle)' }} />
        <input 
          type="text"
          className="form-control"
          placeholder="Search by title, author, category or ISBN barcode..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ paddingLeft: '2.4rem', paddingRight: '2.8rem', fontSize: '0.88rem' }}
        />
        <button
          type="button"
          onClick={() => { setScanMode('new'); setIsScanModalOpen(true); }}
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
            gap: '0.2rem'
          }}
          title="Scan ISBN Barcode"
        >
          <Camera size={16} />
        </button>
      </div>

      {/* Filter Chips Horizontal Scroll Container */}
      <div className="chip-scroll-container">
        {/* Status Filter Chips */}
        <button
          type="button"
          className={`chip-pill ${selectedCat === 'all' && filterType === 'all' ? 'active' : ''}`}
          onClick={() => { setSelectedCat('all'); setFilterType('all'); }}
        >
          📦 All Items ({safeProducts.length})
        </button>
        <button
          type="button"
          className={`chip-pill ${filterType === 'low_stock' ? 'active' : ''}`}
          onClick={() => { setFilterType(filterType === 'low_stock' ? 'all' : 'low_stock'); setSelectedCat('all'); }}
        >
          ⚠️ Low Stock ({lowStockCount})
        </button>
        <button
          type="button"
          className={`chip-pill ${filterType === 'expiring' ? 'active' : ''}`}
          onClick={() => { setFilterType(filterType === 'expiring' ? 'all' : 'expiring'); setSelectedCat('all'); }}
        >
          ⏳ Expiring ({expiringCount})
        </button>

        {/* Category Chips */}
        {allCategories.map(cat => (
          <button
            key={cat.id}
            type="button"
            className={`chip-pill ${selectedCat === cat.id ? 'active' : ''}`}
            onClick={() => { setSelectedCat(selectedCat === cat.id ? 'all' : cat.id); setFilterType('all'); }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Multi-Select Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', padding: '0.2rem 0.1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            type="button"
            onClick={selectedIds.size === filteredProducts.length ? clearSelection : selectAllFiltered}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <input
              type="checkbox"
              checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
              onChange={selectedIds.size === filteredProducts.length ? clearSelection : selectAllFiltered}
              style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
            />
            {selectedIds.size === filteredProducts.length ? 'Deselect All' : `Select All (${filteredProducts.length})`}
          </button>

          {selectedIds.size > 0 && (
            <span style={{ color: 'var(--accent-purple)', fontWeight: 700 }}>
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => { setIsBulkEditOpen(true); setBulkSuccessMsg(''); setBulkErrorMsg(''); }}
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', background: 'var(--accent-purple)' }}
            >
              <Edit3 size={14} /> Bulk Edit ({selectedIds.size})
            </button>
            {isAdmin && (
              <button
                type="button"
                className="btn-danger"
                onClick={handleBulkDelete}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              >
                <Trash2 size={14} /> Delete ({selectedIds.size})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Inventory Display: Cards Grid or Responsive Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {viewMode === 'table' ? (
          <div className="responsive-table-wrapper">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th style={{ width: '32px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                      onChange={selectedIds.size === filteredProducts.length ? clearSelection : selectAllFiltered}
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                  </th>
                  <th>Title</th>
                  <th>Cat</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedProducts.map(product => {
                  const isLowStock = (product.stock_quantity || 0) <= 10;
                  const isSelected = selectedIds.has(product.id);

                  return (
                    <tr
                      key={product.id}
                      style={{
                        background: isSelected ? 'var(--primary-light)' : undefined
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectProduct(product.id)}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent-purple)' }}
                        />
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.8rem' }}>
                        <div style={{ whiteSpace: 'normal', wordBreak: 'break-word', minWidth: '100px' }}>
                          {product.product_name}
                        </div>
                        {product.publisher && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                            {product.publisher}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)', background: 'var(--primary-light)', color: 'var(--primary)', display: 'inline-block', whiteSpace: 'nowrap' }}>
                          {product.category_name || 'General'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        GH₵{parseFloat(product.retail_price || 0).toFixed(2)}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-full)',
                          background: isLowStock ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)',
                          color: isLowStock ? 'var(--accent-rose)' : 'var(--accent-emerald)'
                        }}>
                          {product.stock_quantity || 0}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'flex-end' }}>
                          <button type="button" className="btn-icon" title="Print Barcode" onClick={() => onOpenBarcodeGen && onOpenBarcodeGen(product)} style={{ width: '28px', height: '28px' }}>
                            <BarcodeIcon size={13} />
                          </button>
                          <button type="button" className="btn-icon" title="Edit Book" onClick={() => openFormModal(product)} style={{ width: '28px', height: '28px' }}>
                            <Edit3 size={13} />
                          </button>
                          {isAdmin && (
                            <button type="button" className="btn-icon" title="Delete" onClick={() => handleDelete(product.id)} style={{ width: '28px', height: '28px', color: 'var(--accent-rose)' }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="product-cards-grid">
            {displayedProducts.map(product => {
              const isLowStock = (product.stock_quantity || 0) <= 10;
              const isSelected = selectedIds.has(product.id);

              return (
                <div
                  key={product.id || Math.random()}
                  className="product-card-item"
                  style={{
                    border: isSelected ? '2px solid var(--accent-purple)' : undefined,
                    background: isSelected ? 'var(--primary-light)' : undefined
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectProduct(product.id)}
                      style={{
                        width: '18px',
                        height: '18px',
                        marginTop: '4px',
                        cursor: 'pointer',
                        accentColor: 'var(--accent-purple)',
                        flexShrink: 0
                      }}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        lineHeight: 1.3,
                        color: 'var(--text-main)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {product.product_name || 'Untitled Book'}
                      </div>
                      {product.publisher && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Publisher: {product.publisher}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                      <button
                        type="button" className="btn-icon" title="Print Barcode Label"
                        onClick={() => onOpenBarcodeGen && onOpenBarcodeGen(product)}
                        style={{ width: '30px', height: '30px' }}
                      >
                        <BarcodeIcon size={14} />
                      </button>
                      <button
                        type="button" className="btn-icon" title="Edit Book Details"
                        onClick={() => openFormModal(product)}
                        style={{ width: '30px', height: '30px' }}
                      >
                        <Edit3 size={14} />
                      </button>
                      {isAdmin && (
                        <button
                          type="button" className="btn-icon" title="Delete Book"
                          onClick={() => handleDelete(product.id)}
                          style={{ width: '30px', height: '30px', color: 'var(--accent-rose)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    paddingTop: '0.4rem',
                    borderTop: '1px dashed var(--border-light)'
                  }}>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      padding: '0.15rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
                      whiteSpace: 'nowrap',
                      maxWidth: '130px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {product.category_name || 'General'}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--primary)' }}>
                        GH₵ {parseFloat(product.retail_price || 0).toFixed(2)}
                      </span>

                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.45rem',
                        borderRadius: 'var(--radius-full)',
                        background: isLowStock ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)',
                        color: isLowStock ? 'var(--accent-rose)' : 'var(--accent-emerald)'
                      }}>
                        {product.stock_quantity || 0} in stock
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {filteredProducts.length > visibleCount && (
          <div style={{ padding: '0.75rem 0', textAlign: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setVisibleCount(prev => prev + 60)}
              style={{ width: '100%', padding: '0.65rem', fontWeight: 700, fontSize: '0.85rem' }}
            >
              📥 Load More ({filteredProducts.length - visibleCount} remaining)
            </button>
          </div>
        )}

        {filteredProducts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <Package size={40} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
            <div>No inventory items found matching your filters.</div>
          </div>
        )}
      </div>

      {/* Add / Edit Form Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div 
            className="modal-content" 
            onClick={e => e.stopPropagation()}
            style={{ 
              maxHeight: '88vh', 
              display: 'flex', 
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                {editingProduct ? 'Edit Book Details' : 'Add New Book'}
              </h3>
              <button type="button" className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <div className="modal-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="form-group">
                  <label>Book Title *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Integrated Science for JHS 1"
                    value={formData.product_name}
                    onChange={e => setFormData({ ...formData, product_name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label>Publisher / Author</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Aki-Ola / Millennium"
                      value={formData.publisher}
                      onChange={e => setFormData({ ...formData, publisher: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Category / Grade</label>
                    {!isCustomCategory ? (
                      <select
                        className="form-control"
                        value={formData.category_id}
                        onChange={e => {
                          if (e.target.value === '__custom__') {
                            setIsCustomCategory(true);
                          } else {
                            const found = allCategories.find(c => c.id === e.target.value);
                            setFormData({
                              ...formData,
                              category_id: e.target.value,
                              category_name: found ? found.name : ''
                            });
                          }
                        }}
                      >
                        {allCategories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                        <option value="__custom__">+ Add Custom Category...</option>
                      </select>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="New category name"
                          value={customCategoryInput}
                          onChange={e => setCustomCategoryInput(e.target.value)}
                        />
                        <button type="button" className="btn-secondary" onClick={() => setIsCustomCategory(false)}>
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label>Retail Price (GH₵) *</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      placeholder="0.00"
                      value={formData.retail_price}
                      onChange={e => {
                        const val = e.target.value;
                        const num = parseFloat(val) || 0;
                        setFormData({
                          ...formData,
                          retail_price: val,
                          wholesale_price: formData.wholesale_price || (num * 0.8).toFixed(2)
                        });
                      }}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Wholesale Price (GH₵)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      placeholder="0.00"
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
                      placeholder="10000"
                      value={formData.stock_quantity}
                      onChange={e => setFormData({ ...formData, stock_quantity: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <label style={{ margin: 0, fontWeight: 600 }}>Barcode / ISBN</label>
                      <button
                        type="button"
                        onClick={() => { setScanMode('form'); setIsScanModalOpen(true); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary)',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: 0
                        }}
                      >
                        <Camera size={13} /> Scan Barcode
                      </button>
                    </div>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Auto or scanned barcode"
                        value={formData.barcode}
                        onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                        style={{ paddingRight: '2.5rem', fontFamily: 'var(--font-mono)' }}
                      />
                      <button
                        type="button"
                        onClick={() => { setScanMode('form'); setIsScanModalOpen(true); }}
                        title="Scan Barcode with Camera"
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
                        <Camera size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ flexShrink: 0, position: 'sticky', bottom: 0, zIndex: 10, background: 'var(--bg-surface)' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
                  {editingProduct ? 'Update Book' : 'Save Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Camera Barcode Scanner Modal */}
      {isScanModalOpen && (
        <BarcodeScannerModal
          isOpen={isScanModalOpen}
          onClose={() => setIsScanModalOpen(false)}
          onScanSuccess={handleScanToAddSuccess}
          products={safeProducts}
        />
      )}

      {/* Visual Search & Smart Book Register Modal */}
      {isVisualRegisterOpen && (
        <VisualSearchModal
          isOpen={isVisualRegisterOpen}
          onClose={() => setIsVisualRegisterOpen(false)}
          initialMode="register"
          products={safeProducts}
          categories={allCategories}
          onRegisterProduct={handleVisualRegisterSuccess}
          onOpenSettings={onOpenSettings}
        />
      )}

      {/* Bulk Import Modal */}
      {isImportModalOpen && (
        <div className="modal-overlay" onClick={closeImportModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileSpreadsheet size={20} color="var(--accent-emerald)" />
                Bulk Import from Excel
              </h3>
              <button type="button" className="btn-icon" onClick={closeImportModal}><X size={18} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {importStatus === 'idle' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    Upload your <strong>.xlsx</strong> file. Expected columns: <code>Books, Grade, Publisher, Retail, Wholesale, BARCODE, QUANTITY</code>.
                  </div>
                  <label className="btn-secondary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', padding: '0.9rem' }}>
                    <Upload size={18} color="var(--accent-emerald)" />
                    Choose Excel File (.xlsx)
                    <input ref={importFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportFileSelect} style={{ display: 'none' }} />
                  </label>
                </div>
              )}

              {(importStatus === 'preview' || importStatus === 'importing' || importStatus === 'done') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    Parsed {importRows.length} products from {importFileName}
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)' }}>
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-app)' }}>
                          <th style={{ padding: '0.4rem' }}>Title</th>
                          <th style={{ padding: '0.4rem' }}>Grade</th>
                          <th style={{ padding: '0.4rem' }}>Retail</th>
                          <th style={{ padding: '0.4rem' }}>Barcode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 10).map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '0.4rem' }}>{r.product_name}</td>
                            <td style={{ padding: '0.4rem' }}>{r.category_name}</td>
                            <td style={{ padding: '0.4rem' }}>GH₵{r.retail_price}</td>
                            <td style={{ padding: '0.4rem' }}>{r.barcode}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {importStatus === 'importing' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Importing {importProgress} / {importTotal}...</div>
                      <div style={{ width: '100%', height: '6px', background: 'var(--border-light)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ width: `${(importProgress / importTotal) * 100}%`, height: '100%', background: 'var(--accent-emerald)' }} />
                      </div>
                    </div>
                  )}

                  {importStatus === 'done' && (
                    <div style={{ color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '0.9rem' }}>
                      ✓ Bulk import completed successfully!
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={closeImportModal}>
                Close
              </button>
              {importStatus === 'preview' && (
                <button type="button" className="btn-accent" onClick={runBulkImport}>
                  Import {importRows.length} Products
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {isBulkEditOpen && (
        <div className="modal-overlay" onClick={() => setIsBulkEditOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                Bulk Edit Products ({selectedIds.size > 0 ? selectedIds.size : filteredProducts.length})
              </h3>
              <button type="button" className="btn-icon" onClick={() => setIsBulkEditOpen(false)}><X size={18} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="form-group">
                <label>Operation Type</label>
                <select className="form-control" value={bulkMode} onChange={e => setBulkMode(e.target.value)}>
                  <option value="price">Update Retail & Wholesale Prices</option>
                  <option value="stock">Set Stock Quantity</option>
                  <option value="category">Change Category / Grade</option>
                  <option value="publisher">Set Publisher / Author</option>
                  {isAdmin && <option value="clear">⚠️ Delete All Catalog Items</option>}
                </select>
              </div>

              {bulkMode === 'price' && (
                <div className="grid-2">
                  <div className="form-group">
                    <label>Set Retail Price (GH₵)</label>
                    <input type="number" step="0.01" className="form-control" placeholder="e.g. 50.00" value={bulkRetailPrice} onChange={e => setBulkRetailPrice(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Wholesale % of Retail</label>
                    <input type="number" className="form-control" placeholder="80" value={bulkWholesalePct} onChange={e => setBulkWholesalePct(e.target.value)} />
                  </div>
                </div>
              )}

              {bulkMode === 'stock' && (
                <div className="form-group">
                  <label>Set Quantity for Selected Items</label>
                  <input type="number" className="form-control" value={bulkStockQty} onChange={e => setBulkStockQty(e.target.value)} />
                </div>
              )}

              {bulkSuccessMsg && <div style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>{bulkSuccessMsg}</div>}
              {bulkErrorMsg && <div style={{ color: 'var(--accent-rose)', fontWeight: 700 }}>{bulkErrorMsg}</div>}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setIsBulkEditOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleApplyBulkEdit} disabled={isBulkSubmitting}>
                {isBulkSubmitting ? 'Applying...' : 'Apply Bulk Update'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

