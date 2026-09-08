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
  const currencySymbol = '¢';
  const orderId = order.order_id || 'N/A';
  const dateStr = new Date(order.timestamp || order.created_at || Date.now()).toLocaleString();
  const customerName = order.customer_name || 'Walk-in Customer';
  const customerPhone = order.customer_phone || '';
  const cashierName = order.cashier_name || 'Staff';
  const priceMode = (order.price_mode || 'retail').toUpperCase();
  const items = order.items || [];

  // 80mm width in mm = 80mm (~226 points)
  // Calculate dynamic height based on number of items + taxes
  const baseHeight = 125;
  let itemsHeight = 0;
  items.forEach(item => {
    const nameLen = (item.product_name || 'Item').length;
    const lines = Math.max(1, Math.ceil(nameLen / 22));
    itemsHeight += (lines * 3.4) + (item.quantity > 1 ? 3.0 : 0) + 2.0;
  });
  const taxesCount = (order.tax_breakdown && order.tax_breakdown.length) || 0;
  const totalHeight = Math.max(140, baseHeight + itemsHeight + (taxesCount * 4.5));

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, totalHeight]
  });

  const pageWidth = 80;
  const margin = 5;
  const contentWidth = pageWidth - (margin * 2);
  let y = 8;

  // Store Name Header (Clean, professional typography without colored background)
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(storeName.toUpperCase(), pageWidth / 2, y + 2, { align: 'center' });
  y += 6.5;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('OFFICIAL SALES RECEIPT', pageWidth / 2, y, { align: 'center' });
  y += 4;

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

  y += 1;
  // Divider Line
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  // Order Details Block (Unified clean typography)
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);

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
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y - 2.5, contentWidth, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('ITEM', margin + 1, y + 1);
  doc.text('QTY', 51, y + 1, { align: 'center' });
  doc.text('TOTAL', pageWidth - margin - 1, y + 1, { align: 'right' });
  y += 4.5;

  // Items Rows (Zero overlap layout: Item width max 41mm, Qty at 51mm, Total at 75mm)
  items.forEach((item) => {
    const itemName = item.product_name || 'Item';
    const qty = item.quantity || 1;
    const price = parseFloat(item.price) || 0;
    const itemTotal = price * qty;

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const splitTitle = doc.splitTextToSize(itemName, 41);
    doc.text(splitTitle, margin + 1, y);

    // QTY centered cleanly at 51mm
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(String(qty), 51, y, { align: 'center' });

    // Item Total right aligned at 74mm
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(`${currencySymbol}${itemTotal.toFixed(2)}`, pageWidth - margin - 1, y, { align: 'right' });

    const linesCount = splitTitle.length;
    const titleHeight = linesCount * 3.4;

    // Subtitle if qty > 1
    if (qty > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`@ ${currencySymbol}${price.toFixed(2)} each`, margin + 1, y + titleHeight);
      doc.setTextColor(15, 23, 42);
      y += titleHeight + 3.2;
    } else {
      y += titleHeight + 1.2;
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

  const drawTotalLine = (label, amountStr, isBold = false, color = [30, 41, 59]) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(isBold ? 8 : 7.5);
    doc.setTextColor(color[0], color[1], color[2]);
    const splitLabel = doc.splitTextToSize(label, 42);
    doc.text(splitLabel, margin + 8, y);
    doc.text(amountStr, pageWidth - margin - 1, y, { align: 'right' });
    y += Math.max(3.8, splitLabel.length * 3.4 + 0.4);
  };

  drawTotalLine('Subtotal:', `${currencySymbol}${subtotal.toFixed(2)}`);

  if (discount > 0) {
    drawTotalLine('Discount:', `-${currencySymbol}${discount.toFixed(2)}`, false, [225, 29, 72]);
  }

  // Taxes
  if (order.tax_breakdown && order.tax_breakdown.length > 0) {
    order.tax_breakdown.forEach(t => {
      drawTotalLine(`${t.name} (${t.rate_pct}%):`, `+${currencySymbol}${(parseFloat(t.amount) || 0).toFixed(2)}`, false, [37, 99, 235]);
    });
  } else if ((order.apply_tax || order.tax_applied) && (order.tax_total || order.tax_amount) > 0) {
    drawTotalLine('Tax / VAT:', `+${currencySymbol}${(parseFloat(order.tax_total || order.tax_amount) || 0).toFixed(2)}`, false, [37, 99, 235]);
  }

  // Highlighted Grand Total Box
  y += 1;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y - 1, contentWidth, 7.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL PAID:', margin + 2, y + 4.5);
  doc.text(`${currencySymbol}${total.toFixed(2)}`, pageWidth - margin - 2, y + 4.5, { align: 'right' });
  y += 10.5;

  // Payment Details (Amount Paid and Change Due on separate lines)
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  doc.text('Payment Method:', margin, y);
  doc.text(String(order.payment_method || 'Cash'), pageWidth - margin - 1, y, { align: 'right' });
  y += 4;

  // Amount Paid (changed from Amount Tendered)
  doc.text('Amount Paid:', margin, y);
  doc.text(`${currencySymbol}${tendered.toFixed(2)}`, pageWidth - margin - 1, y, { align: 'right' });
  y += 4;

  if (change > 0) {
    doc.text('Change Due:', margin, y);
    doc.text(`${currencySymbol}${change.toFixed(2)}`, pageWidth - margin - 1, y, { align: 'right' });
    y += 4;
  }

  // Footer Message
  y += 2;
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Thank you for shopping with us!', pageWidth / 2, y, { align: 'center' });
  y += 3.5;
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
  const file = new File([pdfBlob], filename, { 
    type: 'application/pdf',
    lastModified: Date.now()
  });

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
 * Format minimal WhatsApp receipt text (PDF-only mode — no links).
 * Used when the PDF is attached directly via file share or as a fallback on desktop.
 */
export function formatWhatsAppReceiptText(order, settings = {}) {
  const storeName = settings.store_name || 'Brushwell Books';
  const custName = order.customer_name || 'Walk-in Customer';
  return `Hello ${custName},\nThank you for your purchase from *${storeName}*.\nYour official sales receipt is attached.`;
}

/**
 * Share Receipt PDF via WhatsApp.
 *
 * Strategy (Strictly PDF document — no text message receipt):
 * 1. On mobile/tablet: Use native Web Share API with ONLY the PDF file in files: [file].
 *    Omitting the text parameter ensures WhatsApp treats the share as a pure Document attachment,
 *    attaching the actual PDF file directly in the chat.
 * 2. On desktop (where browser sandboxing prohibits direct file injection into web apps):
 *    Instantly downloads the PDF to the cashier's device and opens WhatsApp chat so
 *    the cashier can drag & drop the PDF file directly into the conversation.
 */
export async function shareReceiptPDFViaWhatsApp(order, settings = {}, targetPhone = '') {
  const { file, filename } = generateReceiptPDFBlob(order, settings);
  const cleanPhone = formatWhatsAppPhone(targetPhone || order.customer_phone);

  // ── Mobile path: Web Share API with STRICTLY the PDF file ──────────────────
  // Supported on: Android Chrome, iOS Safari 15.1+, Samsung Internet
  // IMPORTANT: Do NOT pass 'text' alongside 'files' — on mobile WhatsApp, passing
  // a 'text' parameter causes WhatsApp to prioritize or insert the text instead of the file!
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: filename
      });
      return { success: true, method: 'native_file_share', filename };
    } catch (err) {
      if (err.name === 'AbortError') {
        // User dismissed the share sheet — do nothing
        return { success: false, aborted: true };
      }
      console.warn('Native file share failed:', err);
    }
  }

  // ── Desktop / fallback path ───────────────────────────────────────────────
  // Step 1: Instantly download the PDF to the cashier's computer
  downloadReceiptPDF(order, settings);

  // Step 2: Open WhatsApp chat cleanly ready for the cashier to drag the PDF file in
  const whatsappUrl = cleanPhone
    ? `https://api.whatsapp.com/send?phone=${cleanPhone}`
    : `https://api.whatsapp.com/send`;

  window.open(whatsappUrl, '_blank');

  return { success: true, method: 'desktop_download_and_chat', filename };
}
