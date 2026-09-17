// Supabase Direct Database Service — Brushwell POS
// All business data (products, orders, users) lives in Supabase PostgreSQL.
// Device-only config (Supabase URL/key, printer settings, tax types) stays in localStorage.

import { createClient } from '@supabase/supabase-js';

const SETTINGS_KEY = 'brushwell_pos_settings';

// ─── Default Tax Types ───────────────────────────────────────────────────────
export const DEFAULT_TAX_TYPES = [
  { id: 'vat',     name: 'VAT',          rate_pct: 15,  enabled: true  },
  { id: 'nhil',    name: 'NHIL',         rate_pct: 2.5, enabled: false },
  { id: 'getfund', name: 'GETFund',      rate_pct: 2.5, enabled: false },
  { id: 'covid',   name: 'COVID-19 Levy',rate_pct: 1.0, enabled: false }
];

const DEFAULT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jbtchpgpngojhsyyucko.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpidGNocGdwbmdvamhzeXl1Y2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNzM5MDUsImV4cCI6MjEwMDc0OTkwNX0.aXGuX5MULbfYjYAxWIni7g0xcnETF1VJpbE7LC6zoFY';

// ─── Settings (device-local config only) ─────────────────────────────────────
export const getSettings = () => {
  const saved = localStorage.getItem(SETTINGS_KEY);
  let parsed = {};
  if (saved) {
    try {
      parsed = JSON.parse(saved) || {};
    } catch (e) { console.error(e); }
  }
  if (!parsed.tax_types || parsed.tax_types.length === 0) parsed.tax_types = DEFAULT_TAX_TYPES;

  return {
    supabase_url: parsed.supabase_url || DEFAULT_SUPABASE_URL,
    supabase_anon_key: parsed.supabase_anon_key || DEFAULT_SUPABASE_ANON_KEY,
    store_name: parsed.store_name || 'Brushwell Books',
    currency_symbol: '¢',
    printer_paper_width: parsed.printer_paper_width || '58mm',
    printer_bluetooth_name: parsed.printer_bluetooth_name || '',
    scanner_bluetooth_name: parsed.scanner_bluetooth_name || '',
    scanner_beep_enabled: parsed.scanner_beep_enabled !== undefined ? parsed.scanner_beep_enabled : true,
    tax_types: parsed.tax_types,
    tax_enabled_default: parsed.tax_enabled_default || false,
    low_stock_threshold: parsed.low_stock_threshold !== undefined ? parseInt(parsed.low_stock_threshold, 10) : 5,
    gemini_api_key: parsed.gemini_api_key || ''
  };
};

export const saveSettings = (settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, currency_symbol: '¢' }));
  _supabaseClient = null; // reset client when settings change
};

// ─── Supabase Client (lazily initialized) ─────────────────────────────────────
let _supabaseClient = null;

export const getSupabaseClient = () => {
  const settings = getSettings();
  if (!settings.supabase_url || !settings.supabase_anon_key) return null;

  if (!_supabaseClient) {
    _supabaseClient = createClient(settings.supabase_url, settings.supabase_anon_key, {
      auth: { persistSession: false }
    });
  }
  return _supabaseClient;
};

export const resetSupabaseClient = () => { _supabaseClient = null; };

// ─── Connection Test ──────────────────────────────────────────────────────────
export const testSupabaseConnection = async () => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase URL and Anon Key are not configured.' };

  try {
    const { error } = await client.from('products').select('id').limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};

// ─── Products ─────────────────────────────────────────────────────────────────
export const fetchProducts = async () => {
  const client = getSupabaseClient();
  if (!client) return [];

  // Supabase PostgREST defaults to max 1000 rows per request.
  // Loop with range() to fetch ALL products regardless of count.
  const PAGE_SIZE = 1000;
  let allProducts = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await client
      .from('products')
      .select('*')
      .order('product_name', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) { console.error('fetchProducts error:', error.message); break; }
    if (!data || data.length === 0) break;

    allProducts = allProducts.concat(data);
    if (data.length < PAGE_SIZE) break; // last page
    from += PAGE_SIZE;
  }

  return allProducts;
};


