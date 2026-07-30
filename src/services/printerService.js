// ESC/POS Bluetooth Printer Engine & HTML Thermal Receipt Generator

let bluetoothDevice = null;
let gattServer = null;
let printerCharacteristic = null;

// Thermal ESC/POS Constants
const ESC = 0x1B;
const GS = 0x1D;

export const connectBluetoothPrinter = async () => {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth API is not supported in this browser. Please use Chrome on Android or a Bluetooth-enabled browser.');
  }

  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [
        { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
        { services: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] },
        { services: ['0000ff00-0000-1000-8000-00805f9b34fb'] }
      ],
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000180a-0000-1000-8000-00805f9b34fb'
      ]
    });

    gattServer = await bluetoothDevice.gatt.connect();

    // Find printer write characteristic
    const services = await gattServer.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          printerCharacteristic = char;
          break;
        }
      }
      if (printerCharacteristic) break;
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
export const printBluetoothReceipt = async (order, settings) => {
  const encoder = new TextEncoder();
  const buffer = [];

  const addBytes = (...bytes) => buffer.push(...bytes);
  const addText = (str) => {
    const encoded = encoder.encode(str);
    buffer.push(...encoded);
  };

  const symbol = settings.currency_symbol || 'GH₵';

  // Initialize
  addBytes(ESC, 0x40);

  // Header Center
  addBytes(ESC, 0x61, 1);
  addBytes(ESC, 0x21, 0x20); // Double height/width
  addText(`${settings.store_name || 'BRUSHWELL BOOKS'}\n`);
  addBytes(ESC, 0x21, 0x00); // Reset font
  addText('Bookshop Mobile POS\n');
  addText('--------------------------------\n');

  // Metadata Left
  addBytes(ESC, 0x61, 0);
  addText(`Order #: ${order.order_id}\n`);
  addText(`Date: ${new Date(order.timestamp).toLocaleString()}\n`);
  addText(`Cashier: ${order.cashier_name || 'Main Cashier'}\n`);
  addText(`Price Mode: ${order.price_mode === 'wholesale' ? 'WHOLESALE TIER' : 'RETAIL'}\n`);
  addText('--------------------------------\n');

  // Table Columns: Item (18) Qty (4) Total (10)
  addText('Item               Qty     Total\n');
  addText('--------------------------------\n');

  order.items.forEach(item => {
    let name = item.product_name;
    if (name.length > 18) name = name.substring(0, 17) + '.';
    name = name.padEnd(18, ' ');

    const qty = String(item.quantity).padStart(4, ' ');
    const price = (`${symbol}` + (item.price * item.quantity).toFixed(2)).padStart(10, ' ');
    addText(`${name}${qty}${price}\n`);
  });

  addText('--------------------------------\n');

  // Totals - Align Right
  addBytes(ESC, 0x61, 2);
  addBytes(ESC, 0x1B, 0x45, 1); // Bold
  addText(`Subtotal: ${symbol}${order.subtotal.toFixed(2)}\n`);
  if (order.discount > 0) {
    addText(`Discount: -${symbol}${order.discount.toFixed(2)}\n`);
  }
  if (order.apply_tax && order.tax_breakdown && order.tax_breakdown.length > 0) {
    order.tax_breakdown.forEach(t => {
      addText(`${t.name} (${t.rate_pct}%): +${symbol}${t.amount.toFixed(2)}\n`);
    });
  } else if (order.apply_tax && order.tax_amount > 0) {
    addText(`VAT/Tax: +${symbol}${order.tax_amount.toFixed(2)}\n`);
  }

  addText(`TOTAL: ${symbol}${order.total.toFixed(2)}\n`);
  addBytes(ESC, 0x1B, 0x45, 0); // Bold Off

  addText(`Payment (${order.payment_method}): ${symbol}${(order.cash_given || order.total).toFixed(2)}\n`);
  if (order.change_due > 0) {
    addText(`Change: ${symbol}${order.change_due.toFixed(2)}\n`);
  }

  // Footer Center
  addBytes(ESC, 0x61, 1);
  addText('--------------------------------\n');
  addText('Thank you for reading with us!\n');
  addText('Brushwell Books System\n\n\n');

  // Paper Cut
  addBytes(GS, 0x56, 0x41, 0);

  await writeEscPosChunked(buffer);
};

// System / WiFi Printer via styled HTML pop-up window
export const printSystemWebReceipt = (order, settings) => {
  const is80mm = settings.printer_paper_width === '80mm';
  const widthPx = is80mm ? '300px' : '230px';
  const symbol = settings.currency_symbol || 'GH₵';

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt ${order.order_id}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            margin: 0;
            padding: 10px;
            background: #fff;
            color: #000;
          }
          .receipt {
            width: ${widthPx};
            margin: 0 auto;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .bold { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { text-align: left; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="text-center bold" style="font-size: 15px;">
            ${settings.store_name || 'BRUSHWELL BOOKS'}
          </div>
          <div class="text-center" style="font-size: 10px; color: #444;">
            Bookshop Mobile POS
          </div>
          <div class="divider"></div>

          <div>Order #: <strong>${order.order_id}</strong></div>
          <div>Date: ${new Date(order.timestamp).toLocaleString()}</div>
          <div>Cashier: ${order.cashier_name || 'Main Cashier'}</div>
          <div>Tier: <strong>${order.price_mode === 'wholesale' ? 'WHOLESALE' : 'RETAIL'}</strong></div>

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
              ${order.items.map(item => `
                <tr>
                  <td style="padding: 2px 0;">${item.product_name}</td>
                  <td style="text-align: center;">${item.quantity}</td>
                  <td style="text-align: right;">${symbol}${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="divider"></div>

          <div class="text-right">
            <div>Subtotal: ${symbol}${order.subtotal.toFixed(2)}</div>
            ${order.discount > 0 ? `<div>Discount: -${symbol}${order.discount.toFixed(2)}</div>` : ''}
            ${order.apply_tax && order.tax_breakdown && order.tax_breakdown.length > 0 ? (
              order.tax_breakdown.map(t => `<div>${t.name} (${t.rate_pct}%): +${symbol}${t.amount.toFixed(2)}</div>`).join('')
            ) : order.apply_tax && order.tax_amount > 0 ? `<div>VAT/Tax: +${symbol}${order.tax_amount.toFixed(2)}</div>` : ''}

            <div style="font-size: 14px; font-weight: bold; margin-top: 4px;">
              TOTAL: ${symbol}${order.total.toFixed(2)}
            </div>
            <div style="font-size: 11px; margin-top: 2px;">
              Payment (${order.payment_method}): ${symbol}${(order.cash_given || order.total).toFixed(2)}
            </div>
            ${order.change_due > 0 ? `<div>Change Due: ${symbol}${order.change_due.toFixed(2)}</div>` : ''}
          </div>

          <div class="divider"></div>

          <div class="text-center" style="font-size: 10px; margin-top: 8px;">
            Thank you for reading with us!<br/>
            Brushwell Books System
          </div>
        </div>

        <script>
          setTimeout(() => {
            window.print();
            window.close();
          }, 300);
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
};
