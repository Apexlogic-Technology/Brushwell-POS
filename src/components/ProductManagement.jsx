import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Package, Plus, Search, Edit3, Trash2, Barcode as BarcodeIcon, 
  Upload, Check, Camera, X, FileSpreadsheet, Loader, Download, 
  LayoutGrid, List, Zap, BookOpen, Layers, RotateCcw
} from 'lucide-react';
import { 
  saveProduct as saveProductToDB, 
  deleteProduct as deleteProductFromDB, 
  bulkImportProducts,
  bulkUpdateProducts,
  bulkDeleteProducts,
  deleteAllProducts,
  getCustomCategories,
  wipeAllProductStock,
  parseProductBarcodes
} from '../services/supabaseService';
import BarcodeScannerModal from './BarcodeScannerModal';
import VisualSearchModal from './VisualSearchModal';
import CategoryPublisherModal from './CategoryPublisherModal';

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
  onClearInitialBarcode,
  settings = {}
}) {
  const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];
  const safeCategories = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const currencySymbol = '¢';


  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all', 'low_stock', 'expiring'
  const [selectedCat, setSelectedCat] = useState('all');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedPublisher, setSelectedPublisher] = useState('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isVisualRegisterOpen, setIsVisualRegisterOpen] = useState(false);
  const [scanMode, setScanMode] = useState('new'); // 'new' | 'form' | 'form_add_barcode' | 'update_product'
  const [barcodeActionProduct, setBarcodeActionProduct] = useState(null);
  const [barcodeInputValue, setBarcodeInputValue] = useState('');
  const [productToUpdateBarcode, setProductToUpdateBarcode] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  // Multi-barcode form state: list of barcode chips + input for adding a new one
  const [formBarcodes, setFormBarcodes] = useState([]); // string[]
  const [barcodeChipInput, setBarcodeChipInput] = useState('');
  // Extra barcode management modal state
  const [extraBarcodeInput, setExtraBarcodeInput] = useState('');
  // Stock wipe state
  const [isWipingStock, setIsWipingStock] = useState(false);

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
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('brushwell_pm_view_mode') || 'catalog'); // 'catalog' | 'grid' | 'table'
  const [customCategoriesList, setCustomCategoriesList] = useState(() => getCustomCategories() || []);
  const [isCatPubModalOpen, setIsCatPubModalOpen] = useState(false);

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
    (customCategoriesList || []).forEach(c => {
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
  }, [safeCategories, safeProducts, customCategoriesList]);

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

  // Helper to extract the Class / Grade from any product field
  const getProductGrade = (p) => {
    if (!p) return '';
    const raw = (p.grade || p.class_name || p.level || p.category_name || p.category || '').toString().trim();
    if (!raw || raw.toLowerCase() === 'general' || raw.toLowerCase() === 'uncategorized') return '';
    return raw;
  };

  // Helper to expand educational level synonyms (e.g. "Class 3" <-> "Basic 3" <-> "BS 3" <-> "Stage 3")
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

  // Derive unique publishers and grades from inventory
  const allPublishers = useMemo(() => {
    const set = new Set();
    safeProducts.forEach(p => { if (p && p.publisher && p.publisher.trim()) set.add(p.publisher.trim()); });
    return Array.from(set).sort();
  }, [safeProducts]);

  const allGrades = useMemo(() => {
    const set = new Set();
    safeProducts.forEach(p => {
      const g = getProductGrade(p);
      if (g) set.add(g);
    });
    return Array.from(set).sort();
  }, [safeProducts]);

  // Filtered Products with Smart Combo Search & Filters
  const filteredProducts = useMemo(() => {
    return safeProducts.filter(p => {
      if (!p) return false;

      // Status chip filter
      if (filterType === 'low_stock') {
        if ((p.stock_quantity || 0) > 10) return false;
      }
      if (filterType === 'expiring') {
        if (!p.expiry_date) return false;
        const days = (new Date(p.expiry_date) - new Date()) / (1000 * 60 * 60 * 24);
        if (days > 30) return false;
      }

      // Category chip filter
      const matchesCat = selectedCat === 'all' || p.category_id === selectedCat || p.category_name === selectedCat;
      if (!matchesCat) return false;

      // Grade / Class dropdown filter
      if (selectedGrade !== 'all') {
        const pg = getProductGrade(p);
        if (!pg || pg.toLowerCase() !== selectedGrade.toLowerCase()) return false;
      }

      // Publisher dropdown filter
      if (selectedPublisher !== 'all') {
        const pp = (p.publisher || '').trim().toLowerCase();
        if (pp !== selectedPublisher.toLowerCase()) return false;
      }

      // Smart Combo Search (product name + class + publisher + author + barcode)
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const barcodeStr = String(p.barcode || '').toLowerCase();
        if (barcodeStr && barcodeStr.includes(q)) {
          return true;
        }
        const qTokens = q.split(/\s+/).filter(Boolean);
        const prodName = (p.product_name || '').toLowerCase();
        const publisher = (p.publisher || '').toLowerCase();
        const author = (p.author || '').toLowerCase();
        const cat = (p.category_name || '').toLowerCase();
        const grade = getProductGrade(p).toLowerCase();
        const gradeSyns = getGradeSynonyms(`${prodName} ${grade} ${cat}`);
        const fullSearchable = `${prodName} ${publisher} ${author} ${cat} ${grade} ${gradeSyns} ${barcodeStr}`;

        const allTokensMatch = qTokens.every(token => fullSearchable.includes(token));
        if (!allTokensMatch) return false;
      }

      return true;
    });
  }, [safeProducts, searchQuery, selectedCat, selectedGrade, selectedPublisher, filterType]);

  React.useEffect(() => {
    setVisibleCount(40);
  }, [searchQuery, selectedCat, selectedGrade, selectedPublisher, filterType]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const openFormModal = (product = null, initialBarcode = '', initialFields = null) => {
    setIsCustomCategory(false);
    setCustomCategoryInput('');
    setBarcodeChipInput('');
    const defaultCat = (allCategories && allCategories.length > 0) ? allCategories[0] : DEFAULT_CATEGORIES[0];

    if (product) {
      setEditingProduct(product);
      // Parse existing barcodes into chips — prepend initialBarcode if given
      const existingBarcodes = parseProductBarcodes(initialBarcode || initialFields?.barcode || product.barcode || '');
      setFormBarcodes(existingBarcodes.length > 0 ? existingBarcodes : [Math.floor(100000000000 + Math.random() * 900000000000).toString()]);
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
      const autoBarcode = (initialBarcode || initialFields?.barcode || Math.floor(100000000000 + Math.random() * 900000000000).toString());
      setFormBarcodes([autoBarcode]);
      setFormData({
        id: '',
        product_name: initialFields?.product_name || '',
        publisher: initialFields?.publisher || '',
        category_id: initialFields?.category_id || defaultCat.id,
        category_name: initialFields?.category_name || defaultCat.name,
        barcode: autoBarcode,
        retail_price: initialFields?.retail_price || '',
        wholesale_price: initialFields?.wholesale_price || '',
        stock_quantity: initialFields?.stock_quantity != null ? String(initialFields.stock_quantity) : '10000',
        expiry_date: '',
        product_image: initialFields?.product_image || ''
      });
    }
    setIsModalOpen(true);
  };

  // Add a barcode chip to the form list
  const addBarcodeChip = (code) => {
    const trimmed = String(code || '').trim();
    if (!trimmed) return;
    setFormBarcodes(prev => {
      if (prev.map(b => b.toLowerCase()).includes(trimmed.toLowerCase())) return prev;
      return [...prev, trimmed];
    });
    setBarcodeChipInput('');
  };

  // Remove a barcode chip from the form list (can't remove last one)
  const removeBarcodeChip = (index) => {
    setFormBarcodes(prev => {
      if (prev.length <= 1) return prev; // always keep at least one
      return prev.filter((_, i) => i !== index);
    });
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

  const handleSaveProductBarcode = async (targetProduct, newBarcode) => {
    if (!targetProduct) return;
    const trimmed = String(newBarcode || '').trim();
    if (!trimmed) {
      alert('Barcode cannot be empty.');
      return;
    }

    // Pipe-aware duplicate check: check if any barcode segment of any other product matches
    const duplicate = safeProducts.find(p => {
      if (p.id === targetProduct.id || !p.barcode) return false;
      const segments = String(p.barcode).split('|').map(s => s.trim().toLowerCase());
      return segments.includes(trimmed.toLowerCase());
    });
    if (duplicate) {
      const confirmShare = window.confirm(
        `Barcode "${trimmed}" is currently shared with "${duplicate.product_name}".\n\nWould you like "${targetProduct.product_name}" to also share this barcode? (The POS will automatically let you pick the subject whenever this barcode is scanned).`
      );
      if (!confirmShare) return;
    }

    setIsSubmitting(true);
    try {
      const updated = { ...targetProduct, barcode: trimmed };
      await saveProductToDB(updated);
      if (onRefreshProducts) await onRefreshProducts();
      setBarcodeActionProduct(null);
      setExtraBarcodeInput('');
      setToastMessage({
        type: 'success',
        text: `Barcode for "${targetProduct.product_name}" updated to ${trimmed}`
      });
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err) {
      console.error('Error saving barcode:', err);
      alert('Failed to update barcode: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add an extra barcode to an existing product (appends to pipe list)
  const handleAddExtraBarcode = async (targetProduct, newCode) => {
    if (!targetProduct) return;
    const trimmed = String(newCode || '').trim();
    if (!trimmed) return;
    const existingBarcodes = parseProductBarcodes(targetProduct.barcode);
    if (existingBarcodes.map(b => b.toLowerCase()).includes(trimmed.toLowerCase())) {
      alert('This barcode is already assigned to this product.');
      return;
    }
    const merged = [...existingBarcodes, trimmed].join('|');
    await handleSaveProductBarcode({ ...targetProduct, barcode: targetProduct.barcode }, merged);
    // Update barcodeActionProduct display
    setBarcodeActionProduct(prev => prev ? { ...prev, barcode: merged } : prev);
  };

  // Remove a barcode from an existing product's pipe list
  const handleRemoveBarcode = async (targetProduct, codeToRemove) => {
    if (!targetProduct) return;
    const existingBarcodes = parseProductBarcodes(targetProduct.barcode);
    if (existingBarcodes.length <= 1) {
      alert('Cannot remove the last barcode. Replace it instead.');
      return;
    }
    const merged = existingBarcodes.filter(b => b.toLowerCase() !== codeToRemove.toLowerCase()).join('|');
    setIsSubmitting(true);
    try {
      const updated = { ...targetProduct, barcode: merged };
      await saveProductToDB(updated);
      if (onRefreshProducts) await onRefreshProducts();
      setBarcodeActionProduct(prev => prev ? { ...prev, barcode: merged } : prev);
      setToastMessage({ type: 'success', text: `Removed barcode ${codeToRemove}` });
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      alert('Error removing barcode: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScanToAddSuccess = async (code, matchedProduct) => {
    setIsScanModalOpen(false);
    if (scanMode === 'form') {
      // Replace primary barcode in form
      setFormBarcodes(prev => [code, ...prev.slice(1)]);
      setFormData(prev => ({ ...prev, barcode: code }));
    } else if (scanMode === 'form_add_barcode') {
      // Append scanned code as additional barcode chip
      addBarcodeChip(code);
    } else if (scanMode === 'update_product' && productToUpdateBarcode) {
      const target = productToUpdateBarcode;
      setProductToUpdateBarcode(null);
      await handleSaveProductBarcode(target, code);
    } else if (scanMode === 'add_to_product' && productToUpdateBarcode) {
      const target = productToUpdateBarcode;
      setProductToUpdateBarcode(null);
      await handleAddExtraBarcode(target, code);
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

      // Join barcode chips back to pipe-separated string (primary is first chip)
      const joinedBarcode = formBarcodes.length > 0
        ? formBarcodes.join('|')
        : (formData.barcode || Math.floor(100000000000 + Math.random() * 900000000000).toString());

      const payload = {
        ...formData,
        barcode: joinedBarcode,
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

  // ─── Stock Wipe Handler ──────────────────────────────────────────────────────
  const handleWipeAllStock = async () => {
    if (!window.confirm(`⚠️ RESET ALL STOCK?\n\nThis will set stock_quantity to 0 for every product in the database. This cannot be undone.\n\nAre you sure?`)) return;
    if (!window.confirm('Confirm again: Set ALL product stock quantities to ZERO?')) return;
    setIsWipingStock(true);
    setIsToolsMenuOpen(false);
    try {
      await wipeAllProductStock();
      if (onRefreshProducts) await onRefreshProducts();
      setToastMessage({ type: 'success', text: `✅ All product stock quantities reset to 0.` });
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err) {
      alert('Failed to reset stock: ' + err.message);
    } finally {
      setIsWipingStock(false);
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
      'BARCODE': p.barcode ? (parseProductBarcodes(p.barcode)[0] || '') : '',
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
      
      {/* Top Header & Actions Bar — two-row layout, no horizontal scroll */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Row 1: Title */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

          {/* View Switcher — always top-right */}
          <div style={{
            display: 'flex',
            background: 'var(--bg-surface-elevated)',
            padding: '2px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
            flexShrink: 0
          }}>
            <button
              type="button"
              onClick={() => { setViewMode('catalog'); localStorage.setItem('brushwell_pm_view_mode', 'catalog'); }}
              style={{
                padding: '0.35rem 0.55rem',
                fontSize: '0.78rem',
                borderRadius: 'var(--radius-sm)',
                background: viewMode === 'catalog' ? 'var(--primary)' : 'transparent',
                color: viewMode === 'catalog' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer'
              }}
              title="Catalog List View (No scroll)"
            >
              <BookOpen size={15} />
            </button>
            <button
              type="button"
              onClick={() => { setViewMode('grid'); localStorage.setItem('brushwell_pm_view_mode', 'grid'); }}
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
              onClick={() => { setViewMode('table'); localStorage.setItem('brushwell_pm_view_mode', 'table'); }}
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

        {/* Row 2: Action buttons — wrap onto multiple lines on small screens */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
          alignItems: 'center'
        }}>
          {/* Add Product */}
          <button
            type="button"
            className="btn-primary"
            onClick={() => openFormModal(null)}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem', gap: '0.3rem', flexShrink: 0 }}
          >
            <Plus size={17} /> Add Product
          </button>

          {/* Photo Register */}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsVisualRegisterOpen(true)}
            style={{
              fontSize: '0.8rem',
              padding: '0.45rem 0.7rem',
              gap: '0.35rem',
              borderColor: 'var(--primary)',
              color: 'var(--primary)',
              fontWeight: 700,
              background: 'var(--primary-light)',
              flexShrink: 0
            }}
            title="Scan Front & Back of book to auto-fill Title, Publisher, Category & Barcode"
          >
            <Camera size={16} /> Photo Register
          </button>

          {/* Tools dropdown */}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsToolsMenuOpen(prev => !prev)}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.7rem', gap: '0.3rem', position: 'relative', flexShrink: 0 }}
            title="Bulk Tools & Excel Import/Export"
          >
            <Zap size={15} color="var(--primary)" /> Tools
          </button>

          {/* Categories & Publishers */}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsCatPubModalOpen(true)}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.7rem', gap: '0.35rem', flexShrink: 0 }}
            title="Manage and Rename Categories & Publishers"
          >
            <Layers size={15} color="var(--accent-purple)" /> Categories &amp; Publishers
          </button>
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

            <div style={{ height: '1px', background: 'var(--border-light)', margin: '0.25rem 0' }} />

            <button
              type="button"
              className="popover-menu-item"
              onClick={handleWipeAllStock}
              disabled={isWipingStock}
              style={{ color: 'var(--accent-rose)', fontWeight: 600 }}
              title="Reset stock quantity of all products to 0"
            >
              <RotateCcw size={16} color="var(--accent-rose)" className={isWipingStock ? 'animate-spin' : ''} />
              <span>{isWipingStock ? 'Resetting Stock...' : 'Reset All Stock to Zero'}</span>
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
          placeholder="Search combo (e.g. Oxford Basic 3 Maths, title, publisher, class, ISBN)..."
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

      {/* Grade + Publisher dropdowns */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedGrade}
          onChange={e => setSelectedGrade(e.target.value)}
          style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            padding: '0.35rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            border: selectedGrade !== 'all' ? '1.5px solid var(--primary)' : '1px solid var(--border-light)',
            background: selectedGrade !== 'all' ? 'var(--primary-light)' : 'var(--bg-surface-elevated)',
            color: selectedGrade !== 'all' ? 'var(--primary)' : 'var(--text-main)',
            cursor: 'pointer',
            minWidth: '120px'
          }}
        >
          <option value="all">📚 All Classes</option>
          {allGrades.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <select
          value={selectedPublisher}
          onChange={e => setSelectedPublisher(e.target.value)}
          style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            padding: '0.35rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            border: selectedPublisher !== 'all' ? '1.5px solid var(--primary)' : '1px solid var(--border-light)',
            background: selectedPublisher !== 'all' ? 'var(--primary-light)' : 'var(--bg-surface-elevated)',
            color: selectedPublisher !== 'all' ? 'var(--primary)' : 'var(--text-main)',
            cursor: 'pointer',
            minWidth: '130px'
          }}
        >
          <option value="all">🏢 All Publishers</option>
          {allPublishers.map(pub => <option key={pub} value={pub}>{pub}</option>)}
        </select>

        {(selectedGrade !== 'all' || selectedPublisher !== 'all') && (
          <button
            type="button"
            onClick={() => { setSelectedGrade('all'); setSelectedPublisher('all'); }}
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              padding: '0.33rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-rose-light)',
              color: 'var(--accent-rose)',
              border: '1px solid var(--accent-rose)',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            ✕ Clear Filters
          </button>
        )}

        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filteredProducts.length} of {safeProducts.length} items
        </span>
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
        {viewMode === 'catalog' ? (
          <div className="product-catalog-list">
            {displayedProducts.map(product => {
              const isLowStock = (product.stock_quantity || 0) <= 10;
              const isSelected = selectedIds.has(product.id);

              return (
                <div
                  key={product.id || Math.random()}
                  className="product-catalog-item"
                  style={{
                    border: isSelected ? '1.5px solid var(--accent-purple)' : undefined,
                    background: isSelected ? 'var(--primary-light)' : undefined
                  }}
                >
                  {/* Left: Checkbox + Thumbnail + Title/Grade/Publisher/Category */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: '1 1 260px' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectProduct(product.id)}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent-purple)', width: '17px', height: '17px', flexShrink: 0 }}
                    />

                    <div style={{
                      width: '36px', height: '36px', flexShrink: 0,
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {product.product_image ? (
                        <img src={product.product_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                      ) : (
                        <BookOpen size={16} color="var(--primary)" />
                      )}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                          {product.product_name || 'Untitled Book'}
                        </span>

                        {product.grade && (
                          <span style={{
                            fontSize: '0.7rem', fontWeight: 800, padding: '0.1rem 0.45rem',
                            borderRadius: 'var(--radius-sm)',
                            background: 'linear-gradient(135deg, var(--accent-purple), hsl(265,83%,45%))',
                            color: '#ffffff', whiteSpace: 'nowrap'
                          }}>
                            {product.grade}
                          </span>
                        )}

                        <span style={{
                          fontSize: '0.66rem', fontWeight: 600, padding: '0.1rem 0.4rem',
                          borderRadius: 'var(--radius-full)', background: 'var(--primary-light)',
                          color: 'var(--primary)', whiteSpace: 'nowrap'
                        }}>
                          {product.category_name || 'General'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginTop: '2px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {product.publisher && (
                          <span>Publisher: <b style={{ color: 'var(--text-main)' }}>{product.publisher}</b></span>
                        )}
                        {product.barcode && (() => {
                          const bCodes = parseProductBarcodes(product.barcode);
                          if (!bCodes.length) return null;
                          return (
                            <span style={{ fontFamily: 'monospace', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                              🏷️ {bCodes[0]}
                              {bCodes.length > 1 && (
                                <span style={{
                                  fontSize: '0.62rem',
                                  padding: '0.05rem 0.35rem',
                                  borderRadius: 'var(--radius-full)',
                                  background: 'var(--bg-surface-elevated)',
                                  border: '1px solid var(--border-light)',
                                  color: 'var(--text-muted)',
                                  fontWeight: 600
                                }}>
                                  +{bCodes.length - 1} more
                                </span>
                              )}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Right: Price + Stock + Action Icons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <div style={{ textAlign: 'right', minWidth: '70px' }}>
                      <div style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '0.92rem' }}>
                        {currencySymbol}{parseFloat(product.retail_price || 0).toFixed(2)}
                      </div>
                      {product.wholesale_price && parseFloat(product.wholesale_price) > 0 && parseFloat(product.wholesale_price) !== parseFloat(product.retail_price) && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          WS: {currencySymbol}{parseFloat(product.wholesale_price).toFixed(2)}
                        </div>
                      )}
                    </div>

                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                      borderRadius: 'var(--radius-full)',
                      background: isLowStock ? 'var(--accent-rose-light)' : 'var(--accent-emerald-light)',
                      color: isLowStock ? 'var(--accent-rose)' : 'var(--accent-emerald)',
                      whiteSpace: 'nowrap'
                    }}>
                      {product.stock_quantity || 0} in stock
                    </span>

                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Scan or Print Barcode"
                        onClick={() => {
                          setBarcodeActionProduct(product);
                          const bCodes = parseProductBarcodes(product.barcode);
                          setBarcodeInputValue(bCodes[0] || '');
                          setExtraBarcodeInput('');
                        }}
                        style={{ width: '30px', height: '30px' }}
                      >
                        <BarcodeIcon size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Edit Book Details"
                        onClick={() => openFormModal(product)}
                        style={{ width: '30px', height: '30px' }}
                      >
                        <Edit3 size={14} />
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="btn-icon"
                          title="Delete Book"
                          onClick={() => handleDelete(product.id)}
                          style={{ width: '30px', height: '30px', color: 'var(--accent-rose)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'table' ? (
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
                        {currencySymbol}{parseFloat(product.retail_price || 0).toFixed(2)}
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
                          <button 
                            type="button" 
                            className="btn-icon" 
                            title="Scan or Print Barcode" 
                            onClick={() => {
                              setBarcodeActionProduct(product);
                              const bCodes = parseProductBarcodes(product.barcode);
                              setBarcodeInputValue(bCodes[0] || '');
                              setExtraBarcodeInput('');
                            }} 
                            style={{ width: '28px', height: '28px' }}
                          >
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
                        type="button" 
                        className="btn-icon" 
                        title="Scan or Print Barcode"
                        onClick={() => {
                          setBarcodeActionProduct(product);
                          const bCodes = parseProductBarcodes(product.barcode);
                          setBarcodeInputValue(bCodes[0] || '');
                          setExtraBarcodeInput('');
                        }}
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
                        {currencySymbol} {parseFloat(product.retail_price || 0).toFixed(2)}
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
                    <label>Retail Price ({currencySymbol}) *</label>
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
                    <label>Wholesale Price ({currencySymbol})</label>
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
                      <label style={{ margin: 0, fontWeight: 600 }}>
                        Barcodes / ISBNs ({formBarcodes.length})
                      </label>
                      <button
                        type="button"
                        onClick={() => { setScanMode('form_add_barcode'); setIsScanModalOpen(true); }}
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
                        <Camera size={13} /> Scan to Add
                      </button>
                    </div>

                    {/* Chips container */}
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.35rem',
                      marginBottom: '0.45rem',
                      minHeight: '28px'
                    }}>
                      {formBarcodes.map((code, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.2rem 0.5rem',
                            background: idx === 0 ? 'var(--primary-light)' : 'var(--bg-surface-elevated)',
                            color: idx === 0 ? 'var(--primary)' : 'var(--text-main)',
                            border: `1px solid ${idx === 0 ? 'var(--primary)' : 'var(--border-light)'}`,
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.78rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600
                          }}
                        >
                          {idx === 0 && (
                            <span style={{
                              fontSize: '0.62rem',
                              background: 'var(--primary)',
                              color: '#fff',
                              padding: '0.05rem 0.3rem',
                              borderRadius: 'var(--radius-full)',
                              fontWeight: 700,
                              fontFamily: 'inherit'
                            }}>
                              Primary
                            </span>
                          )}
                          {code}
                          {formBarcodes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeBarcodeChip(idx)}
                              title="Remove barcode"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: 0,
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    {/* Add Barcode Input */}
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Add another barcode or ISBN..."
                        value={barcodeChipInput}
                        onChange={e => setBarcodeChipInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addBarcodeChip(barcodeChipInput);
                          }
                        }}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => addBarcodeChip(barcodeChipInput)}
                        disabled={!barcodeChipInput.trim()}
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                        title="Add barcode to product"
                      >
                        <Plus size={14} /> Add
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const randomCode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                          addBarcodeChip(randomCode);
                        }}
                        style={{ padding: '0.35rem 0.55rem', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                        title="Generate random barcode"
                      >
                        🎲 Auto
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
          onClose={() => {
            setIsScanModalOpen(false);
            setProductToUpdateBarcode(null);
          }}
          onScanSuccess={handleScanToAddSuccess}
          products={safeProducts}
          title={
            scanMode === 'update_product' 
              ? `Update Barcode for "${productToUpdateBarcode?.product_name || 'Product'}"`
              : scanMode === 'add_to_product'
                ? `Add Extra Barcode for "${productToUpdateBarcode?.product_name || 'Product'}"`
                : (scanMode === 'form' || scanMode === 'form_add_barcode')
                  ? `Scanning barcode for book form`
                  : 'Scan Barcode & ISBN'
          }
          subtitle={
            (scanMode === 'update_product' || scanMode === 'add_to_product') && productToUpdateBarcode
              ? `Scanning barcode for: ${productToUpdateBarcode.product_name}`
              : (scanMode === 'form' || scanMode === 'form_add_barcode')
                ? `Scanning barcode into book edit form`
                : 'Live Auto-Scan or Snap a Picture to capture'
          }
          targetProductName={
            (scanMode === 'update_product' || scanMode === 'add_to_product')
              ? productToUpdateBarcode?.product_name
              : (scanMode === 'form' || scanMode === 'form_add_barcode') ? formData.product_name : null
          }
        />
      )}

      {/* Barcode Actions Modal (Scan to Update / Print / Edit) */}
      {barcodeActionProduct && (
        <div 
          className="modal-overlay" 
          onClick={() => setBarcodeActionProduct(null)} 
          style={{ zIndex: 10500 }}
        >
          <div 
            className="modal-content" 
            onClick={e => e.stopPropagation()} 
            style={{ maxWidth: '480px' }}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <div style={{
                  background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
                  color: '#fff',
                  padding: '0.4rem',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <BarcodeIcon size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Barcode Management
                  </h3>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {barcodeActionProduct.product_name}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                className="btn-icon" 
                onClick={() => setBarcodeActionProduct(null)}
                style={{ width: '30px', height: '30px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {/* Assigned Barcodes Box */}
              {(() => {
                const assigned = parseProductBarcodes(barcodeActionProduct.barcode);
                return (
                  <div style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.85rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Assigned Barcodes / ISBNs ({assigned.length})
                      </span>
                      {assigned.length > 0 && (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--accent-emerald-light)',
                          color: 'var(--accent-emerald)'
                        }}>
                          Active
                        </span>
                      )}
                    </div>

                    {assigned.length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        No barcode assigned
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {assigned.map((code, idx) => (
                          <span
                            key={idx}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.25rem 0.55rem',
                              background: idx === 0 ? 'var(--primary-light)' : 'var(--bg-surface)',
                              color: idx === 0 ? 'var(--primary)' : 'var(--text-main)',
                              border: `1px solid ${idx === 0 ? 'var(--primary)' : 'var(--border-light)'}`,
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.8rem',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700
                            }}
                          >
                            {idx === 0 && (
                              <span style={{
                                fontSize: '0.6rem',
                                background: 'var(--primary)',
                                color: '#fff',
                                padding: '0.05rem 0.35rem',
                                borderRadius: 'var(--radius-full)',
                                fontWeight: 800,
                                fontFamily: 'inherit'
                              }}>
                                Primary
                              </span>
                            )}
                            {code}
                            {assigned.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveBarcode(barcodeActionProduct, code)}
                                title={`Remove barcode ${code}`}
                                disabled={isSubmitting}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                              >
                                <X size={13} />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Add Extra Barcode Section */}
              <div style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                    Add Another Barcode / ISBN
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const target = barcodeActionProduct;
                      setProductToUpdateBarcode(target);
                      setScanMode('add_to_product');
                      setBarcodeActionProduct(null);
                      setIsScanModalOpen(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: 0
                    }}
                  >
                    <Camera size={13} /> Scan with Camera
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Type additional barcode..."
                    value={extraBarcodeInput}
                    onChange={e => setExtraBarcodeInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (extraBarcodeInput.trim()) {
                          handleAddExtraBarcode(barcodeActionProduct, extraBarcodeInput);
                        }
                      }
                    }}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const randomBarcode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                      setExtraBarcodeInput(randomBarcode);
                    }}
                    title="Generate random barcode"
                    style={{ fontSize: '0.75rem', padding: '0 0.5rem', whiteSpace: 'nowrap' }}
                  >
                    🎲 Auto
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isSubmitting || !extraBarcodeInput.trim()}
                    onClick={() => handleAddExtraBarcode(barcodeActionProduct, extraBarcodeInput)}
                    style={{ fontSize: '0.78rem', padding: '0 0.75rem', whiteSpace: 'nowrap' }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {/* Action Buttons: Replace Primary Barcode vs Print Barcode */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const target = barcodeActionProduct;
                    setProductToUpdateBarcode(target);
                    setScanMode('update_product');
                    setBarcodeActionProduct(null);
                    setIsScanModalOpen(true);
                  }}
                  style={{
                    padding: '0.65rem 0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    textAlign: 'center'
                  }}
                >
                  <Camera size={18} color="var(--primary)" />
                  <span>Scan New Primary</span>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    Replaces primary barcode
                  </span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const target = barcodeActionProduct;
                    setBarcodeActionProduct(null);
                    if (onOpenBarcodeGen) onOpenBarcodeGen(target);
                  }}
                  style={{
                    padding: '0.65rem 0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    textAlign: 'center'
                  }}
                >
                  <BarcodeIcon size={18} color="var(--primary)" />
                  <span>Print Barcode</span>
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    Generate sticker sheet
                  </span>
                </button>
              </div>

              {/* Manual Primary Barcode Edit / Replace */}
              <div style={{
                borderTop: '1px solid var(--border-light)',
                paddingTop: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem'
              }}>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-subtle)' }}>
                  Or Replace Primary Barcode Manually:
                </label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="New primary barcode..."
                    value={barcodeInputValue}
                    onChange={e => setBarcodeInputValue(e.target.value)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const randomBarcode = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                      setBarcodeInputValue(randomBarcode);
                    }}
                    title="Generate random 12-digit barcode"
                    style={{ fontSize: '0.75rem', padding: '0 0.55rem', whiteSpace: 'nowrap' }}
                  >
                    🎲 Auto
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isSubmitting || !barcodeInputValue.trim() || barcodeInputValue.trim() === (parseProductBarcodes(barcodeActionProduct.barcode)[0] || '').trim()}
                    onClick={() => {
                      const existing = parseProductBarcodes(barcodeActionProduct.barcode);
                      const otherCodes = existing.slice(1);
                      const merged = [barcodeInputValue.trim(), ...otherCodes].join('|');
                      handleSaveProductBarcode(barcodeActionProduct, merged);
                    }}
                    style={{ fontSize: '0.78rem', padding: '0 0.85rem', whiteSpace: 'nowrap' }}
                  >
                    {isSubmitting ? <Loader size={14} className="animate-spin" /> : 'Update'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 12000,
          background: toastMessage.type === 'error' ? 'var(--accent-rose)' : 'var(--accent-emerald)',
          color: '#fff',
          padding: '0.65rem 1rem',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.84rem',
          fontWeight: 600,
          animation: 'slideUp 0.25s ease-out'
        }}>
          <Check size={16} />
          <span>{toastMessage.text}</span>
          <button 
            type="button" 
            onClick={() => setToastMessage(null)} 
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, marginLeft: '0.4rem', display: 'flex' }}
          >
            <X size={14} />
          </button>
        </div>
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
                            <td style={{ padding: '0.4rem' }}>{currencySymbol}{r.retail_price}</td>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div className="grid-2">
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Set Retail Price ({currencySymbol})</label>
                      <input type="number" step="0.01" className="form-control" placeholder="e.g. 50.00" value={bulkRetailPrice} onChange={e => setBulkRetailPrice(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Wholesale % of Retail</label>
                      <input type="number" className="form-control" placeholder="80" value={bulkWholesalePct} onChange={e => { setBulkWholesalePct(e.target.value); setBulkWholesalePrice(''); }} />
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Or Exact Wholesale Price ({currencySymbol}) (Optional override)</label>
                    <input type="number" step="0.01" className="form-control" placeholder="Leave blank to use percentage above" value={bulkWholesalePrice} onChange={e => { setBulkWholesalePrice(e.target.value); if (e.target.value) setBulkWholesalePct(''); }} />
                  </div>
                </div>
              )}

              {bulkMode === 'stock' && (
                <div className="form-group">
                  <label>Set Quantity for Selected Items</label>
                  <input type="number" className="form-control" value={bulkStockQty} onChange={e => setBulkStockQty(e.target.value)} />
                </div>
              )}

              {bulkMode === 'category' && (
                <div className="form-group">
                  <label>Select or Enter New Category / Grade</label>
                  <input
                    type="text"
                    list="bulk-categories-list"
                    className="form-control"
                    placeholder="e.g. Primary School (Class 1 - 6)"
                    value={bulkCategory}
                    onChange={e => setBulkCategory(e.target.value)}
                  />
                  <datalist id="bulk-categories-list">
                    {allCategories.map(c => (
                      <option key={c.id || c.name} value={c.name} />
                    ))}
                  </datalist>
                </div>
              )}

              {bulkMode === 'publisher' && (
                <div className="form-group">
                  <label>Select or Enter Publisher / Author</label>
                  <input
                    type="text"
                    list="bulk-publishers-list"
                    className="form-control"
                    placeholder="e.g. Aki-Ola Publications"
                    value={bulkPublisher}
                    onChange={e => setBulkPublisher(e.target.value)}
                  />
                  <datalist id="bulk-publishers-list">
                    {allPublishers.map(pub => (
                      <option key={pub} value={pub} />
                    ))}
                  </datalist>
                </div>
              )}

              {isBulkSubmitting && bulkTotal > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Processing: {bulkProgress} / {bulkTotal} products...
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

      {/* Category & Publisher Management Modal */}
      {isCatPubModalOpen && (
        <CategoryPublisherModal
          isOpen={isCatPubModalOpen}
          onClose={() => setIsCatPubModalOpen(false)}
          products={safeProducts}
          categories={allCategories}
          onCategoriesUpdated={(newCats) => {
            setCustomCategoriesList(newCats);
          }}
          onRefreshProducts={onRefreshProducts}
        />
      )}

    </div>
  );
}