const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC4122 v4 compliant UUID generator for non-secure HTTP contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const saveProduct = async (productData) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const now = new Date().toISOString();
  const rawId = (productData.id && typeof productData.id === 'string') ? productData.id.trim() : '';
  const finalId = rawId || generateUUID();

  // Whitelist only columns that exist in the Supabase 'products' table schema
  const payload = {
    id: finalId,
    product_name: String(productData.product_name || '').trim(),
    barcode: String(productData.barcode || '').trim(),
    category_id: productData.category_id || 'cat-1',
    category_name: productData.category_name || 'General',
    retail_price: parseFloat(productData.retail_price) || 0,
    wholesale_price: parseFloat(productData.wholesale_price) || 0,
    stock_quantity: parseInt(productData.stock_quantity, 10) || 0,
    product_image: productData.product_image || '',
    expiry_date: productData.expiry_date || '',
    publisher: productData.publisher ? String(productData.publisher).trim() : '',
    updated_at: now,
    created_at: productData.created_at || now
  };

  // Perform upsert with automatic retry on transient network/timeout errors
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await client
        .from('products')
        .upsert(payload, { onConflict: 'id' })
        .select();

      if (error) {
        lastError = new Error(error.message);
        const isTransient = /failed to fetch|network|timeout|502|503|504|connection/i.test(error.message);
        if (!isTransient || attempt === maxAttempts) {
          throw lastError;
        }
      } else {
        return (data && data.length > 0) ? data[0] : payload;
      }
    } catch (err) {
      lastError = err;
      const isTransient = /failed to fetch|network|timeout|502|503|504|connection/i.test(err?.message || '');
      if (isTransient && attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, attempt * 350));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Failed to save product');
};

export const deleteProduct = async (productId) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client.from('products').delete().eq('id', productId);
  if (error) throw new Error(error.message);
};

export const bulkDeleteProducts = async (productIdsArray) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client.from('products').delete().in('id', productIdsArray);
  if (error) throw new Error(error.message);
};


// Batch upsert for Excel bulk import — inserts 100 rows at a time
export const bulkImportProducts = async (productsArray, onProgress) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const now = new Date().toISOString();
  const payload = productsArray.map(p => ({
    ...p,
    id: generateUUID(),
    created_at: now,
    updated_at: now
  }));

  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const batch = payload.slice(i, i + BATCH_SIZE);
    const { error } = await client.from('products').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error('Batch ' + (Math.floor(i / BATCH_SIZE) + 1) + ' failed: ' + error.message);
    inserted += batch.length;
    if (onProgress) onProgress(inserted, payload.length);
  }

  return inserted;
};

// Bulk update existing products in batches of 100
export const bulkUpdateProducts = async (productsArray, onProgress) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const now = new Date().toISOString();
  const payload = productsArray.map(p => ({
    ...p,
    updated_at: now
  }));

  const BATCH_SIZE = 100;
  let updated = 0;

  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const batch = payload.slice(i, i + BATCH_SIZE);
    const { error } = await client.from('products').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error('Batch update failed: ' + error.message);
    updated += batch.length;
    if (onProgress) onProgress(updated, payload.length);
  }

  return updated;
};

// Wipe all products table
export const deleteAllProducts = async () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw new Error(error.message);
};

// ─── Multi-Barcode Helper ────────────────────────────────────────────────────
// Barcodes are stored as pipe-separated values: "code1|code2|code3"
// This helper splits, trims and removes empty entries.
export const parseProductBarcodes = (barcodeStr) => {
  if (!barcodeStr) return [];
  return String(barcodeStr)
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);
};

// Wipe all barcodes — sets barcode to '' for every product, preserving all other data
export const wipeAllProductBarcodes = async () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client
    .from('products')
    .update({ barcode: '', updated_at: new Date().toISOString() })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) throw new Error(error.message);
};

