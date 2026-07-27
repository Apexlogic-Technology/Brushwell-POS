import React, { useState, useMemo } from 'react';
import {
  BarChart2, TrendingUp, Package, AlertTriangle,
  DollarSign, ShoppingBag, Calendar, Printer,
  BookOpen, Filter, Clock, FileText, ChevronLeft, ChevronRight,
  RotateCcw, FileSpreadsheet
} from 'lucide-react';
import { getSalesHistory, getLocalProducts } from '../services/n8nService';
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
    const d = new Date(customDate);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
  const [activeReport, setActiveReport] = useState('daily'); // 'daily' | 'sales' | 'inventory'
  const [dateRange, setDateRange] = useState('today');
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);

  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [isZReportOpen, setIsZReportOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const allSales = getSalesHistory();
  const allProducts = getLocalProducts();

  // ── DAILY SALES REPORT ─────────────────────────────────────────────────────
  const dailySales = useMemo(() => {
    const { start, end } = getDateBounds('daily', dailyDate);
    return allSales.filter(s => {
      const d = new Date(s.timestamp);
      return d >= start && d < end;
    });
  }, [allSales, dailyDate, refreshTrigger]);

  const dailyRevenue = dailySales.reduce((sum, s) => sum + (s.total || 0), 0);
  const dailyOrders = dailySales.filter(s => !s.is_refund).length;
  const dailyItemsSold = dailySales.filter(s => !s.is_refund).reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0), 0);
  const dailyCash = dailySales.filter(s => s.payment_method === 'Cash').reduce((sum, s) => sum + s.total, 0);
  const dailyCard = dailySales.filter(s => s.payment_method === 'Card').reduce((sum, s) => sum + s.total, 0);
  const dailyMobile = dailySales.filter(s => s.payment_method === 'Mobile Transfer').reduce((sum, s) => sum + s.total, 0);

  // Books breakdown for the day
  const dailyBooksMap = {};
  dailySales.filter(s => !s.is_refund).forEach(sale => {
    sale.items.forEach(item => {
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
    return allSales.filter(s => new Date(s.timestamp) >= start && new Date(s.timestamp) <= end);
  }, [allSales, dateRange, refreshTrigger]);

  const totalRevenue = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalOrders = filteredSales.filter(s => !s.is_refund).length;
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalItems = filteredSales.filter(s => !s.is_refund).reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0), 0);

  const topBooksMap = {};
  filteredSales.filter(s => !s.is_refund).forEach(sale => {
    sale.items.forEach(item => {
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
    const day = new Date(s.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    if (!dailyMap[day]) dailyMap[day] = { orders: 0, revenue: 0 };
    dailyMap[day].orders += 1;
    dailyMap[day].revenue += s.total || 0;
  });
  const dailyBreakdown = Object.entries(dailyMap).slice(-7);
  const maxDailyRev = Math.max(...dailyBreakdown.map(([, v]) => v.revenue), 1);

  // ── INVENTORY REPORT ──────────────────────────────────────────────────────
  const totalStockValue = allProducts.reduce((sum, p) => sum + p.retail_price * p.stock_quantity, 0);
  const totalWholesaleValue = allProducts.reduce((sum, p) => sum + (p.wholesale_price || 0) * p.stock_quantity, 0);
  const potentialProfit = totalStockValue - totalWholesaleValue;
  const lowStock = allProducts.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 10);
  const outOfStock = allProducts.filter(p => p.stock_quantity <= 0);
  const goodStock = allProducts.filter(p => p.stock_quantity > 10);

  const catStockMap = {};
  allProducts.forEach(p => {
    const name = p.category_name || 'Uncategorised';
    if (!catStockMap[name]) catStockMap[name] = { count: 0, value: 0 };
    catStockMap[name].count += p.stock_quantity;
    catStockMap[name].value += p.retail_price * p.stock_quantity;
  });
  const catStock = Object.entries(catStockMap).sort((a, b) => b[1].value - a[1].value);
  const maxCatValue = Math.max(...catStock.map(([, v]) => v.value), 1);

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
            Sales, Inventory & End-of-Day Till Audit
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

      {/* Report Type Toggle */}
      <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--bg-surface-elevated)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
        {[
          { key: 'daily', label: 'Daily Sales', icon: FileText },
          { key: 'sales', label: 'Sales Summary', icon: TrendingUp },
          { key: 'inventory', label: 'Inventory', icon: Package }
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeReport === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveReport(tab.key)} style={{
              flex: 1, padding: '0.5rem 0.25rem',
              borderRadius: 'var(--radius-sm)',
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? '#fff' : 'var(--text-muted)',
              fontSize: '0.75rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
              transition: 'all 0.15s', whiteSpace: 'nowrap'
            }}>
              <Icon size={14} />{tab.label}
            </button>
          );
        })}
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
            <MetricCard icon={<DollarSign size={16} color="var(--accent-emerald)" />} bg="var(--accent-emerald-light)" label="Total Sales" value={`$${dailyRevenue.toFixed(2)}`} sub={`${dailyOrders} orders`} valueColor="var(--accent-emerald)" />
            <MetricCard icon={<BookOpen size={16} color="var(--primary)" />} bg="var(--primary-light)" label="Books Sold" value={dailyItemsSold} sub="total copies" valueColor="var(--primary)" />
            <MetricCard icon={<DollarSign size={16} color="var(--accent-amber)" />} bg="var(--accent-amber-light)" label="Cash Received" value={`$${dailyCash.toFixed(2)}`} sub="cash payments" valueColor="var(--accent-amber)" />
            <MetricCard icon={<ShoppingBag size={16} color="var(--accent-purple)" />} bg="hsla(265,83%,58%,0.12)" label="Card / Mobile" value={`$${(dailyCard + dailyMobile).toFixed(2)}`} sub="non-cash payments" valueColor="var(--accent-purple)" />
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
                    <span style={{ fontWeight: 800, color: row.color, width: '60px', textAlign: 'right', flexShrink: 0 }}>
                      ${row.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dailySales.length > 0 && (
            <div className="card-glass" style={{ padding: '0.9rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.6rem' }}>
                All Transactions — {dailySales.length} record{dailySales.length !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '280px', overflowY: 'auto' }}>
                {dailySales.map((sale, i) => (
                  <div key={i} style={{
                    background: sale.is_refund ? 'var(--accent-rose-light)' : 'var(--bg-surface-elevated)',
                    border: `1px solid ${sale.is_refund ? 'var(--accent-rose)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)', padding: '0.6rem 0.75rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>#{sale.order_id}</span>
                        {sale.is_refund && (
                          <span style={{
                            marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.1rem 0.45rem',
                            borderRadius: 'var(--radius-full)', fontWeight: 700,
                            background: 'var(--accent-rose)', color: '#fff'
                          }}>REFUND</span>
                        )}
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: sale.is_refund ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                        ${sale.total.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span>🕐 {new Date(sale.timestamp).toLocaleTimeString()}</span>
                      <span>💳 {sale.payment_method}</span>
                      <span>👤 {sale.cashier_name || 'Cashier'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <RefundModal
        isOpen={isRefundOpen}
        onClose={() => setIsRefundOpen(false)}
        onRefundSuccess={() => setRefreshTrigger(t => t + 1)}
      />

      <ZReportModal
        isOpen={isZReportOpen}
        onClose={() => setIsZReportOpen(false)}
        settings={settings || { store_name: 'Brushwell Books' }}
        session={session}
      />

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
