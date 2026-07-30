import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { X, Printer, Copy, Check, Barcode as BarcodeIcon } from 'lucide-react';

export default function BarcodeGeneratorModal({ isOpen, onClose, product }) {
  const barcodeRef = useRef(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (isOpen && product && product.barcode && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, product.barcode, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: true,
          font: 'JetBrains Mono',
          fontSize: 14,
          margin: 10
        });
      } catch (e) {
        console.error('Barcode generation error:', e);
      }
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(product.barcode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintLabel = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Label - ${product.product_name}</title>
          <style>
            body { font-family: sans-serif; text-align: center; margin: 0; padding: 10px; }
            .label-box { border: 1px solid #000; padding: 8px; width: 200px; margin: 0 auto; border-radius: 4px; }
            .name { font-weight: bold; font-size: 12px; margin-bottom: 4px; }
            .price { font-weight: bold; font-size: 14px; color: #000; margin-top: 4px; }
          </style>
        </head>
        <body>
          <div class="label-box">
            <div class="name">${product.product_name}</div>
            <svg id="print-barcode"></svg>
            <div class="price">GH₵${product.retail_price.toFixed(2)}</div>
          </div>
          <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
          <script>
            JsBarcode("#print-barcode", "${product.barcode}", { format: "CODE128", width: 1.5, height: 40, fontSize: 11 });
            setTimeout(() => { window.print(); window.close(); }, 400);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarcodeIcon size={20} color="var(--primary)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Barcode Generator</h3>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{product.product_name}</h4>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Category: {product.category_name || 'General'} • Retail: ${product.retail_price?.toFixed(2)}
            </div>
          </div>

          {/* Barcode SVG Container */}
          <div style={{
            background: '#ffffff',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border-light)'
          }}>
            <svg ref={barcodeRef}></svg>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={handleCopy} style={{ flex: 1 }}>
              {copied ? <Check size={16} color="var(--accent-emerald)" /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>

            <button className="btn-primary" onClick={handlePrintLabel} style={{ flex: 1 }}>
              <Printer size={16} />
              Print Label
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