// Wipe ALL product stock quantities to 0
export const wipeAllProductStock = async () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client
    .from('products')
    .update({ stock_quantity: 0, updated_at: new Date().toISOString() })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) throw new Error(error.message);
};

export const updateProductStock = async (productId, newQty) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client
    .from('products')
    .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
    .eq('id', productId);

  if (error) throw new Error(error.message);
};

// ─── Orders ───────────────────────────────────────────────────────────────────
export const processCheckout = async (orderPayload) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const payload = {
    order_id:        orderPayload.order_id,
    cashier_id:      orderPayload.cashier_id || null,
    cashier_name:    orderPayload.cashier_name || 'Staff',
    cashier_role:    orderPayload.cashier_role || 'attendant',
    items:           orderPayload.items,
    subtotal:        parseFloat(orderPayload.subtotal) || 0,
    tax_total:       parseFloat(orderPayload.tax_total ?? orderPayload.tax_amount ?? 0) || 0,
    tax_breakdown:   orderPayload.tax_breakdown || [],
    total:           parseFloat(orderPayload.total) || 0,
    payment_method:  orderPayload.payment_method || 'Cash',
    amount_tendered: parseFloat(orderPayload.amount_tendered ?? orderPayload.cash_given ?? orderPayload.total ?? 0) || 0,
    change_given:    parseFloat(orderPayload.change_given ?? orderPayload.change_due ?? 0) || 0,
    customer_name:   orderPayload.customer_name || 'Walk-in Customer',
    customer_phone:  orderPayload.customer_phone || '',
    tax_applied:     Boolean(orderPayload.tax_applied ?? orderPayload.apply_tax ?? false),
    order_type:      'sale',
    created_at:      orderPayload.created_at || orderPayload.timestamp || new Date().toISOString()
  };

  // Only include split_payments if it actually exists in payload and is non-empty
  if (orderPayload.split_payments && Array.isArray(orderPayload.split_payments) && orderPayload.split_payments.length > 0) {
    payload.split_payments = orderPayload.split_payments;
  }

  let { data: order, error: orderError } = await client
    .from('orders')
    .insert(payload)
    .select()
    .single();

  // Fallback: strip columns that might not exist in schema yet, retry
  if (orderError) {
    const msg = orderError.message || '';
    if (msg.includes('split_payments')) {
      delete payload.split_payments;
    }
    if (msg.includes('customer_name') || msg.includes('customer_phone') || msg.includes('schema cache')) {
      delete payload.customer_name;
      delete payload.customer_phone;
      delete payload.split_payments;
    }
    const retry = await client.from('orders').insert(payload).select().single();
    order = retry.data;
    orderError = retry.error;
  }

  if (orderError) throw new Error(orderError.message);

  // Decrement stock for each item sold safely (skip spot borrowed / sourced items)
  for (const item of (orderPayload.items || [])) {
    try {
      if (!item || !item.id || item.is_borrowed) continue;
      const { data: prod } = await client
        .from('products')
        .select('stock_quantity')
        .eq('id', item.id)
        .maybeSingle();

      if (prod && typeof prod.stock_quantity === 'number') {
        const newQty = Math.max(0, prod.stock_quantity - (item.quantity || 1));
        await client
          .from('products')
          .update({
            stock_quantity: newQty,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);
      }
    } catch (err) {
      console.warn('Stock decrement non-critical warning for item:', item?.id, err);
    }
  }

  return { status: 'success', order_id: order ? order.order_id : orderPayload.order_id };
};

// ─── Borrowed Items Settlement ───────────────────────────────────────────────
export const updateOrderBorrowSettlement = async (orderId, itemId, settlementStatus, settlementNotes = '') => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data: order, error: fetchErr } = await client
    .from('orders')
    .select('*')
    .eq('order_id', orderId)
    .single();

  if (fetchErr) throw new Error(fetchErr.message);

  const updatedItems = (order.items || []).map(item => {
    if (item.id === itemId || (item.is_borrowed && item.product_name === itemId)) {
      return {
        ...item,
        borrow_settlement_status: settlementStatus,
        borrow_settled_at: settlementStatus === 'paid' ? new Date().toISOString() : null,
        borrow_settlement_notes: settlementNotes
      };
    }
    return item;
  });

  const { data, error: updateErr } = await client
    .from('orders')
    .update({ items: updatedItems })
    .eq('order_id', orderId)
    .select()
    .single();

  if (updateErr) throw new Error(updateErr.message);
  return data;
};

