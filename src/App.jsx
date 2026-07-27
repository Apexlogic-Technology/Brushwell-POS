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

import { fetchProducts, getSettings, getCategories } from './services/n8nService';
import { getSession, logout, updateSessionActivity, ROLES } from './services/authService';
import { ShoppingBag, Package, BarChart2, Users } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('brushwell_theme') || 'light');
  const [session, setSession] = useState(getSession());
  const [activeTab, setActiveTab] = useState('sell');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
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
    const [prods, cats] = await Promise.all([
      fetchProducts(),
      Promise.resolve(getCategories())
    ]);
    setProducts(prods);
    setCategories(cats);
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
            {settings.use_mock_mode ? 'Loading book catalogue...' : 'Syncing with PostgreSQL via n8n...'}
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

      <div className="main-content">
        {activeTab === 'sell' && (
          <SellingInterface
            products={products}
            categories={categories}
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
            categories={categories}
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

      {/* Bottom Navigation */}
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
