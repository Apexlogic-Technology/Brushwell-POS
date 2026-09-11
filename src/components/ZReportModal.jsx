import React from 'react';
import { X, Printer, FileText, Check } from 'lucide-react';
import { fetchOrders } from '../services/supabaseService';
import { printBluetoothReport, isBluetoothSupported } from '../services/printerService';

export default function ZReportModal({ isOpen, onClose, settings, session }) {
  const [sales, setSales] = React.useState([]);
  const [isPrinting, setIsPrinting] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    fetchOrders({ limit: 500 }).then(data => setSales(data));
  }, [isOpen]);

  if (!isOpen) return null;

  const now = new Date();
  const todayDateStr = now.toLocaleDateString();
  const today = todayDateStr;
  const todaySales = sales.filter(s => {
    const raw = s.created_at || s.timestamp;
    if (!raw) return false;
    return new Date(raw).toLocaleDateString() === todayDateStr;
  });

  const isRefundOrder = (s) => s.order_type === 'refund' || Boolean(s.is_refund) || String(s.order_id || '').startsWith('REF-');
  const regularSales = todaySales.filter(s => !isRefundOrder(s));
  const refunds = todaySales.filter(s => isRefundOrder(s));

  const totalRevenue = regularSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
  const totalSubtotal = regularSales.reduce((sum, s) => sum + (parseFloat(s.subtotal) || 0), 0);
  const totalTax = regularSales.reduce((sum, s) => sum + (parseFloat(s.tax_total || s.tax_amount) || 0), 0);
  const totalRefundAmount = refunds.reduce((sum, s) => sum + Math.abs(parseFloat(s.total) || 0), 0);

  // Till Balancing: calculate payments from regularSales including split payments
  let cashTotal = 0;
  let cardTotal = 0;
  let mobileTotal = 0;

  regularSales.forEach(s => {
    if (s.split_payments && Array.isArray(s.split_payments) && s.split_payments.length > 0) {
      s.split_payments.forEach(p => {
        const amt = parseFloat(p.amount) || 0;
        if (p.method === 'Cash') cashTotal += amt;
        else if (p.method === 'Card') cardTotal += amt;
        else if (p.method === 'Mobile Transfer') mobileTotal += amt;
      });
    } else {
      const tot = parseFloat(s.total) || 0;
      if (s.payment_method === 'Cash') cashTotal += tot;
      else if (s.payment_method === 'Card') cardTotal += tot;
      else if (s.payment_method === 'Mobile Transfer') mobileTotal += tot;
    }
  });

  // Borrowed books calculation for today's Z-Report
  const currencySymbol = '¢';
  const borrowedItems = [];
  regularSales.forEach(s => {
    (s.items || []).forEach(it => {
      if (it.is_borrowed) {
        const qty = parseInt(it.quantity, 10) || 1;
        const sell = parseFloat(it.price) || 0;
        const cost = parseFloat(it.borrow_cost_price) || 0;
        borrowedItems.push({
          ...it,
          qty,
          lineRevenue: qty * sell,
          linePayout: qty * cost,
          lineProfit: qty * (sell - cost),
        });
      }
    });
  });

  const totalBorrowedQty = borrowedItems.reduce((sum, i) => sum + i.qty, 0);
  const totalBorrowedRevenue = borrowedItems.reduce((sum, i) => sum + i.lineRevenue, 0);
  const totalBorrowedPayout = borrowedItems.reduce((sum, i) => sum + i.linePayout, 0);
  const totalBorrowedProfit = borrowedItems.reduce((sum, i) => sum + i.lineProfit, 0);

  const handlePrintZReport = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    try {
      const cur = (settings?.currency_symbol === '¢' || settings?.currency_symbol === '₵' || !settings?.currency_symbol) ? 'GHc' : (settings?.currency_symbol || 'GHc');
      const fmt = (n) => `${cur} ${Number(n || 0).toFixed(2)}`;

      const rows = [
        { label: 'Total Orders:', value: String(regularSales.length) },
        { label: 'Items Sold:', value: String(regularSales.reduce((s, o) => s + (o.items || []).reduce((a, i) => a + i.quantity, 0), 0)) },
        '---',
        { label: 'Gross Subtotal:', value: fmt(totalSubtotal) },
        { label: 'Tax/VAT:', value: `+${fmt(totalTax)}` },
        { label: 'Refunds:', value: `-${fmt(totalRefundAmount)}` },
        '---',
        { label: 'NET REVENUE:', value: fmt(totalRevenue) },
      ];

      if (totalBorrowedQty > 0) {
        rows.push(
          '---',
          { label: 'BORROWED BOOKS', value: '' },
          { label: 'Copies Sold:', value: String(totalBorrowedQty) },
          { label: 'Customer Revenue:', value: fmt(totalBorrowedRevenue) },
          { label: 'Supplier Payouts:', value: `-${fmt(totalBorrowedPayout)}` },
          { label: 'Net Profit Kept:', value: `+${fmt(totalBorrowedProfit)}` },
        );
      }

      rows.push(
        '---',
        { label: 'TILL BALANCING', value: '' },
        { label: 'Cash in Till:', value: fmt(cashTotal) },
        { label: 'Card Payments:', value: fmt(cardTotal) },
        { label: 'Mobile Transfer:', value: fmt(mobileTotal) },
      );

      if (isBluetoothSupported()) {
        await printBluetoothReport(
          {
            title: 'END-OF-DAY Z-REPORT',
            rows,
            generatedBy: session?.name || 'Admin',
          },
          settings || {}
        );
      } else {
        // Fallback: open a print window for non-Bluetooth browsers
        const printWindow = window.open('', '_blank', 'width=350,height=600');
        if (!printWindow) return;
        printWindow.document.write(`
          <html><head><title>Z-Report - ${today}</title>
          <style>body{font-family:monospace;font-size:12px;margin:10px;width:280px;}.line{border-bottom:1px dashed #000;margin:8px 0;}.row{display:flex;justify-content:space-between;margin:3px 0;}.bold{font-weight:bold;}</style></head>
          <body>
          <div style="text-align:center;font-weight:bold;font-size:14px;">${settings?.store_name || 'BRUSHWELL POS'}</div>
          <div style="text-align:center;">END-OF-DAY Z-REPORT</div>
          <div class="line"></div>
          <div>Date: ${new Date().toLocaleDateString()}</div>
          <div>Time: ${new Date().toLocaleTimeString()}</div>
          <div>By: ${session?.name || 'Admin'}</div>
          <div class="line"></div>
          <div class="row"><span>Total Orders:</span><span class="bold">${regularSales.length}</span></div>
          <div class="row"><span>NET REVENUE:</span><span class="bold">${fmt(totalRevenue)}</span></div>
          <div class="line"></div>
          <div class="row"><span>Cash:</span><span>${fmt(cashTotal)}</span></div>
          <div class="row"><span>Card:</span><span>${fmt(cardTotal)}</span></div>
          <div class="row"><span>Mobile:</span><span>${fmt(mobileTotal)}</span></div>
          <div class="line"></div>
          <script>setTimeout(()=>{window.print();window.close();},400);</script>
          </body></html>
        `);
        printWindow.document.close();
      }
    } catch (err) {
      console.error('Z-Report print error:', err);
      alert('Print failed: ' + (err.message || 'Unknown error') + '\n\nEnsure your Bluetooth printer is paired and in range.');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} color="var(--primary)" />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>End-of-Day Z-Report</h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Daily Till Audit & Revenue Closing</div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div style={{
            background: '#ffffff',
            color: '#000',
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: '12px',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            border: '1px solid #ddd',
            marginBottom: '1rem'
          }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '15px', marginBottom: '2px' }}>
              {settings.store_name || 'BRUSHWELL BOOKS'}
            </div>
            <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '6px' }}>
              DAILY CLOSING Z-REPORT
            </div>
            <div style={{ borderBottom: '1px dashed #999', marginBottom: '6px' }}></div>

            <div>Date: {new Date().toLocaleDateString()}</div>
            <div>Time: {new Date().toLocaleTimeString()}</div>
            <div>Audit By: <strong>{session?.name || 'Admin'}</strong></div>

            <div style={{ borderBottom: '1px dashed #999', margin: '6px 0' }}></div>

            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
              <span>Total Orders:</span>
              <strong>{regularSales.length}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
              <span>Subtotal:</span>
              <span>{currencySymbol}{totalSubtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
              <span>Tax / VAT Collected:</span>
              <span>+{currencySymbol}{totalTax.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
              <span>Refunds Issued:</span>
              <span>-{currencySymbol}{totalRefundAmount.toFixed(2)}</span>
            </div>

            <div style={{ borderBottom: '1px dashed #999', margin: '6px 0' }}></div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
              <span>NET REVENUE:</span>
              <span>{currencySymbol}{totalRevenue.toFixed(2)}</span>
            </div>

            {totalBorrowedQty > 0 && (
              <>
                <div style={{ borderBottom: '1px dashed #999', margin: '6px 0' }}></div>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>🤝 BORROWED BOOKS AUDIT</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>Borrowed Copies Sold:</span>
                  <strong>{totalBorrowedQty} items</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>Supplier Payouts Due:</span>
                  <strong style={{ color: '#b91c1c' }}>-{currencySymbol}{totalBorrowedPayout.toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0' }}>
                  <span>Shop Net Profit Kept:</span>
                  <strong style={{ color: '#15803d' }}>+{currencySymbol}{totalBorrowedProfit.toFixed(2)}</strong>
                </div>
              </>
            )}

            <div style={{ borderBottom: '1px dashed #999', margin: '6px 0' }}></div>

            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>TILL RECONCILIATION</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>💵 Cash in Till:</span>
              <span>{currencySymbol}{cashTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>💳 Card Payments:</span>
              <span>{currencySymbol}{cardTotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>📱 Mobile Transfer:</span>
              <span>{currencySymbol}{mobileTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={handlePrintZReport} disabled={isPrinting} style={{ flex: 1, opacity: isPrinting ? 0.6 : 1 }}>
            <Printer size={16} /> {isPrinting ? 'Printing...' : 'Print Official Z-Report'}
          </button>
        </div>

      </div>
    </div>
  );
}