export const processRefund = async (refundPayload) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data: refund, error: refundError } = await client
    .from('orders')
    .insert({
      order_id:       refundPayload.order_id,
      cashier_name:   refundPayload.cashier_name || 'Staff',
      cashier_role:   refundPayload.cashier_role || 'attendant',
      items:          refundPayload.items,
      subtotal:       refundPayload.subtotal || 0,
      tax_total:      refundPayload.tax_total || 0,
      tax_breakdown:  refundPayload.tax_breakdown || [],
      total:          refundPayload.total || 0,
      payment_method: refundPayload.payment_method || 'refund',
      order_type:     'refund',
      created_at:     new Date().toISOString()
    })
    .select()
    .single();

  if (refundError) throw new Error(refundError.message);

  // Restore stock for each returned item (skip borrowed items — they were never in our stock)
  for (const item of (refundPayload.items || [])) {
    try {
      if (!item || !item.id || item.is_borrowed) continue;
      const { data: prod } = await client
        .from('products')
        .select('stock_quantity')
        .eq('id', item.id)
        .maybeSingle();

      if (prod && typeof prod.stock_quantity === 'number') {
        await client
          .from('products')
          .update({
            stock_quantity: prod.stock_quantity + (item.quantity || 1),
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);
      }
    } catch (err) {
      console.warn('Restore stock non-critical warning:', err);
    }
  }

  return { status: 'success', refund_id: refund ? refund.order_id : refundPayload.order_id };
};

export const fetchOrders = async ({ limit = 100, orderType = null, search = '' } = {}) => {
  const client = getSupabaseClient();
  if (!client) return [];

  let query = client
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (orderType) query = query.eq('order_type', orderType);
  if (search) query = query.ilike('order_id', `%${search}%`);

  const { data, error } = await query;
  if (error) { console.error('fetchOrders error:', error.message); return []; }
  return data || [];
};

export const fetchOrderById = async (orderId) => {
  const client = getSupabaseClient();
  if (!client || !orderId) return null;

  try {
    const { data, error } = await client
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();
    if (!error && data) return data;
  } catch (err) {
    console.warn('fetchOrderById error:', err);
  }

  // Fallback search by partial or raw ID
  try {
    const { data: list } = await client
      .from('orders')
      .select('*')
      .ilike('order_id', `%${orderId}%`)
      .limit(1);
    if (list && list.length > 0) return list[0];
  } catch (err) {
    console.warn('fetchOrderById fallback error:', err);
  }

  return null;
};

// ─── Stock Receiving ──────────────────────────────────────────────────────────
export const receiveStock = async (restockItems) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  for (const item of restockItems) {
    const { data: prod } = await client.from('products').select('stock_quantity').eq('id', item.id).single();
    if (!prod) continue;

    const updates = {
      stock_quantity: prod.stock_quantity + parseInt(item.quantity_added, 10),
      updated_at: new Date().toISOString()
    };
    if (item.new_retail_price)    updates.retail_price    = parseFloat(item.new_retail_price);
    if (item.new_wholesale_price) updates.wholesale_price = parseFloat(item.new_wholesale_price);

    await client.from('products').update(updates).eq('id', item.id);
  }

  return { status: 'success' };
};

// ─── POS Users ────────────────────────────────────────────────────────────────
export const fetchUsers = async () => {
  const client = getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('pos_users')
    .select('*')
    .order('name', { ascending: true });

  if (error) { console.error('fetchUsers error:', error.message); return []; }
  return data || [];
};

