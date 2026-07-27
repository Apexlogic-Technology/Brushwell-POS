// n8n Webhook & PostgreSQL Data Service with Local Mock Fallback & Tax Support

const SETTINGS_KEY = 'brushwell_pos_settings';
const PRODUCTS_KEY = 'brushwell_pos_products';
const SALES_KEY = 'brushwell_pos_sales';
const CATEGORIES_KEY = 'brushwell_pos_categories';

// Bookshop Categories
export const INITIAL_CATEGORIES = [
  { id: 'cat-1', name: 'Fiction & Literature', color: 'hsl(222, 89%, 56%)' },
  { id: 'cat-2', name: 'Non-Fiction & Reference', color: 'hsl(38, 92%, 50%)' },
  { id: 'cat-3', name: "Children's & YA", color: 'hsl(152, 69%, 45%)' },
  { id: 'cat-4', name: 'Academic & Textbooks', color: 'hsl(265, 83%, 58%)' },
  { id: 'cat-5', name: 'Comics & Graphic Novels', color: 'hsl(348, 83%, 58%)' },
  { id: 'cat-6', name: 'Stationery & Supplies', color: 'hsl(190, 80%, 45%)' }
];

// Bookshop Seed Products
export const SEED_PRODUCTS = [
  {
    id: 'prod-101',
    product_image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=300&auto=format&fit=crop&q=80',
    category_id: 'cat-1',
    category_name: 'Fiction & Literature',
    product_name: 'The Midnight Library – Matt Haig',
    barcode: '9780525559474',
    retail_price: 18.99,
    wholesale_price: 12.50,
    expiry_date: '',
    stock_quantity: 24,
    created_at: new Date('2026-01-10').toISOString(),
    updated_at: new Date('2026-07-20').toISOString()
  },
  {
    id: 'prod-102',
    product_image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=300&auto=format&fit=crop&q=80',
    category_id: 'cat-1',
    category_name: 'Fiction & Literature',
    product_name: 'Atomic Habits – James Clear',
    barcode: '9780735211292',
    retail_price: 22.50,
    wholesale_price: 15.00,
    expiry_date: '',
    stock_quantity: 18,
    created_at: new Date('2026-02-01').toISOString(),
    updated_at: new Date('2026-07-22').toISOString()
  },
  {
    id: 'prod-103',
    product_image: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=300&auto=format&fit=crop&q=80',
    category_id: 'cat-2',
    category_name: 'Non-Fiction & Reference',
    product_name: 'Sapiens – Yuval Noah Harari',
    barcode: '9780062316097',
    retail_price: 21.99,
    wholesale_price: 14.00,
    expiry_date: '',
    stock_quantity: 30,
    created_at: new Date('2026-03-15').toISOString(),
    updated_at: new Date('2026-07-18').toISOString()
  },
  {
    id: 'prod-104',
    product_image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=300&auto=format&fit=crop&q=80',
    category_id: 'cat-3',
    category_name: "Children's & YA",
    product_name: 'Harry Potter & The Philosopher\'s Stone',
    barcode: '9780747532743',
    retail_price: 14.99,
    wholesale_price: 9.00,
    expiry_date: '',
    stock_quantity: 42,
    created_at: new Date('2026-01-05').toISOString(),
    updated_at: new Date('2026-07-27').toISOString()
  },
  {
    id: 'prod-105',
    product_image: 'https://images.unsplash.com/photo-1623517277848-51c3e24a2a62?w=300&auto=format&fit=crop&q=80',
    category_id: 'cat-4',
    category_name: 'Academic & Textbooks',
    product_name: 'Oxford English Grammar (Advanced)',
    barcode: '9780194312509',
    retail_price: 35.00,
    wholesale_price: 22.00,
    expiry_date: '',
    stock_quantity: 8,
    created_at: new Date('2026-04-10').toISOString(),
    updated_at: new Date('2026-07-15').toISOString()
  },
  {
    id: 'prod-106',
    product_image: 'https://images.unsplash.com/photo-1455885661740-29cbf08a42fa?w=300&auto=format&fit=crop&q=80',
    category_id: 'cat-5',
    category_name: 'Comics & Graphic Novels',
    product_name: 'Persepolis – Marjane Satrapi',
    barcode: '9780375422300',
    retail_price: 16.99,
    wholesale_price: 10.50,
    expiry_date: '',
    stock_quantity: 15,
    created_at: new Date('2026-05-20').toISOString(),
    updated_at: new Date('2026-07-10').toISOString()
  },
  {
    id: 'prod-107',
    product_image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=300&auto=format&fit=crop&q=80',
    category_id: 'cat-6',
    category_name: 'Stationery & Supplies',
    product_name: 'Premium A5 Hardcover Notebook',
    barcode: '6900001234567',
    retail_price: 8.99,
    wholesale_price: 5.50,
    expiry_date: '2027-12-31',
    stock_quantity: 5,
    created_at: new Date('2026-06-01').toISOString(),
    updated_at: new Date('2026-07-20').toISOString()
  }
];

export const getSettings = () => {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return {
    n8n_base_url: 'https://n8n.your-domain.com/webhook/pos',
    webhook_secret_key: '',
    use_mock_mode: true,
    cashier_name: 'Main Cashier',
    store_name: 'Brushwell Books',
    printer_paper_width: '58mm',
    printer_bluetooth_name: '',
    tax_rate_pct: 15, // 15% Tax/VAT rate
    tax_enabled_default: false // Optional VAT by default
  };
};

