// Thermal Receipt Printer Engine (Web Bluetooth ESC/POS & Web Print)

let bluetoothDevice = null;
let gattServer = null;
let printCharacteristic = null;

// Common Bluetooth Printer Service UUIDs
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-41a3-ac56-7c062645429f',
  '00001101-0000-1000-8000-00805f9b34fb'
];

/**
 * Connect to Web Bluetooth ESC/POS Receipt Printer
 */
export const connectBluetoothPrinter = async () => {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not supported in this browser. Please use Google Chrome on Android, or Blueify/WebBLE on iOS.');
  }

  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES
    });

    gattServer = await bluetoothDevice.gatt.connect();

    // Discover write characteristic
    const services = await gattServer.getPrimaryServices();
    for (const service of services) {
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          printCharacteristic = char;
          break;
        }
      }
      if (printCharacteristic) break;
    }

    if (!printCharacteristic) {
      throw new Error('No writable thermal printer characteristic found on device.');
    }

    return {
      connected: true,
      name: bluetoothDevice.name || 'Bluetooth Receipt Printer'
    };
  } catch (err) {
    console.error('Bluetooth printer connection error:', err);
    throw err;
  }
};

export const isBluetoothConnected = () => {
  return gattServer && gattServer.connected && printCharacteristic !== null;
};

export const disconnectBluetoothPrinter = () => {
  if (gattServer && gattServer.connected) {
    gattServer.disconnect();
  }
  bluetoothDevice = null;
  gattServer = null;
  printCharacteristic = null;
};

/**
 * Generate ESC/POS Bytes for Order
 */
const buildEscPosBuffer = (order, settings) => {
  const encoder = new TextEncoder();
  const buffer = [];

  const addBytes = (...bytes) => buffer.push(...bytes);
  const addText = (str) => {
    const encoded = encoder.encode(str);
    encoded.forEach(b => buffer.push(b));
  };

  const is80mm = settings.printer_paper_width === '80mm';
  const widthChars = is80mm ? 48 : 32;

  // ESC @ - Initialize printer
  addBytes(0x1B, 0x40);

  // Align Center
  addBytes(0x1B, 0x61, 1);
  // Double height text for header
  addBytes(0x1D, 0x21, 0x11);
  addText((settings.store_name || 'BRUSHWELL POS') + '\n');
  
  // Normal size
  addBytes(0x1D, 0x21, 0x00);
  addText('Mobile Point of Sale\n');
  addText('--------------------------------\n');

  // Align Left
  addBytes(0x1B, 0x61, 0);
  addText(`Order #: ${order.order_id}\n`);
  addText(`Date: ${new Date(order.timestamp).toLocaleString()}\n`);
  addText(`Cashier: ${order.cashier_name || 'Main Cashier'}\n`);
  addText(`Price Mode: ${order.price_mode === 'wholesale' ? 'WHOLESALE TIER' : 'RETAIL'}\n`);
  addText('='.repeat(widthChars) + '\n');

  // Table header
  addText('Item                 Qty   Price\n');
  addText('-'.repeat(widthChars) + '\n');

  order.items.forEach(item => {
    let name = item.product_name;
    if (name.length > 18) name = name.substring(0, 16) + '..';
    name = name.padEnd(18, ' ');

    const qty = String(item.quantity).padStart(4, ' ');
    const price = ('$' + (item.price * item.quantity).toFixed(2)).padStart(8, ' ');
    addText(`${name}${qty}${price}\n`);
  });

  addText('='.repeat(widthChars) + '\n');

  // Totals - Align Right
  addBytes(0x1B, 0x61, 2);
  addBytes(0x1B, 0x45, 1); // Bold
  addText(`Subtotal: $${order.subtotal.toFixed(2)}\n`);
  if (order.discount > 0) {
    addText(`Discount: -$${order.discount.toFixed(2)}\n`);
  }
  addText(`TOTAL: $${order.total.toFixed(2)}\n`);
  addBytes(0x1B, 0x45, 0); // Bold Off

  addText(`Payment (${order.payment_method}): $${(order.cash_given || order.total).toFixed(2)}\n`);
  if (order.change_due > 0) {
    addText(`Change: $${order.change_due.toFixed(2)}\n`);
  }

  // Footer Center
  addBytes(0x1B, 0x61, 1);
  addText('\nThank you for shopping!\n');
  addText('Powered by Brushwell POS & n8n\n\n\n');

  // Cut paper (GS V 66 0)
  addBytes(0x1D, 0x56, 66, 0);

  return new Uint8Array(buffer);
};

/**
 * Print Order to Bluetooth ESC/POS Printer
 */
export const printBluetoothReceipt = async (order, settings) => {
  if (!isBluetoothConnected()) {
    const res = await connectBluetoothPrinter();
    if (!res.connected) throw new Error('Bluetooth printer not connected');
  }

  const bytes = buildEscPosBuffer(order, settings);
  
  // Write in 512 byte chunks to prevent BLE buffer overflow
  const chunkSize = 512;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    await printCharacteristic.writeValue(chunk);
  }
};

/**
 * WiFi / System Web Print Handler (Renders printable HTML receipt)
 */
export const printSystemWebReceipt = (order, settings) => {
  const is80mm = settings.printer_paper_width === '80mm';
  const widthPx = is80mm ? '300px' : '220px';

  let printContainer = document.getElementById('thermal-receipt-print');
  if (!printContainer) {
    printContainer = document.createElement('div');
    printContainer.id = 'thermal-receipt-print';
    document.body.appendChild(printContainer);
  }

  printContainer.innerHTML = `
    <div style="width: ${widthPx}; font-family: monospace; font-size: 12px; padding: 5px; color: #000;">
      <div style="text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 4px;">
        ${settings.store_name || 'BRUSHWELL POS'}
      </div>
      <div style="text-align: center; font-size: 11px; margin-bottom: 8px;">
        Mobile POS & Inventory System
      </div>
      <div style="border-bottom: 1px dashed #000; margin-bottom: 6px;"></div>
      
      <div>Order #: <strong>${order.order_id}</strong></div>
      <div>Date: ${new Date(order.timestamp).toLocaleString()}</div>
      <div>Cashier: ${order.cashier_name || 'Main Cashier'}</div>
      <div>Tier: <strong>${order.price_mode === 'wholesale' ? 'WHOLESALE' : 'RETAIL'}</strong></div>
      
      <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="border-bottom: 1px solid #000;">
            <th style="text-align: left;">Item</th>
            <th style="text-align: center;">Qty</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map(item => `
            <tr>
              <td style="padding: 2px 0;">${item.product_name}</td>
              <td style="text-align: center;">${item.quantity}</td>
              <td style="text-align: right;">$${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>

      <div style="text-align: right; font-size: 12px;">
        <div>Subtotal: $${order.subtotal.toFixed(2)}</div>
        ${order.discount > 0 ? `<div>Discount: -$${order.discount.toFixed(2)}</div>` : ''}
        <div style="font-size: 14px; font-weight: bold; margin-top: 4px;">
          TOTAL: $${order.total.toFixed(2)}
        </div>
        <div style="font-size: 11px; margin-top: 2px;">
          Payment (${order.payment_method}): $${(order.cash_given || order.total).toFixed(2)}
        </div>
        ${order.change_due > 0 ? `<div>Change Due: $${order.change_due.toFixed(2)}</div>` : ''}
      </div>

      <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>

      <div style="text-align: center; font-size: 11px;">
        Thank you for your business!<br/>
        Synced with PostgreSQL & n8n
      </div>
    </div>
  `;

  window.print();
};