export const saveUser = async (userData) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const payload = {
    ...userData,
    updated_at: new Date().toISOString(),
    created_at: userData.created_at || new Date().toISOString()
  };
  if (!payload.id) payload.id = generateUUID();

  const { data, error } = await client
    .from('pos_users')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const deleteUser = async (userId) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client.from('pos_users').delete().eq('id', userId);
  if (error) throw new Error(error.message);
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const fetchReports = async ({ dateFrom, dateTo } = {}) => {
  const client = getSupabaseClient();
  if (!client) return null;

  const from = dateFrom || new Date(new Date().setHours(0,0,0,0)).toISOString();
  const to   = dateTo   || new Date().toISOString();

  const { data: orders, error } = await client
    .from('orders')
    .select('*')
    .gte('created_at', from)
    .lte('created_at', to)
    .eq('order_type', 'sale');

  if (error) { console.error('fetchReports error:', error.message); return null; }

  const totalSales       = orders.reduce((s, o) => s + Number(o.total), 0);
  const totalTax         = orders.reduce((s, o) => s + Number(o.tax_total), 0);
  const transactionCount = orders.length;

  // Top products by quantity sold
  const productMap = {};
  orders.forEach(o => {
    (o.items || []).forEach(item => {
      if (!productMap[item.id]) productMap[item.id] = { name: item.product_name, qty: 0, revenue: 0 };
      productMap[item.id].qty     += item.quantity;
      productMap[item.id].revenue += item.quantity * item.price;
    });
  });
  const topProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 10);

  return { totalSales, totalTax, transactionCount, orders, topProducts };
};

// ─── Outbound Loans (Books lent BY Brushwell TO other shops) ──────────────────
export const fetchOutboundLoans = async () => {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('outbound_loans')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchOutboundLoans error:', error.message); return []; }
  return data || [];
};

export const createOutboundLoan = async (loanPayload) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const now = new Date().toISOString();
  const payload = {
    ...loanPayload,
    loan_ref: loanPayload.loan_ref || ('LOAN-' + Math.floor(100000 + Math.random() * 900000)),
    status: 'outstanding',
    loaned_at: now,
    created_at: now,
    updated_at: now
  };
  const { data, error } = await client.from('outbound_loans').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const updateOutboundLoan = async (id, updates) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const { data, error } = await client
    .from('outbound_loans')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteOutboundLoan = async (id) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const { error } = await client.from('outbound_loans').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ─── Order Deletion (Admin only) ──────────────────────────────────────────────
export const deleteOrder = async (orderId, { restoreStock = true } = {}) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  if (!orderId) throw new Error('No order ID provided');

  // Optional: Restore product stock if not a refund and items exist
  if (restoreStock) {
    try {
      const { data: order } = await client
        .from('orders')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      if (order && Array.isArray(order.items) && order.order_type !== 'refund') {
        for (const item of order.items) {
          if (!item || !item.id || item.is_borrowed) continue;
          const { data: prod } = await client
            .from('products')
            .select('stock_quantity')
            .eq('id', item.id)
            .maybeSingle();

          if (prod && typeof prod.stock_quantity === 'number') {
            await client
              .from('products')
              .update({
                stock_quantity: prod.stock_quantity + (parseInt(item.quantity, 10) || 1),
                updated_at: new Date().toISOString()
              })
              .eq('id', item.id);
          }
        }
      }
    } catch (stockErr) {
      console.warn('Stock restoration warning before deleteOrder:', stockErr);
    }
  }

  // Delete from orders table by order_id
  const { error } = await client
    .from('orders')
    .delete()
    .eq('order_id', orderId);

  if (error) {
    // Fallback: try by UUID id if order_id didn't match
    const { error: fallbackErr } = await client
      .from('orders')
      .delete()
      .eq('id', orderId);
    if (fallbackErr) throw new Error(fallbackErr.message);
  }

  return { success: true, order_id: orderId };
};

// ─── Category & Publisher Bulk Operations ────────────────────────────────────
export const renameCategoryInProducts = async (oldName, newName) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  if (!oldName || !newName || oldName.trim() === newName.trim()) return 0;

  const { data, error } = await client
    .from('products')
    .update({ category_name: newName.trim(), updated_at: new Date().toISOString() })
    .ilike('category_name', oldName.trim())
    .select('id');

  if (error) throw new Error('Failed to rename category in products: ' + error.message);
  return data ? data.length : 0;
};

