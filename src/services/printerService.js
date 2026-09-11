// ESC/POS Bluetooth Printer Engine & HTML Thermal Receipt Generator

let bluetoothDevice = null;
let gattServer = null;
let printerCharacteristic = null;

// Thermal ESC/POS Constants
const ESC = 0x1B;
const GS = 0x1D;

export const isBluetoothSupported = () => {
  return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth);
};

export const isBluetoothConnected = () => {
  return Boolean(gattServer && gattServer.connected && printerCharacteristic);
};

export const connectBluetoothPrinter = async () => {
  if (!navigator.bluetooth) {
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      throw new Error('iOS Safari & Chrome do not support Web Bluetooth. Please use the free "Bluefy" browser from the App Store for direct Bluetooth printing, or use "System Print".');
    }
    throw new Error('Web Bluetooth API is not supported in this browser. Please use Google Chrome on Android or Windows.');
  }

  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS
        '0000ffe0-0000-1000-8000-00805f9b34fb', // Most common 58mm/80mm BLE thermal (MPT-II, POS-58, PT-210, GOOJPRT)
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent serial (Xprinter, Rongta)
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // CPCL/ESC-POS mobile
        '0000ff00-0000-1000-8000-00805f9b34fb', // Custom vendor serial
        '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent/WeChat BLE printers
        '0000fff0-0000-1000-8000-00805f9b34fb', // Custom serial
        '0000ae00-0000-1000-8000-00805f9b34fb', // Zjiang POS-5802
        '0000ae30-0000-1000-8000-00805f9b34fb', // Zjiang
        '0000180a-0000-1000-8000-00805f9b34fb'  // Device Info
      ]
    });

    if (!bluetoothDevice.gatt) {
      throw new Error('Bluetooth device does not support GATT connectivity.');
    }

    gattServer = await bluetoothDevice.gatt.connect();

    // Listen for unexpected disconnections
    bluetoothDevice.addEventListener('gattserverdisconnected', () => {
      printerCharacteristic = null;
    });

    // Find printer write characteristic across primary services
    const services = await gattServer.getPrimaryServices();
    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            printerCharacteristic = char;
            break;
          }
        }
        if (printerCharacteristic) break;
      } catch (e) {
        // continue searching other services
      }
    }

    if (!printerCharacteristic) {
      throw new Error('Could not find a write characteristic on the paired Bluetooth printer.');
    }

    return { name: bluetoothDevice.name || 'Bluetooth Thermal Printer', status: 'connected' };
  } catch (err) {
    console.error('Bluetooth printer error:', err);
    throw err;
  }
};

export const disconnectBluetoothPrinter = () => {
  if (gattServer && gattServer.connected) {
    gattServer.disconnect();
  }
  bluetoothDevice = null;
  gattServer = null;
  printerCharacteristic = null;
};

// Send ESC/POS payload in chunks to avoid BLE buffer overflow
const writeEscPosChunked = async (dataArray) => {
  if (!printerCharacteristic) {
    throw new Error('Printer not connected. Please pair your Bluetooth printer in Settings.');
  }

  const CHUNK_SIZE = 20; // 20 bytes per BLE packet
  const uint8 = new Uint8Array(dataArray);

  for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
    const chunk = uint8.slice(i, i + CHUNK_SIZE);
    if (printerCharacteristic.properties.writeWithoutResponse) {
      await printerCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await printerCharacteristic.writeValue(chunk);
    }
    // Small delay between packets
    await new Promise(r => setTimeout(r, 20));
  }
};

