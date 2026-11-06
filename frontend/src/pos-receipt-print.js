import receiptCss from './PosCashReceipt.css?inline';

// Print only the finished receipt, never the fixed POS modal or workspace.
// A dedicated same-origin frame prevents repeated fixed overlays and avoids
// interference from global @page rules used by other modules.
const PAPER_WIDTH_MM = 80;
const MIN_HEIGHT_MM = 80;
const MAX_HEIGHT_MM = 1800;

export function receiptPageHeightMm(contentHeightPx, pixelsPerMm = 96 / 25.4) {
 if (!Number.isFinite(contentHeightPx) || contentHeightPx <= 0) throw new Error('POS_RECEIPT_PRINT_LAYOUT_INVALID');
 if (!Number.isFinite(pixelsPerMm) || pixelsPerMm <= 0) throw new Error('POS_RECEIPT_PRINT_LAYOUT_INVALID');
 // Extra roll length for rounding, glyph rasterization and a clean tear margin.
 return Math.max(MIN_HEIGHT_MM, Math.min(MAX_HEIGHT_MM, Math.ceil(contentHeightPx / pixelsPerMm + 10)));
}

export function printPosReceipt(receiptNode) {
 if (!receiptNode?.classList?.contains('pos-print-receipt')) return false;
 const frame = document.createElement('iframe');
 frame.title = 'POS receipt print document';
 frame.setAttribute('aria-hidden', 'true');
 frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:80mm;height:10px;border:0;opacity:0;pointer-events:none';
 document.body.appendChild(frame);
 let cleanupTimer;
 const cleanup = () => {
  if (cleanupTimer) clearTimeout(cleanupTimer);
  frame.remove();
 };
 try {
  const printableWindow = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!printableWindow || !doc) throw new Error('POS_RECEIPT_PRINT_FRAME_UNAVAILABLE');
  doc.open();
  doc.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>POS Payment Receipt</title></head><body></body></html>');
  doc.close();
  const style = doc.createElement('style');
  style.textContent = `${receiptCss}\n
   html,body{margin:0!important;padding:0!important;width:${PAPER_WIDTH_MM}mm!important;min-height:0!important;height:auto!important;background:#fff!important;overflow:visible!important}
   body>.pos-print-receipt{position:static!important;inset:auto!important;width:${PAPER_WIDTH_MM}mm!important;max-height:none!important;overflow:visible!important;border:0!important;border-radius:0!important;margin:0!important;padding:3mm 2mm!important;box-sizing:border-box!important;background:#fff!important;color:#000!important;font-size:10pt!important;box-shadow:none!important}
   .pos-receipt-company h3{font-size:14pt!important}
   .pos-receipt-title{font-size:16pt!important}
   .pos-receipt-total{font-size:13pt!important}
   .pos-receipt-products-head,.pos-receipt-product,.pos-receipt-money-line{break-inside:avoid}
   @media print{html,body{visibility:visible!important}body>.pos-print-receipt,body>.pos-print-receipt *{visibility:visible!important}}
  `;
  doc.head.appendChild(style);
  // React has already escaped receipt fields. Clone DOM nodes rather than
  // constructing markup from customer / merchant supplied text.
  const receiptCopy = receiptNode.cloneNode(true);
  receiptCopy.removeAttribute('ref');
  doc.body.appendChild(receiptCopy);
  const mmProbe = doc.createElement('div');
  mmProbe.style.cssText = 'position:absolute;visibility:hidden;height:100mm;width:1px;pointer-events:none';
  doc.body.appendChild(mmProbe);
  const pixelsPerMm = mmProbe.getBoundingClientRect().height / 100;
  const receiptHeight = receiptCopy.getBoundingClientRect().height;
  mmProbe.remove();
  const pageHeightMm = receiptPageHeightMm(receiptHeight, pixelsPerMm);
  const pageStyle = doc.createElement('style');
  pageStyle.textContent = `@page{size:${PAPER_WIDTH_MM}mm ${pageHeightMm}mm;margin:0}`;
  doc.head.appendChild(pageStyle);
  printableWindow.addEventListener('afterprint', cleanup, {once:true});
  // Some print drivers do not dispatch afterprint when a job is cancelled.
  cleanupTimer = setTimeout(cleanup, 60000);
  printableWindow.focus();
  printableWindow.print();
  return true;
 } catch (error) {
  cleanup();
  throw error;
 }
}