export const renamePublisherInProducts = async (oldName, newName) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  if (!oldName || !newName || oldName.trim() === newName.trim()) return 0;

  const { data, error } = await client
    .from('products')
    .update({ publisher: newName.trim(), updated_at: new Date().toISOString() })
    .ilike('publisher', oldName.trim())
    .select('id');

  if (error) throw new Error('Failed to rename publisher in products: ' + error.message);
  return data ? data.length : 0;
};

// ─── Local Custom Categories & Publishers Persistence ─────────────────────────
const CUSTOM_CATEGORIES_KEY = 'brushwell_custom_categories';
const CUSTOM_PUBLISHERS_KEY = 'brushwell_custom_publishers';

export const getCustomCategories = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveCustomCategories = (categories) => {
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
  } catch (err) {
    console.error('saveCustomCategories error:', err);
  }
};

export const getCustomPublishers = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_PUBLISHERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveCustomPublishers = (publishers) => {
  try {
    localStorage.setItem(CUSTOM_PUBLISHERS_KEY, JSON.stringify(publishers));
  } catch (err) {
    console.error('saveCustomPublishers error:', err);
  }
};

// ─── Suppliers ────────────────────────────────────────────────────────────────

export const fetchSuppliers = async () => {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true });
  if (error) { console.error('fetchSuppliers error:', error.message); return []; }
  return data || [];
};

export const saveSupplier = async (supplierData) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const now = new Date().toISOString();
  const payload = {
    id: supplierData.id || generateUUID(),
    name: String(supplierData.name || '').trim(),
    contact_person: String(supplierData.contact_person || '').trim(),
    phone: String(supplierData.phone || '').trim(),
    email: String(supplierData.email || '').trim(),
    address: String(supplierData.address || '').trim(),
    notes: String(supplierData.notes || '').trim(),
    total_credit: parseFloat(supplierData.total_credit) || 0,
    total_paid: parseFloat(supplierData.total_paid) || 0,
    updated_at: now,
    created_at: supplierData.created_at || now
  };
  const { data, error } = await client
    .from('suppliers')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteSupplier = async (id) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const { error } = await client.from('suppliers').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ─── Supplier Transactions ────────────────────────────────────────────────────

export const fetchSupplierTransactions = async (supplierId) => {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('supplier_transactions')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchSupplierTransactions error:', error.message); return []; }
  return data || [];
};

export const addSupplierTransaction = async (txnData) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const payload = {
    id: generateUUID(),
    supplier_id: txnData.supplier_id,
    type: txnData.type, // 'credit' | 'payment'
    amount: parseFloat(txnData.amount) || 0,
    description: String(txnData.description || '').trim(),
    reference: String(txnData.reference || '').trim(),
    invoice_image_url: txnData.invoice_image_url || '',
    invoice_image_data: txnData.invoice_image_data || '',
    created_by: txnData.created_by || 'Staff',
    created_at: new Date().toISOString()
  };
  const { data, error } = await client
    .from('supplier_transactions')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Update supplier totals
  const { data: sup } = await client.from('suppliers').select('total_credit,total_paid').eq('id', txnData.supplier_id).single();
  if (sup) {
    const updates = { updated_at: new Date().toISOString() };
    if (txnData.type === 'credit') updates.total_credit = (parseFloat(sup.total_credit) || 0) + payload.amount;
    if (txnData.type === 'payment') updates.total_paid = (parseFloat(sup.total_paid) || 0) + payload.amount;
    await client.from('suppliers').update(updates).eq('id', txnData.supplier_id);
  }
  return data;
};

