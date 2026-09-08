import React, { useState, useMemo } from 'react';
import {
  BarChart2, TrendingUp, Package, AlertTriangle,
  DollarSign, ShoppingBag, Calendar, Printer,
  BookOpen, Filter, Clock, FileText, ChevronLeft, ChevronRight,
  RotateCcw, FileSpreadsheet, Handshake, CheckCircle2, Check, Search,
  Trash2, X
} from 'lucide-react';
import { 
  fetchOrders, 
  fetchProducts, 
  updateOrderBorrowSettlement, 
  fetchOutboundLoans, 
  updateOutboundLoan,
  deleteOrder 
} from '../services/supabaseService';
import RefundModal from './RefundModal';
import ZReportModal from './ZReportModal';

const DATE_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' }
];

function getDateBounds(rangeKey, customDate) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (rangeKey === 'daily' && customDate) {
    const [y, m, d] = String(customDate).split('-').map(Number);
    const start = new Date(y, (m || 1) - 1, d || 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (rangeKey === 'today') return { start: todayStart, end: now };
  if (rangeKey === 'week') {
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - now.getDay());
    return { start: weekStart, end: now };
  }
  if (rangeKey === 'month') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
  }
  return { start: new Date(0), end: now };
}

export default function Reports({ session, settings }) {
  const currencySymbol = '¢';
  const isRefundOrder = (s) => !s ? false : (s.order_type === 'refund' || Boolean(s.is_refund) || String(s.order_id || '').startsWith('REF-'));
  const [activeReport, setActiveReport] = useState('daily'); // 'daily' | 'sales' | 'inventory' | 'borrowed' | 'outbound'
  const [dateRange, setDateRange] = useState('today');
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [borrowDateRange, setBorrowDateRange] = useState('today');
  const [borrowSupplierFilter, setBorrowSupplierFilter] = useState('all');

  // Sales Summary filter state
  const [salesSearchQuery, setSalesSearchQuery] = useState('');
  const [salesPaymentMethod, setSalesPaymentMethod] = useState('all');

  // Inventory filter state
  const [invSearchQuery, setInvSearchQuery] = useState('');
  const [invStatusFilter, setInvStatusFilter] = useState('all'); // 'all' | 'low' | 'out' | 'good'
  const [invCategoryFilter, setInvCategoryFilter] = useState('all');
  const [invPublisherFilter, setInvPublisherFilter] = useState('all');

  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [isZReportOpen, setIsZReportOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Admin order deletion state
  const isAdmin = session?.role === 'admin';
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);

  const handleConfirmDeleteOrder = async () => {
    if (!deletingOrderId) return;
    setIsDeletingOrder(true);
    try {
      await deleteOrder(deletingOrderId, { restoreStock: true });
      setAllSales(prev => prev.filter(s => s.order_id !== deletingOrderId && String(s.id) !== String(deletingOrderId)));
      setDeletingOrderId(null);
      setRefreshTrigger(t => t + 1);
    } catch (err) {
      alert('Failed to delete order: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeletingOrder(false);
    }
  };

  const [allSales, setAllSales] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [allLoans, setAllLoans] = useState([]);

  const loadReportData = React.useCallback(async () => {
    const [orders, prods, loans] = await Promise.all([
      fetchOrders({ limit: 1000 }),
      fetchProducts(),
      fetchOutboundLoans().catch(() => [])
    ]);
    setAllSales(orders);
    setAllProducts(prods);
    setAllLoans(loans || []);
  }, []);

  React.useEffect(() => { loadReportData(); }, [loadReportData, refreshTrigger]);

  // ── DAILY SALES REPORT ─────────────────────────────────────────────────────
  const dailySales = useMemo(() => {
    const { start, end } = getDateBounds('daily', dailyDate);
    return allSales.filter(s => {
      const d = new Date(s.created_at || s.timestamp);
      return d >= start && d < end;
    });
  }, [allSales, dailyDate, refreshTrigger]);

  const dailyRevenue = dailySales.reduce((sum, s) => sum + (s.total || 0), 0);
  const dailyOrders = dailySales.filter(s => !isRefundOrder(s)).length;
  const dailyItemsSold = dailySales.filter(s => !isRefundOrder(s)).reduce((sum, s) => sum + (s.items || []).reduce((a, i) => a + i.quantity, 0), 0);
  const dailyCash = dailySales.filter(s => s.payment_method === 'Cash').reduce((sum, s) => sum + s.total, 0);
  const dailyCard = dailySales.filter(s => s.payment_method === 'Card').reduce((sum, s) => sum + s.total, 0);
  const dailyMobile = dailySales.filter(s => s.payment_method === 'Mobile Transfer').reduce((sum, s) => sum + s.total, 0);

  // Books breakdown for the day
  const dailyBooksMap = {};
  dailySales.filter(s => !isRefundOrder(s)).forEach(sale => {
    (sale.items || []).forEach(item => {
      if (!dailyBooksMap[item.id]) dailyBooksMap[item.id] = { name: item.product_name, qty: 0, revenue: 0 };
      dailyBooksMap[item.id].qty += item.quantity;
      dailyBooksMap[item.id].revenue += item.price * item.quantity;
    });
  });
  const dailyBooksList = Object.values(dailyBooksMap).sort((a, b) => b.qty - a.qty);

  // Navigate days
  const prevDay = () => {
    const d = new Date(dailyDate);
    d.setDate(d.getDate() - 1);
    setDailyDate(d.toISOString().split('T')[0]);
  };
  const nextDay = () => {
    const today = new Date().toISOString().split('T')[0];
    if (dailyDate >= today) return;
    const d = new Date(dailyDate);
    d.setDate(d.getDate() + 1);
    setDailyDate(d.toISOString().split('T')[0]);
  };

  // ── SALES SUMMARY REPORT ──────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    const { start, end } = getDateBounds(dateRange);
    return allSales.filter(s => {
      const d = new Date(s.created_at || s.timestamp);
      return d >= start && d <= end;
    });
  }, [allSales, dateRange, refreshTrigger]);

  const displayedSales = useMemo(() => {
    return filteredSales.filter(s => {
      if (salesPaymentMethod !== 'all' && s.payment_method !== salesPaymentMethod) return false;
      if (salesSearchQuery.trim()) {
        const q = salesSearchQuery.toLowerCase().trim();
        const orderId = String(s.order_id || '').toLowerCase();
        const cust = (s.customer_name || '').toLowerCase();
        const cashier = (s.cashier_name || '').toLowerCase();
        const itemsStr = (s.items || []).map(i => `${i.product_name || ''} ${i.publisher || ''} ${i.grade || ''}`).join(' ').toLowerCase();
        if (!orderId.includes(q) && !cust.includes(q) && !cashier.includes(q) && !itemsStr.includes(q)) return false;
      }
      return true;
    });
  }, [filteredSales, salesPaymentMethod, salesSearchQuery]);

  const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalOrders = filteredSales.filter(s => !isRefundOrder(s)).length;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalItems = filteredSales.filter(s => !isRefundOrder(s)).reduce((sum, s) => sum + (s.items || []).reduce((a, i) => a + i.quantity, 0), 0);

  const topBooksMap = {};
  filteredSales.filter(s => !isRefundOrder(s)).forEach(sale => {
    (sale.items || []).forEach(item => {
      if (!topBooksMap[item.id]) topBooksMap[item.id] = { name: item.product_name, qty: 0, revenue: 0 };
      topBooksMap[item.id].qty += item.quantity;
      topBooksMap[item.id].revenue += item.price * item.quantity;
    });
  });
  const topBooks = Object.values(topBooksMap).sort((a, b) => b.qty - a.qty).slice(0, 8);

  const paymentMethodMap = {};
  filteredSales.forEach(s => {
    const m = s.payment_method || 'Cash';
    paymentMethodMap[m] = (paymentMethodMap[m] || 0) + (s.total || 0);
  });

  const dailyMap = {};
  filteredSales.forEach(s => {
    const day = new Date(s.created_at || s.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    if (!dailyMap[day]) dailyMap[day] = { orders: 0, revenue: 0 };
    dailyMap[day].orders += 1;
    dailyMap[day].revenue += s.total || 0;
  });
  const dailyBreakdown = Object.entries(dailyMap).slice(-7);
  const maxDailyRev = Math.max(...dailyBreakdown.map(([, v]) => v.revenue), 1);

  // ── INVENTORY REPORT ──────────────────────────────────────────────────────
  const totalStockValue = allProducts.reduce((sum, p) => sum + (parseFloat(p.retail_price) || 0) * (parseInt(p.stock_quantity, 10) || 0), 0);
  const totalWholesaleValue = allProducts.reduce((sum, p) => sum + (parseFloat(p.wholesale_price) || 0) * (parseInt(p.stock_quantity, 10) || 0), 0);
  const potentialProfit = totalStockValue - totalWholesaleValue;
  const lowStock = allProducts.filter(p => (p.stock_quantity || 0) > 0 && (p.stock_quantity || 0) <= 10);
  const outOfStock = allProducts.filter(p => (p.stock_quantity || 0) <= 0);
  const goodStock = allProducts.filter(p => (p.stock_quantity || 0) > 10);

  const catStockMap = {};
  allProducts.forEach(p => {
    const name = (p.category_name || p.grade || p.class_name || 'General').toString().trim();
    if (!catStockMap[name]) catStockMap[name] = { count: 0, value: 0 };
    catStockMap[name].count += (parseInt(p.stock_quantity, 10) || 0);
    catStockMap[name].value += (parseFloat(p.retail_price) || 0) * (parseInt(p.stock_quantity, 10) || 0);
  });
  const catStock = Object.entries(catStockMap).sort((a, b) => b[1].value - a[1].value);
  const maxCatValue = Math.max(...catStock.map(([, v]) => v.value), 1);

  const invPublishers = useMemo(() => {
    const set = new Set();
    allProducts.forEach(p => { if (p && p.publisher && p.publisher.trim()) set.add(p.publisher.trim()); });
    return Array.from(set).sort();
  }, [allProducts]);

  const invCategories = useMemo(() => {
    const set = new Set();
    allProducts.forEach(p => {
      const c = (p.category_name || p.grade || p.class_name || '').toString().trim();
      if (c && c.toLowerCase() !== 'general' && c.toLowerCase() !== 'uncategorized') set.add(c);
    });
    return Array.from(set).sort();
  }, [allProducts]);

  const filteredInventory = useMemo(() => {
    return allProducts.filter(p => {
      if (!p) return false;

      // Status
      if (invStatusFilter === 'low') {
        if ((p.stock_quantity || 0) <= 0 || (p.stock_quantity || 0) > 10) return false;
      } else if (invStatusFilter === 'out') {
        if ((p.stock_quantity || 0) > 0) return false;
      } else if (invStatusFilter === 'good') {
        if ((p.stock_quantity || 0) <= 10) return false;
      }

      // Class / Category
      if (invCategoryFilter !== 'all') {
        const c = (p.category_name || p.grade || p.class_name || '').toString().trim().toLowerCase();
        if (c !== invCategoryFilter.toLowerCase()) return false;
      }

      // Publisher
      if (invPublisherFilter !== 'all') {
        const pub = (p.publisher || '').trim().toLowerCase();
        if (pub !== invPublisherFilter.toLowerCase()) return false;
      }

      // Search Query (combo)
      if (invSearchQuery.trim()) {
        const q = invSearchQuery.toLowerCase().trim();
        const barcodeStr = String(p.barcode || '').toLowerCase();
        if (barcodeStr && barcodeStr.includes(q)) return true;
        const tokens = q.split(/\s+/).filter(Boolean);
        const prodName = (p.product_name || '').toLowerCase();
        const pub = (p.publisher || '').toLowerCase();
        const cat = (p.category_name || p.grade || p.class_name || '').toLowerCase();
        const combined = `${prodName} ${pub} ${cat} ${barcodeStr}`;
        if (!tokens.every(t => combined.includes(t))) return false;
      }

      return true;
    });
  }, [allProducts, invStatusFilter, invCategoryFilter, invPublisherFilter, invSearchQuery]);

  // ── BORROWED BOOKS & SUPPLIER PAYOUTS ────────────────────────────────────
  const borrowedSalesData = useMemo(() => {
    const { start, end } = getDateBounds(borrowDateRange);
    const inRangeOrders = allSales.filter(s => {
      const d = new Date(s.created_at || s.timestamp);
      return d >= start && d < end && !isRefundOrder(s);
    });

    const items = [];
    inRangeOrders.forEach(order => {
      (order.items || []).forEach(item => {
        if (item.is_borrowed) {
          const unitSell = parseFloat(item.price) || 0;
          const unitCost = parseFloat(item.borrow_cost_price) || 0;
          const qty = parseInt(item.quantity, 10) || 1;
          const lineRevenue = unitSell * qty;
          const linePayout = unitCost * qty;
          const lineProfit = Math.max(0, lineRevenue - linePayout);
          const supplier = item.borrow_supplier || 'Neighbor Store';
          const isSettled = item.borrow_settlement_status === 'paid';

          items.push({
            order_id: order.order_id,
            created_at: order.created_at || order.timestamp,
            cashier_name: order.cashier_name || 'Staff',
            product_name: item.product_name,
            grade: item.grade,
            quantity: qty,
            unit_price: unitSell,
            unit_cost: unitCost,
            line_revenue: lineRevenue,
            line_payout: linePayout,
            line_profit: lineProfit,
            supplier: supplier,
            is_settled: isSettled,
            settlement_status: item.borrow_settlement_status || 'unpaid',
            item_id: item.id
          });
        }
      });
    });

    // Group by supplier
    const supplierMap = {};
    items.forEach(item => {
      if (!supplierMap[item.supplier]) {
        supplierMap[item.supplier] = {
          supplier: item.supplier,
          items: [],
          totalQty: 0,
          totalRevenue: 0,
          totalPayout: 0,
          unsettledPayout: 0,
          settledPayout: 0,
          totalProfit: 0
        };
      }
      supplierMap[item.supplier].items.push(item);
      supplierMap[item.supplier].totalQty += item.quantity;
      supplierMap[item.supplier].totalRevenue += item.line_revenue;
      supplierMap[item.supplier].totalPayout += item.line_payout;
      supplierMap[item.supplier].totalProfit += item.line_profit;
      if (item.is_settled) {
        supplierMap[item.supplier].settledPayout += item.line_payout;
      } else {
        supplierMap[item.supplier].unsettledPayout += item.line_payout;
      }
    });

    const supplierList = Object.values(supplierMap);
    const totalBorrowedQty = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalBorrowedRevenue = items.reduce((sum, i) => sum + i.line_revenue, 0);
    const totalBorrowedPayout = items.reduce((sum, i) => sum + i.line_payout, 0);
    const totalUnsettledPayout = items.filter(i => !i.is_settled).reduce((sum, i) => sum + i.line_payout, 0);
    const totalSettledPayout = items.filter(i => i.is_settled).reduce((sum, i) => sum + i.line_payout, 0);
    const totalBorrowedProfit = items.reduce((sum, i) => sum + i.line_profit, 0);

    return {
      items,
      supplierList,
      totalQty: totalBorrowedQty,
      totalRevenue: totalBorrowedRevenue,
      totalPayout: totalBorrowedPayout,
      unsettledPayout: totalUnsettledPayout,
      settledPayout: totalSettledPayout,
      totalProfit: totalBorrowedProfit
    };
  }, [allSales, borrowDateRange]);

  const handleToggleSettlement = async (orderId, itemId, currentStatus) => {
    const nextStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    try {
      await updateOrderBorrowSettlement(orderId, itemId, nextStatus, `Updated by ${session?.name || 'Admin'}`);
      setAllSales(prev => prev.map(order => {
        if (order.order_id === orderId) {
          return {
            ...order,
            items: (order.items || []).map(item => {
              if (item.id === itemId || (item.is_borrowed && item.product_name === itemId)) {
                return { ...item, borrow_settlement_status: nextStatus, borrow_settled_at: nextStatus === 'paid' ? new Date().toISOString() : null };
              }
              return item;
            })
          };
        }
        return order;
      }));
    } catch (err) {
      console.error('Failed to update settlement:', err);
      alert('Failed to update settlement status: ' + (err.message || 'Error'));
    }
  };

  const handlePrint = () => window.print();

  const formattedDailyDate = new Date(dailyDate + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', height: '100%' }}>

      {/* Header & Quick Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart2 size={22} color="var(--primary)" />
            Reports & Closing
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Sales, Inventory, Borrowed Payouts & End-of-Day Till Audit
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button className="btn-danger" onClick={() => setIsRefundOpen(true)} style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}>
            <RotateCcw size={15} /> Process Refund
          </button>
          <button className="btn-primary" onClick={() => setIsZReportOpen(true)} style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}>
            <FileSpreadsheet size={15} /> Z-Report
          </button>
          <button className="btn-secondary" onClick={handlePrint} style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem' }}>
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {/* Report Type Toggle — Sticky Header so tabs are never covered */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 35,
        background: 'var(--bg-app)',
        paddingTop: '0.2rem',
        paddingBottom: '0.4rem'
      }}>
        <div style={{
          display: 'flex',
          gap: '0.35rem',
          background: 'var(--bg-surface-elevated)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-light)',
          overflowX: 'auto',
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)'
        }}>
          {[
            { key: 'daily', label: 'Daily Sales', icon: FileText },
            { key: 'sales', label: 'Sales Summary', icon: TrendingUp },
            { key: 'inventory', label: 'Inventory', icon: Package },
            { key: 'borrowed', label: '🤝 Borrowed In', icon: Handshake },
            { key: 'outbound', label: '📤 Outbound Lent', icon: Package }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeReport === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveReport(tab.key)}
                style={{
                  flex: '1 0 auto',
                  minWidth: '105px',
                  padding: '0.55rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <Icon size={14} />{tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── DAILY SALES REPORT ─────────────────────────────────────────── */}
      {activeReport === 'daily' && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)', padding: '0.4rem 0.6rem'
          }}>
            <button className="btn-icon" style={{ width: '32px', height: '32px' }} onClick={prevDay}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <input
                type="date"
                value={dailyDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setDailyDate(e.target.value)}
                style={{
                  border: 'none', background: 'transparent', fontSize: '0.85rem', fontWeight: 700,
                  color: 'var(--text-main)', textAlign: 'center', cursor: 'pointer', outline: 'none'
                }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formattedDailyDate}</div>
            </div>
            <button className="btn-icon" style={{ width: '32px', height: '32px' }} onClick={nextDay}
              disabled={dailyDate >= new Date().toISOString().split('T')[0]}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <MetricCard icon={<DollarSign size={16} color="var(--accent-emerald)" />} bg="var(--accent-emerald-light)" label="Total Sales" value={`${currencySymbol}${dailyRevenue.toFixed(2)}`} sub={`${dailyOrders} orders`} valueColor="var(--accent-emerald)" />
            <MetricCard icon={<BookOpen size={16} color="var(--primary)" />} bg="var(--primary-light)" label="Books Sold" value={dailyItemsSold} sub="total copies" valueColor="var(--primary)" />
            <MetricCard icon={<DollarSign size={16} color="var(--accent-amber)" />} bg="var(--accent-amber-light)" label="Cash Received" value={`${currencySymbol}${dailyCash.toFixed(2)}`} sub="cash payments" valueColor="var(--accent-amber)" />
            <MetricCard icon={<ShoppingBag size={16} color="var(--accent-purple)" />} bg="hsla(265,83%,58%,0.12)" label="Card / Mobile" value={`${currencySymbol}${(dailyCard + dailyMobile).toFixed(2)}`} sub="non-cash payments" valueColor="var(--accent-purple)" />
          </div>

          {dailyOrders > 0 && (
            <div className="card-glass" style={{ padding: '0.9rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.6rem' }}>Payment Method Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {[
                  { method: 'Cash', amount: dailyCash, color: 'var(--accent-emerald)' },
                  { method: 'Card', amount: dailyCard, color: 'var(--primary)' },
                  { method: 'Mobile Transfer', amount: dailyMobile, color: 'var(--accent-purple)' }
                ].map(row => (
                  <div key={row.method} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600, width: '110px', flexShrink: 0 }}>{row.method}</span>
                    <div style={{ flex: 1, height: '8px', background: 'var(--border-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                      <div style={{
                        width: dailyRevenue > 0 ? `${Math.max(0, (row.amount / dailyRevenue) * 100)}%` : '0%',
                        height: '100%', background: row.color, borderRadius: 'var(--radius-full)',
                        transition: 'width 0.5s ease'
                      }} />
                    </div>
                    <span style={{ fontWeight: 800, color: row.color, width: '75px', textAlign: 'right', flexShrink: 0 }}>
                      {currencySymbol}{row.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dailySales.length > 0 && (
            <div className="card-glass" style={{ padding: '0.9rem', marginBottom: '2.5rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>All Transactions — {dailySales.length} record{dailySales.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '480px', overflowY: 'auto', paddingBottom: '2.5rem', paddingRight: '4px' }}>
                {dailySales.map((sale, i) => {
                  const isRefund = isRefundOrder(sale);
                  return (
                    <div key={i} style={{
                      background: isRefund ? 'var(--accent-rose-light)' : 'var(--bg-surface-elevated)',
                      border: `1px solid ${isRefund ? 'var(--accent-rose)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-md)', padding: '0.65rem 0.8rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>#{sale.order_id}</span>
                          {isRefund && (
                            <span style={{
                              fontSize: '0.7rem', padding: '0.1rem 0.45rem',
                              borderRadius: 'var(--radius-full)', fontWeight: 700,
                              background: 'var(--accent-rose)', color: '#fff'
                            }}>REFUND</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '1rem', color: isRefund ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                            {currencySymbol}{Number(sale.total || 0).toFixed(2)}
                          </span>
                        {isAdmin && (
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => setDeletingOrderId(sale.order_id)}
                            title="Delete Order (Admin Only)"
                            style={{ width: '28px', height: '28px', color: 'var(--accent-rose)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>🕐 {new Date(sale.timestamp).toLocaleTimeString()}</span>
                      <span>💳 {sale.payment_method}</span>
                      <span>👤 {sale.cashier_name || 'Cashier'}</span>
                      {sale.items && sale.items.length > 0 && (
                        <span>📚 {sale.items.length} item{sale.items.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SALES SUMMARY REPORT ────────────────────────────────────────── */}
      {activeReport === 'sales' && (
        <>
          {/* Controls: Date Range, Payment Method & Search */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {DATE_RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setDateRange(r.key)}
                  className="btn-secondary"
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.74rem',
                    borderRadius: 'var(--radius-sm)',
                    background: dateRange === r.key ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                    color: dateRange === r.key ? '#fff' : 'var(--text-muted)',
                    borderColor: dateRange === r.key ? 'var(--primary)' : 'var(--border-light)',
                    fontWeight: dateRange === r.key ? 700 : 500
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              {/* Payment Method Filter */}
              <select
                className="form-control"
                value={salesPaymentMethod}
                onChange={e => setSalesPaymentMethod(e.target.value)}
                style={{ padding: '0.28rem 0.55rem', fontSize: '0.74rem', width: 'auto' }}
              >
                <option value="all">All Payments</option>
                <option value="Cash">Cash Only</option>
                <option value="Card">Card Only</option>
                <option value="Mobile Transfer">Mobile Money</option>
              </select>

              {/* Search Orders Input */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', color: 'var(--text-subtle)' }} />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search order #, customer, book..."
                  value={salesSearchQuery}
                  onChange={e => setSalesSearchQuery(e.target.value)}
                  style={{ paddingLeft: '1.8rem', paddingRight: '0.6rem', fontSize: '0.74rem', width: '200px' }}
                />
              </div>
            </div>
          </div>

          {/* Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem' }}>
            <MetricCard
              icon={<DollarSign size={18} color="var(--accent-emerald)" />}
              bg="var(--accent-emerald-light)"
              label="Total Revenue"
              value={`${currencySymbol}${totalRevenue.toFixed(2)}`}
              sub={`${totalOrders} completed orders`}
              valueColor="var(--accent-emerald)"
            />
            <MetricCard
              icon={<ShoppingBag size={18} color="var(--primary)" />}
              bg="var(--primary-light)"
              label="Total Orders"
              value={totalOrders}
              sub={`Avg: ${currencySymbol}${avgOrder.toFixed(2)} / order`}
              valueColor="var(--primary)"
            />
            <MetricCard
              icon={<BookOpen size={18} color="var(--accent-purple)" />}
              bg="hsla(265,83%,58%,0.12)"
              label="Books Sold"
              value={totalItems}
              sub="total copies sold"
              valueColor="var(--accent-purple)"
            />
            <MetricCard
              icon={<TrendingUp size={18} color="var(--accent-amber)" />}
              bg="var(--accent-amber-light)"
              label="Average Order"
              value={`${currencySymbol}${avgOrder.toFixed(2)}`}
              sub="basket size"
              valueColor="var(--accent-amber)"
            />
          </div>

          {/* Payment Method Breakdown & Top Books Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.8rem' }}>
            {/* Payment Methods */}
            <div className="card-glass" style={{ padding: '0.9rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.65rem' }}>
                Payment Methods Distribution
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[
                  { method: 'Cash', color: 'var(--accent-emerald)' },
                  { method: 'Card', color: 'var(--primary)' },
                  { method: 'Mobile Transfer', color: 'var(--accent-purple)' }
                ].map(row => {
                  const amt = paymentMethodMap[row.method] || 0;
                  const pct = totalRevenue > 0 ? (amt / totalRevenue) * 100 : 0;
                  return (
                    <div key={row.method} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600, width: '95px', flexShrink: 0 }}>{row.method}</span>
                      <div style={{ flex: 1, height: '8px', background: 'var(--border-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: row.color, borderRadius: 'var(--radius-full)', transition: 'width 0.5s' }} />
                      </div>
                      <span style={{ fontWeight: 800, color: row.color, width: '80px', textAlign: 'right', flexShrink: 0 }}>
                        {currencySymbol}{amt.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Selling Books */}
            <div className="card-glass" style={{ padding: '0.9rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.65rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>Top Selling Titles</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>by volume</span>
              </div>
              {topBooks.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>No sales recorded in this period</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {topBooks.map((b, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', padding: '0.25rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden' }}>
                        <span style={{ fontWeight: 800, color: 'var(--primary)', width: '16px', flexShrink: 0 }}>#{idx + 1}</span>
                        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', flexShrink: 0 }}>
                        <span style={{ fontWeight: 700 }}>{b.qty} sold</span>
                        <span style={{ fontWeight: 800, color: 'var(--accent-emerald)' }}>{currencySymbol}{b.revenue.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Orders History Table */}
          <div className="card-glass" style={{ padding: '0.9rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Sales Orders & Transactions ({displayedSales.length})</span>
              {displayedSales.length !== filteredSales.length && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Filtered from {filteredSales.length} orders</span>
              )}
            </div>
            {displayedSales.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No orders match your filter criteria.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '450px', paddingBottom: '2rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '0.35rem 0.5rem' }}>Order #</th>
                      <th style={{ padding: '0.35rem 0.5rem' }}>Date & Time</th>
                      <th style={{ padding: '0.35rem 0.5rem' }}>Customer / Staff</th>
                      <th style={{ padding: '0.35rem 0.5rem' }}>Items</th>
                      <th style={{ padding: '0.35rem 0.5rem' }}>Method</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Total</th>
                      {isAdmin && <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSales.map((sale, i) => {
                      const isRefund = isRefundOrder(sale);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', background: isRefund ? 'var(--accent-rose-light)' : 'transparent' }}>
                          <td style={{ padding: '0.45rem 0.5rem', fontWeight: 700 }}>
                            #{sale.order_id}
                            {isRefund && (
                              <span style={{ marginLeft: '0.35rem', fontSize: '0.62rem', padding: '0.05rem 0.35rem', borderRadius: '999px', background: 'var(--accent-rose)', color: '#fff', fontWeight: 800 }}>REFUND</span>
                            )}
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                            {new Date(sale.created_at || sale.timestamp).toLocaleDateString()} {new Date(sale.created_at || sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem' }}>
                            <div style={{ fontWeight: 600 }}>{sale.customer_name || 'Walk-in Customer'}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Staff: {sale.cashier_name || 'Cashier'}</div>
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem' }}>
                            <div style={{ fontSize: '0.72rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {(sale.items || []).map(it => `${it.quantity}x ${it.product_name}`).join(', ')}
                            </div>
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem' }}>
                            <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-light)', fontWeight: 600 }}>
                              {sale.payment_method || 'Cash'}
                            </span>
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, fontSize: '0.85rem', color: isRefund ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                            {currencySymbol}{(sale.total || 0).toFixed(2)}
                          </td>
                        {isAdmin && (
                          <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => setDeletingOrderId(sale.order_id)}
                              title="Delete Order (Admin Only)"
                              style={{ width: '26px', height: '26px', color: 'var(--accent-rose)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── INVENTORY REPORT ─────────────────────────────────────────────── */}
      {activeReport === 'inventory' && (
        <>
          {/* Controls: Stock Status Chips, Grade/Publisher Dropdowns & Search */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '2px' }}>
              <button
                type="button"
                className={`chip-pill ${invStatusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setInvStatusFilter('all')}
                style={{ fontSize: '0.74rem', padding: '0.3rem 0.65rem' }}
              >
                📦 All Books ({allProducts.length})
              </button>
              <button
                type="button"
                className={`chip-pill ${invStatusFilter === 'good' ? 'active' : ''}`}
                onClick={() => setInvStatusFilter(invStatusFilter === 'good' ? 'all' : 'good')}
                style={{ fontSize: '0.74rem', padding: '0.3rem 0.65rem' }}
              >
                🟢 Healthy Stock ({goodStock.length})
              </button>
              <button
                type="button"
                className={`chip-pill ${invStatusFilter === 'low' ? 'active' : ''}`}
                onClick={() => setInvStatusFilter(invStatusFilter === 'low' ? 'all' : 'low')}
                style={{ fontSize: '0.74rem', padding: '0.3rem 0.65rem' }}
              >
                ⚠️ Low Stock ({lowStock.length})
              </button>
              <button
                type="button"
                className={`chip-pill ${invStatusFilter === 'out' ? 'active' : ''}`}
                onClick={() => setInvStatusFilter(invStatusFilter === 'out' ? 'all' : 'out')}
                style={{ fontSize: '0.74rem', padding: '0.3rem 0.65rem' }}
              >
                🔴 Out of Stock ({outOfStock.length})
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Class / Category Dropdown */}
              <select
                className="form-control"
                value={invCategoryFilter}
                onChange={e => setInvCategoryFilter(e.target.value)}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.76rem', minWidth: '130px', width: 'auto' }}
              >
                <option value="all">📚 All Classes / Categories ({invCategories.length})</option>
                {invCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Publisher Dropdown */}
              <select
                className="form-control"
                value={invPublisherFilter}
                onChange={e => setInvPublisherFilter(e.target.value)}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.76rem', minWidth: '130px', width: 'auto' }}
              >
                <option value="all">🏢 All Publishers ({invPublishers.length})</option>
                {invPublishers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              {/* Combo Search Input */}
              <div style={{ position: 'relative', flex: '1 1 200px', display: 'flex', alignItems: 'center' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', color: 'var(--text-subtle)' }} />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search combo (title, class, publisher, ISBN)..."
                  value={invSearchQuery}
                  onChange={e => setInvSearchQuery(e.target.value)}
                  style={{ width: '100%', paddingLeft: '2rem', fontSize: '0.78rem' }}
                />
              </div>

              {(invCategoryFilter !== 'all' || invPublisherFilter !== 'all' || invStatusFilter !== 'all' || invSearchQuery) && (
                <button
                  type="button"
                  onClick={() => { setInvCategoryFilter('all'); setInvPublisherFilter('all'); setInvStatusFilter('all'); setInvSearchQuery(''); }}
                  style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-sm)', background: 'var(--accent-rose-light)', color: 'var(--accent-rose)', border: '1px solid var(--accent-rose)', cursor: 'pointer' }}
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>

          {/* Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem' }}>
            <MetricCard
              icon={<DollarSign size={18} color="var(--accent-emerald)" />}
              bg="var(--accent-emerald-light)"
              label="Retail Inventory Value"
              value={`${currencySymbol}${totalStockValue.toFixed(2)}`}
              sub="Potential gross earnings"
              valueColor="var(--accent-emerald)"
            />
            <MetricCard
              icon={<Package size={18} color="var(--primary)" />}
              bg="var(--primary-light)"
              label="Wholesale Cost Value"
              value={`${currencySymbol}${totalWholesaleValue.toFixed(2)}`}
              sub="Store purchase investment"
              valueColor="var(--primary)"
            />
            <MetricCard
              icon={<TrendingUp size={18} color="var(--accent-purple)" />}
              bg="hsla(265,83%,58%,0.12)"
              label="Projected Gross Profit"
              value={`${currencySymbol}${potentialProfit.toFixed(2)}`}
              sub={`${totalStockValue > 0 ? ((potentialProfit / totalStockValue) * 100).toFixed(1) : 0}% potential margin`}
              valueColor="var(--accent-purple)"
            />
            <MetricCard
              icon={<AlertTriangle size={18} color="var(--accent-rose)" />}
              bg="var(--accent-rose-light)"
              label="Items to Reorder"
              value={lowStock.length + outOfStock.length}
              sub={`${lowStock.length} low · ${outOfStock.length} out of stock`}
              valueColor="var(--accent-rose)"
            />
          </div>

          {/* Inventory Table */}
          <div className="card-glass" style={{ padding: '0.9rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Inventory Stock List ({filteredInventory.length} titles)</span>
              {filteredInventory.length !== allProducts.length && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Filtered from {allProducts.length} total</span>
              )}
            </div>
            {filteredInventory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No books match your filter criteria.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '0.35rem 0.5rem' }}>Book Title & Publisher</th>
                      <th style={{ padding: '0.35rem 0.5rem' }}>Class / Subject</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Stock Level</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Retail Price</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Cost Price</th>
                      <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map(prod => {
                      const qty = parseInt(prod.stock_quantity, 10) || 0;
                      const rPrice = parseFloat(prod.retail_price) || 0;
                      const wPrice = parseFloat(prod.wholesale_price) || 0;
                      const lineVal = rPrice * qty;
                      const isLow = qty > 0 && qty <= 10;
                      const isOut = qty <= 0;

                      return (
                        <tr key={prod.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: isOut ? 'rgba(239, 68, 68, 0.04)' : isLow ? 'rgba(245, 158, 11, 0.04)' : 'transparent' }}>
                          <td style={{ padding: '0.45rem 0.5rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{prod.product_name}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              {prod.publisher && <span>🏢 {prod.publisher} • </span>}
                              {prod.barcode && <span>ISBN: {prod.barcode}</span>}
                            </div>
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem' }}>
                            <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700 }}>
                              {prod.category_name || prod.grade || prod.class_name || 'General'}
                            </span>
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              padding: '0.12rem 0.45rem',
                              borderRadius: 'var(--radius-full)',
                              background: isOut ? 'var(--accent-rose-light)' : isLow ? 'var(--accent-amber-light)' : 'var(--accent-emerald-light)',
                              color: isOut ? 'var(--accent-rose)' : isLow ? 'hsl(35, 90%, 25%)' : 'var(--accent-emerald)'
                            }}>
                              {qty} in stock {isOut ? '(Out)' : isLow ? '(Low)' : ''}
                            </span>
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                            {currencySymbol}{rPrice.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                            {currencySymbol}{wPrice.toFixed(2)}
                          </td>
                          <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                            {currencySymbol}{lineVal.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── BORROWED BOOKS & SUPPLIER PAYOUTS REPORT ─────────────────────── */}
      {activeReport === 'borrowed' && (
        <>
          {/* Controls: Date Range Filter & Supplier Filter */}
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {DATE_RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setBorrowDateRange(r.key)}
                  className="btn-secondary"
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.74rem',
                    borderRadius: 'var(--radius-sm)',
                    background: borrowDateRange === r.key ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                    color: borrowDateRange === r.key ? '#fff' : 'var(--text-muted)',
                    borderColor: borrowDateRange === r.key ? 'var(--primary)' : 'var(--border-light)'
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              {/* Supplier Filter Dropdown - ALWAYS VISIBLE */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Filter Lender:</span>
                <select
                  className="form-control"
                  value={borrowSupplierFilter}
                  onChange={e => setBorrowSupplierFilter(e.target.value)}
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.74rem', width: 'auto' }}
                >
                  <option value="all">All Lenders / Suppliers ({borrowedSalesData.supplierList.length})</option>
                  {borrowedSalesData.supplierList.map(s => (
                    <option key={s.supplier} value={s.supplier}>{s.supplier}</option>
                  ))}
                </select>
              </div>

              {/* Print Debt Sheet button */}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => window.print()}
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                title="Print supplier debt sheet"
              >
                <Printer size={13} /> Print Debt Sheet
              </button>
            </div>
          </div>

          {/* Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem' }}>
            <MetricCard
              icon={<Handshake size={18} color="var(--accent-amber)" />}
              bg="var(--accent-amber-light)"
              label="Borrowed Books Sold"
              value={borrowedSalesData.totalQty}
              sub={`${borrowedSalesData.items.length} line transactions`}
              valueColor="var(--text-main)"
            />
            <MetricCard
              icon={<DollarSign size={18} color="var(--primary)" />}
              bg="var(--primary-light)"
              label="Customer Sales Total"
              value={`${currencySymbol}${borrowedSalesData.totalRevenue.toFixed(2)}`}
              sub="Gross collected from buyers"
              valueColor="var(--primary)"
            />
            <MetricCard
              icon={<AlertTriangle size={18} color="var(--accent-rose)" />}
              bg="var(--accent-rose-light)"
              label="Supplier Payouts Due"
              value={`${currencySymbol}${borrowedSalesData.unsettledPayout.toFixed(2)}`}
              sub={`Total due: ${currencySymbol}${borrowedSalesData.totalPayout.toFixed(2)} (${currencySymbol}${borrowedSalesData.settledPayout.toFixed(2)} paid)`}
              valueColor="var(--accent-rose)"
            />
            <MetricCard
              icon={<TrendingUp size={18} color="var(--accent-emerald)" />}
              bg="var(--accent-emerald-light)"
              label="Shop Net Profit / Cut"
              value={`${currencySymbol}${borrowedSalesData.totalProfit.toFixed(2)}`}
              sub="Retained by your bookstore"
              valueColor="var(--accent-emerald)"
            />
          </div>

          {/* Suppliers Breakdown */}
          {borrowedSalesData.items.length === 0 ? (
            <div className="card-glass" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <Handshake size={36} color="var(--text-subtle)" style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>No Borrowed Books Sold for this period</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                When you sell borrowed or third-party sourced books, they will appear here with automatic supplier debt calculations.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {borrowedSalesData.supplierList
                .filter(s => borrowSupplierFilter === 'all' || s.supplier === borrowSupplierFilter)
                .map(sup => {
                  const allPaid = sup.unsettledPayout === 0;
                  return (
                    <div key={sup.supplier} className="card-glass" style={{ padding: '0.85rem' }}>
                      
                      {/* Supplier Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            background: allPaid ? 'var(--accent-emerald-light)' : 'var(--accent-amber-light)',
                            color: allPaid ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                            padding: '0.35rem',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex'
                          }}>
                            <Handshake size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                              {sup.supplier}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {sup.totalQty} book{sup.totalQty > 1 ? 's' : ''} sold • Sales: {currencySymbol}{sup.totalRevenue.toFixed(2)} • Shop Profit: +{currencySymbol}{sup.totalProfit.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Payout Owed to Lender
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: allPaid ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                              {currencySymbol}{sup.unsettledPayout.toFixed(2)} {allPaid && <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>(Settled)</span>}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Items Table */}
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', textAlign: 'left' }}>
                              <th style={{ padding: '0.35rem 0.5rem' }}>Book Title & Grade</th>
                              <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Qty</th>
                              <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Selling Price</th>
                              <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Borrow Cost</th>
                              <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Total Owed</th>
                              <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Shop Profit</th>
                              <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Date & Order</th>
                              <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Settlement</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sup.items.map((it, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)', background: it.is_settled ? 'transparent' : 'rgba(245, 158, 11, 0.04)' }}>
                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>
                                  {it.product_name}
                                  {it.grade && (
                                    <span style={{
                                      marginLeft: '0.35rem',
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      padding: '0.05rem 0.3rem',
                                      borderRadius: 'var(--radius-sm)',
                                      background: 'var(--accent-purple)',
                                      color: '#fff'
                                    }}>
                                      {it.grade}
                                    </span>
                                  )}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 700 }}>
                                  {it.quantity}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                  {currencySymbol}{it.unit_price.toFixed(2)}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                                  {currencySymbol}{it.unit_cost.toFixed(2)}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--accent-rose)' }}>
                                  {currencySymbol}{it.line_payout.toFixed(2)}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                                  +{currencySymbol}{it.line_profit.toFixed(2)}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  <div>#{it.order_id}</div>
                                  <div>{new Date(it.created_at).toLocaleDateString()} {new Date(it.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                  {it.is_settled ? (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                      <span style={{
                                        padding: '0.18rem 0.45rem',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        borderRadius: 'var(--radius-sm)',
                                        background: 'var(--accent-emerald)',
                                        color: '#fff',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.2rem'
                                      }}>
                                        <Check size={11} /> Paid
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSettlement(it.order_id, it.item_id, it.settlement_status)}
                                        title="Undo / Revert settlement back to unpaid"
                                        style={{
                                          padding: '0.18rem 0.35rem',
                                          fontSize: '0.65rem',
                                          fontWeight: 600,
                                          borderRadius: 'var(--radius-sm)',
                                          border: '1px solid var(--border-light)',
                                          background: 'var(--bg-surface)',
                                          color: 'var(--text-muted)',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        ↩ Revert
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleSettlement(it.order_id, it.item_id, it.settlement_status)}
                                      style={{
                                        padding: '0.2rem 0.55rem',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        borderRadius: 'var(--radius-sm)',
                                        cursor: 'pointer',
                                        border: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        background: 'var(--accent-amber)',
                                        color: '#fff'
                                      }}
                                    >
                                      <Clock size={11} /> Mark Paid
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  );
                })}
            </div>
          )}
        </>
      )}

      {/* ── OUTBOUND LOANS REPORT ────────────────────────────────────────── */}
      {activeReport === 'outbound' && (() => {
        // currencySymbol defined at component level
        const outstandingLoans = allLoans.filter(l => l.status === 'outstanding');
        const returnedLoans = allLoans.filter(l => l.status === 'returned');
        const paidLoans = allLoans.filter(l => l.status === 'paid');

        const totalOutCopies = outstandingLoans.reduce((s, l) => s + (parseInt(l.quantity, 10) || 0), 0);
        const totalOutOwed = outstandingLoans.reduce((s, l) => s + (parseFloat(l.total_owed) || 0), 0);
        const totalSettledOwed = paidLoans.reduce((s, l) => s + (parseFloat(l.total_owed) || 0), 0);

        // Group outstanding by borrower shop
        const shopMap = {};
        allLoans.forEach(loan => {
          const shop = loan.borrower_name || 'Unknown Shop';
          if (!shopMap[shop]) {
            shopMap[shop] = {
              name: shop,
              phone: loan.borrower_phone || '',
              loans: [],
              outstandingQty: 0,
              outstandingOwed: 0,
              paidOwed: 0
            };
          }
          shopMap[shop].loans.push(loan);
          if (loan.status === 'outstanding') {
            shopMap[shop].outstandingQty += parseInt(loan.quantity, 10) || 0;
            shopMap[shop].outstandingOwed += parseFloat(loan.total_owed) || 0;
          } else if (loan.status === 'paid') {
            shopMap[shop].paidOwed += parseFloat(loan.total_owed) || 0;
          }
        });

        const shopList = Object.values(shopMap);

        const handleQuickLoanStatus = async (loanId, newStatus) => {
          try {
            await updateOutboundLoan(loanId, {
              status: newStatus,
              settled_at: (newStatus === 'returned' || newStatus === 'paid') ? new Date().toISOString() : null
            });
            setAllLoans(prev => prev.map(l => l.id === loanId ? {
              ...l,
              status: newStatus,
              settled_at: (newStatus === 'returned' || newStatus === 'paid') ? new Date().toISOString() : null
            } : l));
          } catch (err) {
            alert('Failed to update: ' + err.message);
          }
        };

        return (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem' }}>
              <MetricCard
                icon={<Package size={18} color="var(--accent-amber)" />}
                bg="var(--accent-amber-light)"
                label="Books Lent to Others"
                value={totalOutCopies}
                sub={`${outstandingLoans.length} active loan records`}
                valueColor="var(--text-main)"
              />
              <MetricCard
                icon={<AlertTriangle size={18} color="var(--accent-rose)" />}
                bg="var(--accent-rose-light)"
                label="Debt Owed to Brushwell"
                value={`${currencySymbol}${totalOutOwed.toFixed(2)}`}
                sub="Outstanding balance other shops owe"
                valueColor="var(--accent-rose)"
              />
              <MetricCard
                icon={<CheckCircle2 size={18} color="var(--accent-emerald)" />}
                bg="var(--accent-emerald-light)"
                label="Cash Collected"
                value={`${currencySymbol}${totalSettledOwed.toFixed(2)}`}
                sub={`${paidLoans.length} loans marked paid`}
                valueColor="var(--accent-emerald)"
              />
              <MetricCard
                icon={<RotateCcw size={18} color="var(--primary)" />}
                bg="var(--primary-light)"
                label="Returned Unsold"
                value={returnedLoans.reduce((s, l) => s + (parseInt(l.quantity, 10) || 0), 0)}
                sub={`${returnedLoans.length} loans returned`}
                valueColor="var(--primary)"
              />
            </div>

            {/* Shop-by-Shop Debts */}
            {shopList.length === 0 ? (
              <div className="card-glass" style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                <Package size={36} color="var(--text-subtle)" style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>No Outbound Loans recorded yet</div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                  When other bookshops borrow stock from Brushwell, record it using the "Outbound Loans" button to track debts.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {shopList.map(shop => (
                  <div key={shop.name} className="card-glass" style={{ padding: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          background: shop.outstandingOwed > 0 ? 'var(--accent-amber-light)' : 'var(--accent-emerald-light)',
                          color: shop.outstandingOwed > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                          padding: '0.35rem',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex'
                        }}>
                          <Package size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                            {shop.name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {shop.phone && `📞 ${shop.phone} • `}{shop.loans.length} transaction{shop.loans.length !== 1 ? 's' : ''} ({shop.outstandingQty} copies currently out)
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Current Debt Owed to You
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: shop.outstandingOwed > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                          {currencySymbol}{shop.outstandingOwed.toFixed(2)} {shop.outstandingOwed === 0 && <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>(Settled)</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', textAlign: 'left' }}>
                            <th style={{ padding: '0.35rem 0.5rem' }}>Book Title & Grade</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Qty</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Price/Copy</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Total Owed</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Date Lent</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Status</th>
                            <th style={{ padding: '0.35rem 0.5rem', textAlign: 'center' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shop.loans.map(loan => {
                            const isOut = loan.status === 'outstanding';
                            const isPaid = loan.status === 'paid';
                            return (
                              <tr key={loan.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: isOut ? 'rgba(245, 158, 11, 0.04)' : 'transparent' }}>
                                <td style={{ padding: '0.45rem 0.5rem', fontWeight: 600 }}>
                                  {loan.product_name}
                                  {loan.grade && (
                                    <span style={{
                                      marginLeft: '0.35rem',
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      padding: '0.05rem 0.3rem',
                                      borderRadius: 'var(--radius-sm)',
                                      background: 'var(--accent-purple)',
                                      color: '#fff'
                                    }}>
                                      {loan.grade}
                                    </span>
                                  )}
                                  {loan.notes && <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>"{loan.notes}"</div>}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontWeight: 700 }}>
                                  {loan.quantity}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                  {currencySymbol}{parseFloat(loan.unit_price || 0).toFixed(2)}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontWeight: 800, color: isOut ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                                  {currencySymbol}{parseFloat(loan.total_owed || 0).toFixed(2)}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  {new Date(loan.loaned_at || loan.created_at).toLocaleDateString()}
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                  <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: 'var(--radius-full)',
                                    background: isOut ? 'var(--accent-amber-light)' : isPaid ? 'var(--accent-emerald-light)' : 'var(--primary-light)',
                                    color: isOut ? 'hsl(35,90%,22%)' : isPaid ? 'var(--accent-emerald)' : 'var(--primary)'
                                  }}>
                                    {loan.status}
                                  </span>
                                </td>
                                <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>
                                  {isOut ? (
                                    <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleQuickLoanStatus(loan.id, 'paid')}
                                        style={{ padding: '0.18rem 0.4rem', fontSize: '0.65rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--accent-emerald)', color: '#fff', cursor: 'pointer' }}
                                      >
                                        ✔ Paid
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleQuickLoanStatus(loan.id, 'returned')}
                                        style={{ padding: '0.18rem 0.4rem', fontSize: '0.65rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}
                                      >
                                        ↩ Return
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleQuickLoanStatus(loan.id, 'outstanding')}
                                      style={{ padding: '0.18rem 0.35rem', fontSize: '0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                      ↩ Revert
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* Modals */}
      <RefundModal
        isOpen={isRefundOpen}
        onClose={() => setIsRefundOpen(false)}
        onRefundSuccess={() => setRefreshTrigger(t => t + 1)}
        settings={settings}
      />

      <ZReportModal
        isOpen={isZReportOpen}
        onClose={() => setIsZReportOpen(false)}
        settings={settings || { store_name: 'Brushwell Books' }}
        session={session}
      />

      {/* Admin Order Delete Confirmation Modal */}
      {deletingOrderId && (
        <div className="modal-overlay" onClick={() => !isDeletingOrder && setDeletingOrderId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-rose)' }}>
                <AlertTriangle size={20} />
                <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Confirm Order Deletion</h3>
              </div>
              <button type="button" className="btn-icon" onClick={() => !isDeletingOrder && setDeletingOrderId(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
              Are you sure you want to permanently delete order <b>#{deletingOrderId}</b>?
              <div style={{ marginTop: '0.65rem', padding: '0.5rem 0.75rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                • Record will be deleted from Supabase database.<br />
                • Sold item quantities will be restored back into stock.<br />
                • Financial totals and audit logs will immediately recalculate.
              </div>
            </div>
            <div className="modal-footer" style={{ gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeletingOrderId(null)}
                disabled={isDeletingOrder}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmDeleteOrder}
                disabled={isDeletingOrder}
                style={{ background: 'var(--accent-rose)', color: '#fff' }}
              >
                {isDeletingOrder ? 'Deleting...' : 'Yes, Delete Order'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function MetricCard({ icon, bg, label, value, sub, valueColor }) {
  return (
    <div className="card-glass" style={{ padding: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ background: bg, padding: '0.3rem', borderRadius: 'var(--radius-sm)', display: 'flex' }}>{icon}</div>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: valueColor }}>{value}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>{sub}</div>
    </div>
  );
}
