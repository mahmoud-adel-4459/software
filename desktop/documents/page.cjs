'use strict';
/** The HTML page wrapper (CSS, letterhead) around every printed document. */
const { esc } = require('./format.cjs');
const { labelSize, receiptConfig } = require('./geometry.cjs');

const PAPER_SIZES = ['A4', 'A5'];

/** Print stylesheet. Kept as named rules (one concern per entry) and joined without whitespace. */
function stylesheet({ paper, margins }) {
  const rules = [
    `@page{size:${paper};margin:${margins === 'narrow' ? 6 : 12}mm}`,
    '*{box-sizing:border-box}',
    'body{font-family:Plex,Arial,sans-serif;font-size:10pt;color:#111;padding:0}',
    'table{width:100%;border-collapse:collapse}',
    'td,th{border:1px solid #999;padding:5px;text-align:right}',
    'thead{display:table-header-group}',
    'tr{break-inside:avoid}',
    // soldier ID card
    '.card{width:110mm;height:70mm;border:1px solid #777;padding:3mm;display:flex;align-items:center;gap:3mm;break-inside:avoid;margin:4mm 0}',
    '.card img{width:60mm;height:60mm;image-rendering:pixelated}',
    // letterhead, vouchers, canteen
    '.logo{width:16mm;height:16mm;object-fit:contain}',
    '.voucher{border:1px solid #777;padding:6mm;break-inside:avoid;margin:4mm 0}',
    '.canteen-bon{max-width:80mm;margin-inline:auto}',
    '.canteen-amount{font-size:12pt}',
    '.canteen-statement{max-width:170mm}',
    '.sign{margin-top:10mm;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4mm}',
    'h1{font-size:15pt}',
    'h2{font-size:12pt}',
    'p{margin:3mm 0}',
  ];
  return rules.join('');
}

const round = (n) => Math.round(n * 100) / 100;

/**
 * Label sheet CSS. Each box leaves 1.5mm below the content for driver rounding.
 * Only subsequent labels start a new page, avoiding trailing blank stickers.
 */
function labelStylesheet(widthMm, heightMm) {
  const short = Math.min(widthMm, heightMm);
  const boxW = widthMm - 1;
  const boxH = heightMm - 1.5;
  const pad = round(Math.max(1, short * 0.03));
  const innerW = boxW - 2 * pad;
  const innerH = boxH - 2 * pad;
  const qrSize = round(Math.max(1, Math.min(innerW, innerH)));
  return [
    `@page{size:${widthMm}mm ${heightMm}mm;margin:0}`,
    '*{box-sizing:border-box}',
    `html,body{width:${widthMm}mm;margin:0;padding:0;overflow:hidden;background:#fff;color:#000}`,
    'body{font-family:Plex,Arial,sans-serif}',
    'header{display:none}',
    `.label{display:flex;align-items:center;justify-content:center;width:${boxW}mm;height:${boxH}mm;margin:0 auto;padding:${pad}mm;overflow:hidden;break-inside:avoid;page-break-inside:avoid}`,
    '.label+.label{break-before:page;page-break-before:always}',
    `.label img{flex:none;width:${qrSize}mm;height:${qrSize}mm;image-rendering:pixelated}`,
  ].join('');
}

/**
 * Thermal receipt CSS: pure black on white, no borders/backgrounds/shadows/radius. The content box
 * (#receipt) is exactly printable - 2*margin wide, centered on the paper; the body carries the
 * top/bottom feed as padding so its measured height is the page height.
 */