// Format and send Bluetooth Receipt
export const printBluetoothReceipt = async (order, settings = {}) => {
  // If not currently connected, prompt to connect directly from the receipt modal
  if (!printerCharacteristic || !gattServer || !gattServer.connected) {
    await connectBluetoothPrinter();
  }

  const encoder = new TextEncoder();
  const buffer = [];

  const addBytes = (...bytes) => buffer.push(...bytes);
  const addText = (str) => {
    const encoded = encoder.encode(str);
    buffer.push(...encoded);
  };

  // Use clean ASCII currency string to prevent Chinese character rendering on ESC/POS thermal printers
  let cur = (settings.currency_symbol || 'GHc').trim();
  if (cur === '¢' || cur === '₵' || cur === 'GH¢' || !cur) {
    cur = 'GHc';
  }
  const symbol = cur.endsWith(' ') ? cur : `${cur} `;

  // Initialize printer and cancel Chinese character mode
  addBytes(ESC, 0x40);        // ESC @ (Initialize printer)
  addBytes(0x1C, 0x2E);       // FS . (Cancel Chinese/Kanji mode, select ASCII mode)
  addBytes(ESC, 0x74, 0x00);  // ESC t 0 (Select character code table: PC437 Standard Europe/USA)
  addBytes(ESC, 0x52, 0x00);  // ESC R 0 (Select international character set: USA)

  // Header Center
  addBytes(ESC, 0x61, 1);
  addBytes(ESC, 0x21, 0x20); // Double height/width
  addText('Brushwell POS\n');
  addBytes(ESC, 0x21, 0x00); // Reset font
  if (settings.store_name && settings.store_name.trim() && settings.store_name.trim().toLowerCase() !== 'brushwell pos') {
    addText(`${settings.store_name.trim()}\n`);
  }
  addText('--------------------------------\n');

  // Metadata Left
  addBytes(ESC, 0x61, 0);
  addText(`Order #: ${order.order_id}\n`);
  addText(`Date: ${new Date(order.timestamp || order.created_at || Date.now()).toLocaleString()}\n`);
  addText(`Cashier: ${order.cashier_name || 'Main Cashier'}\n`);
  addText(`Price Mode: ${order.price_mode === 'wholesale' ? 'WHOLESALE TIER' : 'RETAIL'}\n`);
  addText('--------------------------------\n');

  // Table Columns: Item (17) Qty (3) Total (10) -> 32 cols total
  addText('Item               Qty     Total\n');
  addText('--------------------------------\n');

  (order.items || []).forEach(item => {
    let name = item.product_name || 'Item';
    if (name.length > 17) name = name.substring(0, 16) + '.';
    name = name.padEnd(17, ' ');

    const qty = String(item.quantity || 1).padStart(3, ' ');
    const price = (`${symbol}` + (parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)).padStart(10, ' ');
    addText(`${name} ${qty} ${price}\n`);
  });

  addText('--------------------------------\n');

  // Totals - Align Right
  addBytes(ESC, 0x61, 2);
  addBytes(ESC, 0x45, 1); // Bold ON (0x1B 0x45 0x01)
  addText(`Subtotal: ${symbol}${Number(order.subtotal || 0).toFixed(2)}\n`);
  if (order.discount > 0) {
    addText(`Discount: -${symbol}${Number(order.discount || 0).toFixed(2)}\n`);
  }
  if (order.apply_tax && order.tax_breakdown && order.tax_breakdown.length > 0) {
    order.tax_breakdown.forEach(t => {
      addText(`${t.name} (${t.rate_pct}%): +${symbol}${Number(t.amount || 0).toFixed(2)}\n`);
    });
  } else if (order.apply_tax && (order.tax_amount || order.tax_total) > 0) {
    addText(`VAT/Tax: +${symbol}${Number(order.tax_amount || order.tax_total || 0).toFixed(2)}\n`);
  }

  addText(`TOTAL: ${symbol}${Number(order.total || 0).toFixed(2)}\n`);
  addBytes(ESC, 0x45, 0); // Bold OFF (0x1B 0x45 0x00)

  addText(`Payment (${order.payment_method || 'Cash'}): ${symbol}${Number(order.cash_given || order.amount_tendered || order.total || 0).toFixed(2)}\n`);
  if ((order.change_due || order.change_given) > 0) {
    addText(`Change: ${symbol}${Number(order.change_due || order.change_given || 0).toFixed(2)}\n`);
  }

  // Footer Center
  addBytes(ESC, 0x61, 1);
  addText('--------------------------------\n');
  addText('Thank you for shopping with us!\n');
  addText('Brushwell POS\n\n\n');

  // Paper Cut
  addBytes(GS, 0x56, 0x41, 0);

  await writeEscPosChunked(buffer);
};