export const deleteSupplierTransaction = async (txnId, supplierId) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  // Get txn first to reverse totals
  const { data: txn } = await client.from('supplier_transactions').select('*').eq('id', txnId).single();
  const { error } = await client.from('supplier_transactions').delete().eq('id', txnId);
  if (error) throw new Error(error.message);
  if (txn && supplierId) {
    const { data: sup } = await client.from('suppliers').select('total_credit,total_paid').eq('id', supplierId).single();
    if (sup) {
      const updates = { updated_at: new Date().toISOString() };
      if (txn.type === 'credit') updates.total_credit = Math.max(0, (parseFloat(sup.total_credit) || 0) - parseFloat(txn.amount || 0));
      if (txn.type === 'payment') updates.total_paid = Math.max(0, (parseFloat(sup.total_paid) || 0) - parseFloat(txn.amount || 0));
      await client.from('suppliers').update(updates).eq('id', supplierId);
    }
  }
};

// ─── Debtors ──────────────────────────────────────────────────────────────────

export const fetchDebtors = async () => {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('debtors')
    .select('*')
    .order('name', { ascending: true });
  if (error) { console.error('fetchDebtors error:', error.message); return []; }
  return data || [];
};

export const saveDebtor = async (debtorData) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const now = new Date().toISOString();
  const payload = {
    id: debtorData.id || generateUUID(),
    name: String(debtorData.name || '').trim(),
    phone: String(debtorData.phone || '').trim(),
    email: String(debtorData.email || '').trim(),
    address: String(debtorData.address || '').trim(),
    school: String(debtorData.school || '').trim(),
    notes: String(debtorData.notes || '').trim(),
    total_debit: parseFloat(debtorData.total_debit) || 0,
    total_paid: parseFloat(debtorData.total_paid) || 0,
    updated_at: now,
    created_at: debtorData.created_at || now
  };
  const { data, error } = await client
    .from('debtors')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteDebtor = async (id) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const { error } = await client.from('debtors').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// ─── Debtor Transactions ──────────────────────────────────────────────────────

export const fetchDebtorTransactions = async (debtorId) => {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('debtor_transactions')
    .select('*')
    .eq('debtor_id', debtorId)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchDebtorTransactions error:', error.message); return []; }
  return data || [];
};

export const addDebtorTransaction = async (txnData) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const payload = {
    id: generateUUID(),
    debtor_id: txnData.debtor_id,
    type: txnData.type, // 'debit' | 'payment'
    amount: parseFloat(txnData.amount) || 0,
    description: String(txnData.description || '').trim(),
    reference: String(txnData.reference || '').trim(),
    invoice_image_url: txnData.invoice_image_url || '',
    invoice_image_data: txnData.invoice_image_data || '',
    created_by: txnData.created_by || 'Staff',
    created_at: new Date().toISOString()
  };
  const { data, error } = await client
    .from('debtor_transactions')
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Update debtor totals
  const { data: deb } = await client.from('debtors').select('total_debit,total_paid').eq('id', txnData.debtor_id).single();
  if (deb) {
    const updates = { updated_at: new Date().toISOString() };
    if (txnData.type === 'debit') updates.total_debit = (parseFloat(deb.total_debit) || 0) + payload.amount;
    if (txnData.type === 'payment') updates.total_paid = (parseFloat(deb.total_paid) || 0) + payload.amount;
    await client.from('debtors').update(updates).eq('id', txnData.debtor_id);
  }
  return data;
};

export const deleteDebtorTransaction = async (txnId, debtorId) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  const { data: txn } = await client.from('debtor_transactions').select('*').eq('id', txnId).single();
  const { error } = await client.from('debtor_transactions').delete().eq('id', txnId);
  if (error) throw new Error(error.message);
  if (txn && debtorId) {
    const { data: deb } = await client.from('debtors').select('total_debit,total_paid').eq('id', debtorId).single();
    if (deb) {
      const updates = { updated_at: new Date().toISOString() };
      if (txn.type === 'debit') updates.total_debit = Math.max(0, (parseFloat(deb.total_debit) || 0) - parseFloat(txn.amount || 0));
      if (txn.type === 'payment') updates.total_paid = Math.max(0, (parseFloat(deb.total_paid) || 0) - parseFloat(txn.amount || 0));
      await client.from('debtors').update(updates).eq('id', debtorId);
    }
  }
};