function receiptStylesheet(cfg, calibration = false) {
  const pageMm = cfg.printableMm;
  const root = calibration ? `width:${pageMm}mm` : `width:${cfg.contentMm}mm;margin:0 auto`;
  const base = cfg.bold ? 600 : 500;
  const logo = `${cfg.logoMm}mm`;
  return [
    `@page{size:${pageMm}mm auto;margin:0}`,
    '*{box-sizing:border-box;box-shadow:none;border-radius:0;text-shadow:none;background:transparent;color:#000}',
    `html{width:${pageMm}mm;margin:0;padding:0;background:#fff}`,
    `body{display:flow-root;width:${pageMm}mm;margin:0;padding:${cfg.topFeedMm}mm 0 ${cfg.bottomFeedMm}mm;background:#fff;font-family:Plex,Arial,sans-serif;font-size:${cfg.fontPt}pt;line-height:${cfg.lineHeight};font-weight:${base};color:#000}`,
    `#receipt{${root};overflow-wrap:anywhere;word-break:normal;text-align:center}`,
    'strong,b,h1,h2{font-weight:700}',
    '.rh{display:flex;flex-direction:column;align-items:center;text-align:center;padding-bottom:1.5mm;border-bottom:1px dashed #000;margin-bottom:1.5mm}',
    `.rh .logo{width:${logo};height:${logo};max-width:100%;object-fit:contain;display:block;margin:0 auto 1mm}`,
    '.rh h1{font-size:1.2em;margin:0;font-weight:700}',
    '.rh p{margin:0;font-size:.85em}',
    'h2{font-size:1.1em;margin:1mm 0;text-align:center;font-weight:700}',
    '.rcpt{text-align:start}',
    '.rcpt>*{break-inside:avoid}',
    '.r{display:flex;justify-content:space-between;align-items:flex-start;gap:2mm;margin:.6mm 0}',
    '.k{flex:none;max-width:60%}',
    '.v{flex:1 1 auto;min-width:0;text-align:end;font-weight:700}',
    '.t{margin:.6mm 0;text-align:center}',
    '.sep{border:0;border-top:1px dashed #000;height:0;margin:1.5mm 0}',
    '.amt{margin:1.5mm 0;text-align:center;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:1mm 0}',
    '.amt .k{display:block;max-width:none;font-size:.9em}',
    '.amt strong{display:block;font-size:2.2em;line-height:1.2;font-weight:800}',
    '.sign{margin-top:3mm;display:flex;flex-direction:column;gap:3mm}',
    '.sign span{display:flex;align-items:flex-end;gap:1.5mm}',
    '.sign i{flex:1 1 auto;min-width:8mm;border-bottom:1px solid #000;height:1em}',
    '.foot{margin-top:2mm;padding-top:1.5mm;border-top:1px dashed #000;text-align:center;font-size:.9em}',
    '.pass-qr{width:38mm;height:38mm;max-width:100%;display:block;margin:1.5mm auto;image-rendering:pixelated}',
    // calibration
    '.cal svg{display:block;margin:0 0 1.5mm}',
    `.cal .box{width:${cfg.contentMm}mm;margin:0 auto}`,
    '.cal .s1{font-size:7pt}.cal .s2{font-size:10pt}.cal .s3{font-size:14pt}',
    '.cal .qr{width:24mm;height:24mm;display:block;margin:1mm auto;image-rendering:pixelated}',
  ].join('');
}

/** Receipt letterhead: centered, optional logo, unit name (bold) and parent formation. */
function receiptLetterhead(settings, cfg, title) {
  const src = settings.showLogo && settings.logo ? settings.logo : DEFAULT_LOGO;
  const logo = cfg.showLogo && src ? `<img class="logo" src="${esc(src)}">` : '';
  const parent = settings.parentFormation ? `<p>${esc(settings.parentFormation)}</p>` : '';
  return `<header class="rh">${logo}<h1>${esc(settings.unitName || title)}</h1>${parent}</header>`;
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src file:; img-src data:;";

const fs = require('node:fs');
const path = require('node:path');

/** Official emblem (128px) inlined as a data URL, used when the unit has no custom logo. */
const DEFAULT_LOGO = (() => {
  try {
    const png = fs.readFileSync(path.join(__dirname, '../../assets/logo-128.png'));
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return '';
  }
})();

function letterhead(settings, title) {
  const src = settings.showLogo && settings.logo ? settings.logo : DEFAULT_LOGO;
  const logo = src ? `<img class="logo" src="${esc(src)}">` : '';
  return `<header>${logo}<h1>${esc(settings.unitName || title)}</h1><p>${esc(settings.parentFormation || '')}</p></header>`;
}

/** Full printable HTML page. `mode`: 'office' (A4/A5 + letterhead), 'label' (no letterhead), 'receipt' (compact). */
function documentHtml({ title, body, settings = {}, fontUrl, mode = 'office', calibration = false }) {
  if (mode === 'memo')
    return require('./memo.cjs').memoDocument({ title, body, settings, fontUrl, defaultLogo: DEFAULT_LOGO });
  const paper = settings.paper || 'A4';
  if (!PAPER_SIZES.includes(paper)) throw new Error('مقاس ورق غير صالح');
  let css;
  if (mode === 'label') {
    const { widthMm, heightMm } = labelSize(settings);
    css = labelStylesheet(widthMm, heightMm);
  } else if (mode === 'receipt') css = receiptStylesheet(receiptConfig(settings), calibration);
  else css = stylesheet({ paper, margins: settings.margins });
  if (mode === 'receipt') {
    const cfg = receiptConfig(settings);
    const head = calibration ? '' : receiptLetterhead(settings, cfg, title);
    const foot = !calibration && cfg.footer ? `<div class="foot">${esc(cfg.footer)}</div>` : '';
    return (
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${esc(title)}</title>` +
      `<style>@font-face{font-family:Plex;src:url('${fontUrl}')}
    ${css}</style></head>` +
      `<body><main id="receipt">${head}${body}${foot}</main></body></html>`
    );
  }
  const head = mode === 'label' ? '' : letterhead(settings, title);
  return (
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}"><title>${esc(title)}</title>` +
    `<style>@font-face{font-family:Plex;src:url('${fontUrl}')}\n    ${css}</style></head>` +
    `<body>${head}${body}</body></html>`
  );
}

module.exports = { documentHtml };
