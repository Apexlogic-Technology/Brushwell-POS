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
    currency_symbol: parsed.currency_symbol || 'GH₵',
    printer_paper_width: parsed.printer_paper_width || '58mm',
    printer_bluetooth_name: parsed.printer_bluetooth_name || '',
    tax_types: parsed.tax_types,
    tax_enabled_default: parsed.tax_enabled_default || false,
    low_stock_threshold: parsed.low_stock_threshold !== undefined ? parseInt(parsed.low_stock_threshold, 10) : 5,
    gemini_api_key: parsed.gemini_api_key || ''
  };
};

export const saveSettings = (settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
  return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1000000000);
};

export const saveProduct = async (productData) => {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const now = new Date().toISOString();
  const payload = {
    ...productData,
    updated_at: now,
    created_at: productData.created_at || now
  };
  if (!payload.id) payload.id = generateUUID();

  const { data, error } = await client
    .from('products')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
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
    subtotal:        orderPayload.subtotal || 0,
    tax_total:       orderPayload.tax_total ?? orderPayload.tax_amount ?? 0,
    tax_breakdown:   orderPayload.tax_breakdown || [],
    total:           orderPayload.total || 0,
    payment_method:  orderPayload.payment_method || 'Cash',
    split_payments:  orderPayload.split_payments || null,
    amount_tendered: orderPayload.amount_tendered ?? orderPayload.cash_given ?? orderPayload.total ?? 0,
    change_given:    orderPayload.change_given ?? orderPayload.change_due ?? 0,
    customer_name:   orderPayload.customer_name || 'Walk-in Customer',
    customer_phone:  orderPayload.customer_phone || '',
    tax_applied:     orderPayload.tax_applied ?? orderPayload.apply_tax ?? false,
    order_type:      'sale',
    created_at:      orderPayload.created_at || orderPayload.timestamp || new Date().toISOString()
  };

  let { data: order, error: orderError } = await client
    .from('orders')
    .insert(payload)
    .select()
    .single();

  // Fallback: strip columns that might not exist in schema yet, retry
  if (orderError) {
    const msg = orderError.message || '';
    if (msg.includes('customer_name') || msg.includes('customer_phone') || msg.includes('schema cache')) {
      delete payload.customer_name;
      delete payload.customer_phone;
    }
    if (msg.includes('split_payments')) {
      delete payload.split_payments;
    }
    if (msg.includes('customer_name') || msg.includes('split_payments') || msg.includes('schema cache')) {
      const retry = await client.from('orders').insert(payload).select().single();
      order = retry.data;
      orderError = retry.error;
    }
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