export const saveSettings = (settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

const getRequestHeaders = () => {
  const settings = getSettings();
  const headers = { 'Content-Type': 'application/json' };
  if (settings.webhook_secret_key) {
    headers['X-POS-Secret'] = settings.webhook_secret_key;
  }
  return headers;
};

export const getLocalProducts = () => {
  const saved = localStorage.getItem(PRODUCTS_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(SEED_PRODUCTS));
  return SEED_PRODUCTS;
};

export const saveLocalProducts = (products) => {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
};

export const getCategories = () => {
  const saved = localStorage.getItem(CATEGORIES_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(INITIAL_CATEGORIES));
  return INITIAL_CATEGORIES;
};

export const saveCategories = (categories) => {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
};

export const getSalesHistory = () => {
  const saved = localStorage.getItem(SALES_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { console.error(e); }
  }
  return [];
};

export const fetchProducts = async () => {
  const settings = getSettings();
  if (settings.use_mock_mode || !settings.n8n_base_url) {
    return getLocalProducts();
  }
  try {
    const res = await fetch(`${settings.n8n_base_url}/products`, {
      method: 'GET',
      headers: getRequestHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      saveLocalProducts(data);
      return data;
    }
    return getLocalProducts();
  } catch (err) {
    console.warn('n8n webhook error, using local fallback:', err);
    return getLocalProducts();
  }
};

export const saveProductToDB = async (productData) => {
  const settings = getSettings();
  let localProducts = getLocalProducts();
  const now = new Date().toISOString();
  let updatedProduct = { ...productData };

  if (!updatedProduct.id) {
    updatedProduct.id = 'prod-' + Date.now();
    updatedProduct.created_at = now;
  }
  updatedProduct.updated_at = now;

  const categories = getCategories();
  const cat = categories.find(c => c.id === updatedProduct.category_id);
  if (cat) updatedProduct.category_name = cat.name;

  const existingIdx = localProducts.findIndex(p => p.id === updatedProduct.id);
  if (existingIdx >= 0) { localProducts[existingIdx] = updatedProduct; }
  else { localProducts.unshift(updatedProduct); }
  saveLocalProducts(localProducts);

  if (!settings.use_mock_mode && settings.n8n_base_url) {
    try {
      await fetch(`${settings.n8n_base_url}/products`, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(updatedProduct)
      });
    } catch (e) { console.error('n8n save product error:', e); }
  }
  return updatedProduct;
};

// Stock Receiving (Bulk Restock)
export const receiveStock = async (restockItems) => {
  const settings = getSettings();
  let localProducts = getLocalProducts();

  restockItems.forEach(item => {
    const prod = localProducts.find(p => p.id === item.id || p.barcode === item.barcode);
    if (prod) {
      prod.stock_quantity = prod.stock_quantity + parseInt(item.quantity_added, 10);
      if (item.new_retail_price) prod.retail_price = parseFloat(item.new_retail_price);
      if (item.new_wholesale_price) prod.wholesale_price = parseFloat(item.new_wholesale_price);
      prod.updated_at = new Date().toISOString();
    }
  });

  saveLocalProducts(localProducts);

  if (!settings.use_mock_mode && settings.n8n_base_url) {
    try {
      await fetch(`${settings.n8n_base_url}/stock-receive`, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ restock: restockItems, timestamp: new Date().toISOString() })
      });
    } catch (e) { console.error('n8n restock webhook error:', e); }
  }
  return localProducts;
};

export const deleteProductFromDB = async (productId) => {
  const settings = getSettings();
  let localProducts = getLocalProducts().filter(p => p.id !== productId);
  saveLocalProducts(localProducts);
  if (!settings.use_mock_mode && settings.n8n_base_url) {
    try {
      await fetch(`${settings.n8n_base_url}/products`, {
        method: 'DELETE',
        headers: getRequestHeaders(),
        body: JSON.stringify({ id: productId })
      });
    } catch (e) { console.error('n8n delete product error:', e); }
  }
};

export const processCheckout = async (orderPayload) => {
  const settings = getSettings();
  let localProducts = getLocalProducts();

  orderPayload.items.forEach(item => {
    const prod = localProducts.find(p => p.id === item.id);
    if (prod) {
      prod.stock_quantity = Math.max(0, prod.stock_quantity - item.quantity);
      prod.updated_at = new Date().toISOString();
    }
  });
  saveLocalProducts(localProducts);

  let sales = getSalesHistory();
  sales.unshift(orderPayload);
  localStorage.setItem(SALES_KEY, JSON.stringify(sales));

  if (!settings.use_mock_mode && settings.n8n_base_url) {
    try {
      const res = await fetch(`${settings.n8n_base_url}/checkout`, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(orderPayload)
      });
      if (res.ok) return await res.json();
    } catch (e) { console.error('n8n checkout webhook error:', e); }
  }
  return { status: 'success', order_id: orderPayload.order_id, offline: settings.use_mock_mode };
};

// Process Refund / Return
export const processRefund = async (refundPayload) => {
  const settings = getSettings();
  let localProducts = getLocalProducts();

  // Restore inventory stock
  refundPayload.items.forEach(item => {
    const prod = localProducts.find(p => p.id === item.id || p.barcode === item.barcode);
    if (prod) {
      prod.stock_quantity += item.quantity;
      prod.updated_at = new Date().toISOString();
    }
  });
  saveLocalProducts(localProducts);

  // Record refund in sales log as negative order
  let sales = getSalesHistory();
  sales.unshift(refundPayload);
  localStorage.setItem(SALES_KEY, JSON.stringify(sales));

  if (!settings.use_mock_mode && settings.n8n_base_url) {
    try {
      await fetch(`${settings.n8n_base_url}/refund`, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(refundPayload)
      });
    } catch (e) { console.error('n8n refund webhook error:', e); }
  }

  return { status: 'success', refund_id: refundPayload.order_id };
};