// Standard Browser/System Web Print fallback
export const printSystemWebReceipt = (order, settings = {}) => {
  const symbol = '¢';
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt #${order.order_id}</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          body {
            font-family: monospace;
            font-size: 11px;
            width: 72mm;
            margin: 0 auto;
            padding: 8px 4px;
            color: #000;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider {
            border-top: 1px dashed #000;
            margin: 6px 0;
          }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { text-align: left; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          .header-title { font-size: 14px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="header-title">${settings.store_name || 'Brushwell Books'}</div>
          ${settings.store_address ? `<div>${settings.store_address}</div>` : ''}
          ${settings.store_phone ? `<div>Tel: ${settings.store_phone}</div>` : ''}
          <div style="font-size: 9px; color: #555; margin-top: 2px;">OFFICIAL SALES RECEIPT</div>
        </div>

        <div class="divider"></div>

        <div>
          <div>Order: #${order.order_id}</div>
          <div>Date: ${new Date(order.created_at || order.timestamp || Date.now()).toLocaleString()}</div>
          <div>Customer: ${order.customer_name || 'Walk-in Customer'}</div>
          <div>Cashier: ${order.cashier_name || 'Staff'}</div>
          <div>Tier: ${(order.price_mode || 'retail').toUpperCase()}</div>
        </div>

        <div class="divider"></div>

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${(order.items || []).map(item => `
              <tr>
                <td style="padding: 2px 0;">${item.product_name || 'Item'}</td>
                <td style="text-align: center;">${item.quantity || 1}</td>
                <td style="text-align: right;">${symbol}${(parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="divider"></div>

        <div class="text-right">
          <div>Subtotal: ${symbol}${Number(order.subtotal || 0).toFixed(2)}</div>
          ${order.discount > 0 ? `<div>Discount: -${symbol}${Number(order.discount || 0).toFixed(2)}</div>` : ''}
          ${order.apply_tax && order.tax_breakdown && order.tax_breakdown.length > 0 ? (
            order.tax_breakdown.map(t => `<div>${t.name} (${t.rate_pct}%): +${symbol}${Number(t.amount || 0).toFixed(2)}</div>`).join('')
          ) : order.apply_tax && (order.tax_amount || order.tax_total) > 0 ? `<div>VAT/Tax: +${symbol}${Number(order.tax_amount || order.tax_total || 0).toFixed(2)}</div>` : ''}

          <div style="font-size: 13px; font-weight: bold; margin-top: 4px;">
            TOTAL PAID: ${symbol}${Number(order.total || 0).toFixed(2)}
          </div>
          <div style="font-size: 11px; margin-top: 2px;">
            Payment Method: ${order.payment_method || 'Cash'}
          </div>
          <div style="font-size: 11px;">
            Amount Paid: ${symbol}${Number(order.cash_given || order.amount_tendered || order.total || 0).toFixed(2)}
          </div>
          ${(order.change_due || order.change_given) > 0 ? `<div>Change Due: ${symbol}${Number(order.change_due || order.change_given || 0).toFixed(2)}</div>` : ''}
        </div>

        <div class="divider"></div>

        <div class="text-center" style="font-size: 10px; margin-top: 6px; color: #666;">
          Thank you for shopping with us!<br/>
          ${settings.store_name || 'Brushwell Books'} • Digital Receipt
        </div>
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('System print error:', e);
    } finally {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1000);
    }
  }, 250);
};
