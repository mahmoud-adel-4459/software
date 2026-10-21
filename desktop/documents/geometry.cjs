'use strict';
/**
 * Page geometry and Electron print/PDF options, shared by the real print path (output.cjs) and
 * the page-count test (scripts/test-print-layout.cjs) so both exercise the same code.
 *
 * Modes: label (QR stickers, fixed W x H), receipt (roll, width fixed, height = content),
 * office (A4/A5 sheet).
 */
const MODE_BY_KIND = {
  qr: 'label',
  'visitor-qr': 'label',
  voucher: 'receipt',
  canteen: 'receipt',
};
const modeOf = (kind) => MODE_BY_KIND[kind] || 'office';

const DEFAULTS = { labelWidthMm: 89, labelHeightMm: 102, receiptWidthMm: 80 };
const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Label size from settings, clamped to the supported range. */
function labelSize(settings = {}) {
  return {
    widthMm: clamp(settings.labelWidthMm, 20, 120, DEFAULTS.labelWidthMm),
    heightMm: clamp(settings.labelHeightMm, 15, 200, DEFAULTS.labelHeightMm),
  };
}
const receiptWidth = (settings = {}) => clamp(settings.receiptWidthMm, 48, 110, DEFAULTS.receiptWidthMm);
const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/**
 * Receipt layout options from settings, clamped and defaulted (stored settings may predate the keys).
 * The content box is `printableMm - 2 * marginMm` wide and centered on the `widthMm` paper.
 */
function receiptConfig(settings = {}) {
  const widthMm = receiptWidth(settings);
  const printableMm = Math.min(widthMm, clamp(settings.receiptPrintableWidthMm, 40, 108, 72));
  const marginMm = clamp(settings.receiptMarginMm, 0, 10, 1);
  return {
    widthMm,
    printableMm,
    marginMm,
    contentMm: Math.max(20, Math.round((printableMm - 2 * marginMm) * 100) / 100),
    fontPt: clamp(settings.receiptFontPt, 7, 18, 11),
    lineHeight: clamp(settings.receiptLineHeight, 1, 2.2, 1.4),
    bold: flag(settings.receiptBold, true),
    showLogo: flag(settings.receiptShowLogo, true),
    logoMm: clamp(settings.receiptLogoMm, 10, 40, 20),
    heightMode: settings.receiptHeightMode === 'fixed' ? 'fixed' : 'auto',
    heightMm: clamp(settings.receiptHeightMm, 40, 400, 150),
    copies: Math.round(clamp(settings.receiptCopies, 1, 3, 1)),
    footer: typeof settings.receiptFooter === 'string' ? settings.receiptFooter.slice(0, 120) : '',
    topFeedMm: clamp(settings.receiptTopFeedMm, 0, 20, 2),
    bottomFeedMm: clamp(settings.receiptBottomFeedMm, 0, 30, 8),
  };
}

/** Printer for a document mode: the dedicated one, else the office/default printer, else ''. */
function printerFor(mode, settings = {}) {
  const dedicated = mode === 'label' ? settings.labelPrinter : mode === 'receipt' ? settings.receiptPrinter : '';
  return String(dedicated || settings.printer || '');
}

const RECEIPT_MIN_MM = 40;
const RECEIPT_EXTRA_MM = 1;
const PX_TO_MM = 25.4 / 96;
const microns = (mm) => Math.round(mm * 1000);

/**
 * Receipt page height (mm) from the rendered body height in CSS px (the body already includes the
 * top/bottom feed as padding). Fixed mode uses the configured height, but never clips: content
 * taller than it switches to the measured height.
 */
function receiptHeightMm(scrollHeightPx, settings = {}) {
  const measured = Math.max(RECEIPT_MIN_MM, Math.ceil(scrollHeightPx * PX_TO_MM) + RECEIPT_EXTRA_MM);
  const cfg = receiptConfig(settings);
  return cfg.heightMode === 'fixed' ? Math.max(cfg.heightMm, measured) : measured;
}

/** Measures the rendered document and returns the receipt page height in mm. */
async function measureReceiptHeight(webContents, settings = {}) {
  const px = await webContents.executeJavaScript('Math.ceil(document.body.getBoundingClientRect().height)');
  return receiptHeightMm(Number(px) || 0, settings);
}

/** Page spec: label/receipt have widthMm x heightMm; office has paper + margins. */
function pageSpec(mode, settings = {}, receiptMm) {
  if (mode === 'label') {
    const { widthMm, heightMm } = labelSize(settings);
    return { mode, widthMm, heightMm };
  }
  if (mode === 'receipt') {
    return { mode, widthMm: receiptWidth(settings), heightMm: receiptMm || RECEIPT_MIN_MM };
  }
  return { mode: 'office', paper: settings.paper || 'A4', margins: settings.margins };
}

/** Options for webContents.print(): custom page in microns for label/receipt, A4/A5 for office. */
function printOptions(spec, settings = {}) {
  const deviceName = printerFor(spec.mode, settings);
  const base = {
    silent: settings.silentPrint === true && Boolean(deviceName),
    printBackground: true,
    landscape: false,
    deviceName,
  };
  if (spec.mode === 'office') {
    return {
      ...base,
      pageSize: spec.paper,
      margins: { marginType: spec.margins === 'narrow' ? 'minimum' : 'default' },
    };
  }
  return {
    ...base,
    pageSize: { width: microns(spec.widthMm), height: microns(spec.heightMm) },
    margins: { marginType: 'none' },
  };
}

/** Options for webContents.printToPDF() with the same geometry as `printOptions`. */
function pdfOptions(spec) {
  if (spec.mode === 'office') return { printBackground: true, preferCSSPageSize: true };
  const inches = (mm) => microns(mm) / 25400;
  return {
    printBackground: true,
    landscape: false,
    preferCSSPageSize: false,
    pageSize: { width: inches(spec.widthMm), height: inches(spec.heightMm) },
    margins: { marginType: 'none' },
  };
}

module.exports = {
  modeOf,
  labelSize,
  receiptWidth,
  receiptConfig,
  printerFor,
  receiptHeightMm,
  measureReceiptHeight,
  pageSpec,
  printOptions,
  pdfOptions,
};
