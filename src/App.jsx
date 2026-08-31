import React, { useState, useEffect, useCallback } from 'react';
import './index.css';

import Header from './components/Header';
import LoginScreen from './components/LoginScreen';
import BarcodeScannerModal from './components/BarcodeScannerModal';
import BarcodeGeneratorModal from './components/BarcodeGeneratorModal';
import SellingInterface from './components/SellingInterface';
import ProductManagement from './components/ProductManagement';
import Reports from './components/Reports';
import UserManagement from './components/UserManagement';
import ReceiptModal from './components/ReceiptModal';
import SettingsModal from './components/SettingsModal';
import StockReceivingModal from './components/StockReceivingModal';
import OrderHistoryModal from './components/OrderHistoryModal';
import RefundModal from './components/RefundModal';

import { fetchProducts, getSettings } from './services/supabaseService';

// Ghana Education System book categories (mirrors ProductManagement.jsx DEFAULT_CATEGORIES)
const GH_BOOK_CATEGORIES = [
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
import { getSession, logout, updateSessionActivity, ROLES } from './services/authService';
import { ShoppingBag, Package, BarChart2, Users, Settings, Clock, LogOut, Sun, Moon } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('brushwell_theme') || 'light');
  const [session, setSession] = useState(getSession());
  const [activeTab, setActiveTab] = useState('sell');
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(getSettings());
  const [cart, setCart] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBarcodeGenOpen, setIsBarcodeGenOpen] = useState(false);
  const [barcodeGenProduct, setBarcodeGenProduct] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [isStockReceiveOpen, setIsStockReceiveOpen] = useState(false);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);

  // Theme effect
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('brushwell_theme', theme);
  }, [theme]);

  // Session Inactivity Timeout Listener
  useEffect(() => {
    if (!session) return;

    const handleUserActivity = () => {
      updateSessionActivity();
    };

    window.addEventListener('click', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);

    const interval = setInterval(() => {
      const current = getSession();
      if (!current) {
        setSession(null);
      }
    }, 30000);

    return () => {
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      clearInterval(interval);
    };
  }, [session]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const prods = await fetchProducts();
    setProducts(prods);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  const isAdmin = session?.role === ROLES.ADMIN;

  const TABS = [
    { key: 'sell', label: 'Sell', icon: ShoppingBag },
    { key: 'products', label: 'Products', icon: Package },
    ...(isAdmin ? [
      { key: 'reports', label: 'Reports', icon: BarChart2 },
      { key: 'users', label: 'Users', icon: Users }
    ] : [])
  ];

  useEffect(() => {
    const validKeys = TABS.map(t => t.key);
    if (!validKeys.includes(activeTab)) setActiveTab('sell');
  }, [session]);

  const handleLogin = (newSession) => {
    setSession(newSession);
    setActiveTab('sell');
  };

  const handleLogout = () => {
    logout();
    setSession(null);
    setCart([]);
    setActiveTab('sell');
  };

  const handleScanResult = (code, matchedProduct) => {
    if (matchedProduct) {
      setCart(prev => {
        const idx = prev.findIndex(c => c.id === matchedProduct.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
          return updated;
        }
        return [...prev, { ...matchedProduct, quantity: 1 }];
      });
      setActiveTab('sell');
    }
  };

  const handleCheckoutSuccess = (order) => {
    setLastOrder(order);
    setIsReceiptOpen(true);
    loadData();
  };

  const handleReprintOrder = (order) => {
    setLastOrder(order);
    setIsOrderHistoryOpen(false);
    setIsReceiptOpen(true);
  };

  const handleRefundOrder = (order) => {
    setIsOrderHistoryOpen(false);
    setIsRefundOpen(true);
  };

  const openBarcodeGen = (product) => {
    setBarcodeGenProduct(product);
    setIsBarcodeGenOpen(true);
  };

  const handleSettingsSaved = (newSettings) => {
    setSettings(newSettings);
    loadData();
  };

  if (!session) {
    return (
      <div data-theme={theme}>
        <LoginScreen onLogin={handleLogin} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: '1.25rem', background: 'var(--bg-app)'
      }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '22px',
          background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 30px var(--primary-glow)', animation: 'pulseGlow 1.5s infinite'
        }}>
          <ShoppingBag size={36} color="#fff" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Brushwell Books</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Loading...
          </p>
        </div>
        <div style={{ width: '200px', height: '4px', background: 'var(--border-light)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--accent-purple))',
            borderRadius: 'var(--radius-full)', animation: 'loadingBar 1.5s ease-in-out infinite'
          }} />
        </div>
        <style>{`
          @keyframes loadingBar { 0% { width: 0%; } 50% { width: 80%; } 100% { width: 100%; } }
          @keyframes pulseGlow { 0%, 100% { box-shadow: 0 8px 30px var(--primary-glow); } 50% { box-shadow: 0 8px 50px var(--primary-glow); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Mobile-Only Header */}
      <div className="mobile-only-header">
        <Header
          settings={settings}
          onOpenSettings={() => isAdmin && setIsSettingsOpen(true)}
          onOpenScanner={() => setIsScannerOpen(true)}
          onOpenOrderHistory={() => setIsOrderHistoryOpen(true)}
          theme={theme}
          onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
          cartCount={cart.reduce((a, b) => a + b.quantity, 0)}
          onOpenCart={() => setActiveTab('sell')}
          session={session}
          onLogout={handleLogout}
          isAdmin={isAdmin}
        />
      </div>

      {/* Desktop Left Sidebar (visible on screens >= 900px) */}
      <aside className="desktop-sidebar">
        {/* Top: Brand & Cashier Badge */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{
              width: '40px', height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: '0 4px 12px var(--primary-glow)',
              flexShrink: 0
            }}>
              <ShoppingBag size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.1 }}>
                {settings.store_name || 'Brushwell Books'}
              </h1>
              {session && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '2px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-emerald)' }} />
                  {session.name} ({session.role})
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem' }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  className={`desktop-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <Icon size={19} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Quick Actions & Logout */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
          <button
            type="button"
            className="desktop-nav-link"
            onClick={() => setIsOrderHistoryOpen(true)}
            title="Recent Orders & Sales Log"
          >
            <Clock size={18} />
            <span>Order History</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              className="desktop-nav-link"
              onClick={() => setIsStockReceiveOpen(true)}
              title="Receive & Restock Inventory"
            >
              <Package size={18} />
              <span>Restock Stock</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              className="desktop-nav-link"
              onClick={() => setIsSettingsOpen(true)}
              title="Store & Database Settings"
            >
              <Settings size={18} />
              <span>POS Settings</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                padding: '0.45rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--text-main)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              {theme === 'dark' ? <Sun size={15} color="var(--accent-amber)" /> : <Moon size={15} color="var(--primary)" />}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                background: 'var(--accent-rose-light)',
                color: 'var(--accent-rose)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '0.45rem 0.75rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <LogOut size={15} /> Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="main-content">
        {activeTab === 'sell' && (
          <SellingInterface
            products={products}
            categories={GH_BOOK_CATEGORIES}
            cart={cart}
            setCart={setCart}
            settings={{ ...settings, cashier_name: session.name }}
            onCheckoutSuccess={handleCheckoutSuccess}
            onOpenScanner={() => setIsScannerOpen(true)}
          />
        )}
        {activeTab === 'products' && (
          <ProductManagement
            products={products}
            categories={GH_BOOK_CATEGORIES}
            onRefreshProducts={loadData}
            onOpenBarcodeGen={openBarcodeGen}
            isAdmin={isAdmin}
            onOpenStockReceive={() => setIsStockReceiveOpen(true)}
          />
        )}
        {activeTab === 'reports' && isAdmin && (
          <Reports session={session} settings={settings} />
        )}
        {activeTab === 'users' && isAdmin && (
          <UserManagement currentSession={session} />
        )}
      </div>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="bottom-nav">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <div style={{
                background: isActive ? 'var(--primary-light)' : 'transparent',
                padding: '0.3rem 0.7rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s'
              }}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span style={{ fontSize: '0.68rem', marginTop: '2px' }}>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modals */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanResult}
        products={products}
      />
      <BarcodeGeneratorModal
        isOpen={isBarcodeGenOpen}
        onClose={() => setIsBarcodeGenOpen(false)}
        product={barcodeGenProduct}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={handleSettingsSaved}
      />
      <StockReceivingModal
        isOpen={isStockReceiveOpen}
        onClose={() => setIsStockReceiveOpen(false)}
        products={products}
        onRefreshProducts={loadData}
      />
      <OrderHistoryModal
        isOpen={isOrderHistoryOpen}
        onClose={() => setIsOrderHistoryOpen(false)}
        onSelectReprintOrder={handleReprintOrder}
        onSelectRefundOrder={handleRefundOrder}
        isAdmin={isAdmin}
        settings={settings}
      />
      <RefundModal
        isOpen={isRefundOpen}
        onClose={() => setIsRefundOpen(false)}
        onRefundSuccess={loadData}
      />
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        order={lastOrder}
        settings={{ ...settings, cashier_name: session?.name }}
      />
    </div>
  );
}
