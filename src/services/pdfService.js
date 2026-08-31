import { jsPDF } from 'jspdf';

/**
 * Clean phone number to Ghana WhatsApp international format (233XXXXXXXXX)
 */
export function formatWhatsAppPhone(rawPhone) {
  if (!rawPhone) return '';
  let digits = String(rawPhone).replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '233' + digits.substring(1);
  }
  return digits;
}

/**
 * Generate a styled 80mm-width POS Receipt PDF using jsPDF
 * @param {Object} order Order object containing items, totals, customer info, etc.
 * @param {Object} settings Store settings (store_name, address, phone, currency_symbol, etc.)
 * @returns {jsPDF} instance
 */
export function createReceiptPDF(order, settings = {}) {
  const storeName = settings.store_name || 'BRUSHWELL BOOKS';
  const currencySymbol = settings.currency_symbol || 'GH₵';
  const orderId = order.order_id || 'N/A';
  const dateStr = new Date(order.timestamp || order.created_at || Date.now()).toLocaleString();
  const customerName = order.customer_name || 'Walk-in Customer';
  const customerPhone = order.customer_phone || '';
  const cashierName = order.cashier_name || 'Staff';
  const priceMode = (order.price_mode || 'retail').toUpperCase();
  const items = order.items || [];

  // 80mm width in mm = 80mm (~226 points)
  // Calculate dynamic height based on number of items + taxes
  const baseHeight = 135;
  const itemHeight = items.length * 9;
  const taxesCount = (order.tax_breakdown && order.tax_breakdown.length) || 0;
  const totalHeight = Math.max(160, baseHeight + itemHeight + (taxesCount * 5));

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, totalHeight]
  });

  const pageWidth = 80;
  const margin = 5;
  const contentWidth = pageWidth - (margin * 2);
  let y = 8;

  // Header Background Accent Banner
  doc.setFillColor(37, 99, 235); // Primary blue
  doc.rect(margin, y, contentWidth, 12, 'F');

  // Store Name Header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(storeName.toUpperCase(), pageWidth / 2, y + 6.5, { align: 'center' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('OFFICIAL SALES RECEIPT', pageWidth / 2, y + 10, { align: 'center' });

  y += 16;
  doc.setTextColor(30, 41, 59);

  // Store Details (if available)
  if (settings.store_address || settings.store_phone) {
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    if (settings.store_address) {
      doc.text(settings.store_address, pageWidth / 2, y, { align: 'center' });
      y += 3.5;
    }
    if (settings.store_phone) {
      doc.text(`Tel: ${settings.store_phone}`, pageWidth / 2, y, { align: 'center' });
      y += 3.5;
    }
  }

  // Divider Line
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  // Order Details Block
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);

  // Left & Right metadata lines
  const drawMetaLine = (label, value) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), pageWidth - margin, y, { align: 'right' });
    y += 3.8;
  };

  drawMetaLine('Receipt #:', `#${orderId}`);
  drawMetaLine('Date & Time:', dateStr);
  drawMetaLine('Customer:', customerName);
  if (customerPhone) drawMetaLine('Phone:', customerPhone);
  drawMetaLine('Cashier:', cashierName);
  drawMetaLine('Pricing Tier:', priceMode);

  y += 1;
  // Solid Divider before Items Table
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y, pageWidth - margin, y);
  y += 3.5;

  // Items Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y - 2.5, contentWidth, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text('ITEM', margin + 1, y + 1);
  doc.text('QTY', margin + 44, y + 1, { align: 'center' });
  doc.text('TOTAL', pageWidth - margin - 1, y + 1, { align: 'right' });
  y += 4.5;

  // Items Rows
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);

  items.forEach((item) => {
    const itemName = item.product_name || 'Item';
    const qty = item.quantity || 1;
    const price = parseFloat(item.price) || 0;
    const itemTotal = price * qty;

    // Truncate/wrap name if too long
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    const splitTitle = doc.splitTextToSize(itemName, 42);
    doc.text(splitTitle, margin + 1, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(String(qty), margin + 44, y, { align: 'center' });
    doc.text(`${currencySymbol}${itemTotal.toFixed(2)}`, pageWidth - margin - 1, y, { align: 'right' });

    const linesCount = splitTitle.length;
    y += (linesCount * 3.2);

    // Optional unit price subtitle if qty > 1
    if (qty > 1) {
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`@ ${currencySymbol}${price.toFixed(2)} each`, margin + 1, y - 0.5);
      doc.setTextColor(15, 23, 42);
      y += 3;
    } else {
      y += 1;
    }
  });

  // Divider after items
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  // Totals Section
  const subtotal = parseFloat(order.subtotal) || 0;
  const discount = parseFloat(order.discount) || 0;
  const total = parseFloat(order.total) || 0;
  const tendered = parseFloat(order.amount_tendered || order.cash_given || total) || total;
  const change = parseFloat(order.change_given || order.change_due) || 0;

  const drawTotalLine = (label, amount, isBold = false, isMinus = false, isPlus = false) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(isBold ? 8.5 : 7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(label, margin + 20, y);

    const prefix = isMinus ? `-${currencySymbol}` : isPlus ? `+${currencySymbol}` : `${currencySymbol}`;
    doc.text(`${prefix}${amount.toFixed(2)}`, pageWidth - margin - 1, y, { align: 'right' });
    y += 3.8;
  };

  drawTotalLine('Subtotal:', subtotal);

  if (discount > 0) {
    drawTotalLine('Discount:', discount, false, true);
  }

  // Taxes
  if (order.tax_breakdown && order.tax_breakdown.length > 0) {
    order.tax_breakdown.forEach(t => {
      drawTotalLine(`${t.name} (${t.rate_pct}%):`, parseFloat(t.amount) || 0, false, false, true);
    });
  } else if ((order.apply_tax || order.tax_applied) && (order.tax_total || order.tax_amount) > 0) {
    drawTotalLine('Tax / VAT:', parseFloat(order.tax_total || order.tax_amount) || 0, false, false, true);
  }

  // Highlighted Grand Total Box
  y += 1;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y - 1, contentWidth, 7.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL PAID:', margin + 2, y + 4.5);
  doc.text(`${currencySymbol}${total.toFixed(2)}`, pageWidth - margin - 2, y + 4.5, { align: 'right' });
  y += 10.5;

  // Payment Details
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Payment Method: ${order.payment_method || 'Cash'}`, margin, y);
  y += 3.2;
  doc.text(`Amount Tendered: ${currencySymbol}${tendered.toFixed(2)}`, margin, y);
  if (change > 0) {
    doc.text(`Change Due: ${currencySymbol}${change.toFixed(2)}`, pageWidth - margin, y, { align: 'right' });
  }
  y += 5;

  // Footer Message
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  doc.text('Thank you for shopping with us!', pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('Brushwell POS • Digital Receipt', pageWidth / 2, y, { align: 'center' });

  return doc;
}

/**
 * Generate PDF File / Blob object for sharing or downloading
 */
export function generateReceiptPDFBlob(order, settings = {}) {
  const doc = createReceiptPDF(order, settings);
  const pdfBlob = doc.output('blob');
  const filename = `Receipt_${order.order_id || Date.now()}.pdf`;
  const file = new File([pdfBlob], filename, { type: 'application/pdf' });

  return { blob: pdfBlob, filename, file, doc };
}

/**
 * Download Receipt as a PDF file to customer/cashier device
 */
export function downloadReceiptPDF(order, settings = {}) {
  const doc = createReceiptPDF(order, settings);
  const filename = `Receipt_${order.order_id || Date.now()}.pdf`;
  doc.save(filename);
}

/**
 * Share Receipt PDF via WhatsApp
 * 1. Checks if Web Share API with files is supported (mobile browsers like Chrome/Edge on Android, Safari iOS)
 * 2. If supported, triggers native share with the PDF file attached directly
 * 3. Also provides direct WhatsApp Web / API launch + instant PDF download fallback
 */
export async function shareReceiptPDFViaWhatsApp(order, settings = {}, targetPhone = '') {
  const { file, filename } = generateReceiptPDFBlob(order, settings);
  const cleanPhone = formatWhatsAppPhone(targetPhone || order.customer_phone);

  const currencySymbol = settings.currency_symbol || 'GH₵';
  const total = Number(order.total || 0).toFixed(2);
  const storeName = settings.store_name || 'Brushwell Books';

  const shareText = `🧾 *PDF RECEIPT #${order.order_id}*\n*${storeName}*\n\n` +
    `Hello ${order.customer_name || 'Valued Customer'},\n` +
    `Thank you for your purchase of *${currencySymbol}${total}*.\n` +
    `Your official PDF sales receipt is ready.\n\n` +
    `_Brushwell POS Digital Receipt_`;

  // 1. Try Native Web Share API with the PDF file (works on Android & iOS mobile devices)
  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Receipt #${order.order_id} - ${storeName}`,
        text: shareText
      });
      return { success: true, method: 'native_share' };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, aborted: true };
      }
      console.warn('Native file share failed, falling back to download + WhatsApp link:', err);
    }
  }

  // 2. Fallback: Automatically download the PDF receipt so user has the file
  downloadReceiptPDF(order, settings);

  // 3. Open WhatsApp chat with pre-filled receipt details
  const whatsappUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(shareText)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;

  window.open(whatsappUrl, '_blank');

  return { success: true, method: 'download_and_chat' };
}
