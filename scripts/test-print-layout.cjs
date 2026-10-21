'use strict';
/**
 * Page-count test of the print layout (runs in Electron: `npm run test:print`).
 * Renders the production label / receipt HTML in a hidden window, prints it to PDF with the same
 * geometry code as the real print path (desktop/documents/geometry.cjs) and asserts that
 * pages === labels (1 for a receipt) and that the PDF page size equals the requested size.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync(require('electron'), [__filename], { stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}

const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow } = require('electron');
const QRCode = require('qrcode');
const { documentHtml, cards, visitorLabels, voucher, canteenReceipt, testReceipt } = require('../desktop/documents.cjs');
const geometry = require('../desktop/documents/geometry.cjs');

const FONT = pathToFileURL(path.join(__dirname, '../fonts/plex-arabic-arabic-400.woff2')).href;
const failures = [];

const soldier = (i) => ({
  name: `محمد عبد الرحمن إبراهيم السيد الشناوي ${i}`,
  rank: 'جندي',
  military_no: String(100000 + i).padStart(9, '0'),
  company: 'السرية الأولى',
  unit: 'الكتيبة الثالثة',
});

/** Count PDF page objects (`/Type /Page`, not `/Pages`) and read the first MediaBox in mm. */
function inspectPdf(pdf) {
  const text = pdf.toString('latin1');
  const pages = (text.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
  const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
  const mm = (pt) => (Number(pt) * 25.4) / 72;
  return { pages, widthMm: box ? mm(box[3] - box[1]) : NaN, heightMm: box ? mm(box[4] - box[2]) : NaN };
}

/** `shrinkMm` simulates a driver that rounds the page smaller than requested (e.g. dpi rounding). */
async function render({ html, mode, settings, shrinkMm = 0, calibration = false, capture = null }) {
  const file = path.join(os.tmpdir(), `print-layout-${process.pid}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(file, html);
  const win = new BrowserWindow({ show: false, width: 1000, height: 850, webPreferences: { sandbox: true } });
  try {
    await win.loadFile(file);
    const receiptMm = mode === 'receipt' ? await geometry.measureReceiptHeight(win.webContents, settings) : undefined;
    const overflow =
      mode === 'receipt' && !calibration
        ? await win.webContents.executeJavaScript(`(() => {
            const root = document.getElementById('receipt');
            const box = root.getBoundingClientRect();
            let worst = 0;
            for (const el of root.querySelectorAll('*')) {
              const r = el.getBoundingClientRect();
              worst = Math.max(worst, box.left - r.left, r.right - box.right);
            }
            return { scroll: root.scrollWidth, client: root.clientWidth, widthPx: box.width, bodyScroll: document.body.scrollWidth, htmlW: document.documentElement.clientWidth, worst };
          })()`)
        : null;
    if (capture) {
      const px = Math.ceil((geometry.receiptConfig(settings).widthMm * 96) / 25.4);
      await win.webContents.insertCSS('html,body{overflow:hidden!important}');
      win.setContentSize(px, 400);
      await win.webContents.executeJavaScript('document.fonts.ready.then(()=>0)');
      const h = await win.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)');
      win.setContentSize(px, h);
      await new Promise((r) => setTimeout(r, 300));
      const img = await win.webContents.capturePage();
      fs.mkdirSync(path.dirname(capture), { recursive: true });
      fs.writeFileSync(capture, img.toPNG());
    }
    const spec = geometry.pageSpec(mode, settings, receiptMm);
    const printed = shrinkMm ? { ...spec, heightMm: spec.heightMm - shrinkMm } : spec;
    const pdf = await win.webContents.printToPDF(geometry.pdfOptions(printed));
    return { spec, overflow, ...inspectPdf(pdf) };
  } finally {
    win.destroy();
    fs.rmSync(file, { force: true });
  }
}

function check(name, cond, detail) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' -> ' + detail}`);
  if (!cond) failures.push(name);
}

async function main() {
  const qrUrl = await QRCode.toDataURL('sample', { errorCorrectionLevel: 'L', width: 600, margin: 2 });
  const sizes = [
    [89, 102],
    [100, 100],
    [60, 40],
    [50, 30],
  ];
  for (const [w, h] of sizes) {
    for (const count of [1, 2, 5]) {
      const settings = { labelWidthMm: w, labelHeightMm: h };
      const soldiers = Array.from({ length: count }, (_, i) => soldier(i));
      const body = cards(soldiers, soldiers.map(() => qrUrl), 1, true);
      const html = documentHtml({ title: 't', body, settings, fontUrl: FONT, mode: 'label' });
      const r = await render({ html, mode: 'label', settings });
      // Same labels on a page 0.8 mm smaller than requested: must still be one page per label.
      const tight = await render({ html, mode: 'label', settings, shrinkMm: 0.8 });
      check(`label ${w}x${h} x${count} with driver rounding (height -0.8mm): pages=${tight.pages}`, tight.pages === count, `expected ${count}`);
      check(
        `label ${w}x${h} x${count}: pages=${r.pages}, size=${r.widthMm.toFixed(1)}x${r.heightMm.toFixed(1)}`,
        r.pages === count && Math.abs(r.widthMm - w) < 1 && Math.abs(r.heightMm - h) < 1,
        `expected ${count} pages of ${w}x${h}`,
      );
    }
  }
  // Visitor labels with copies: 2 visitors x 2 copies = 4 pages.
  {
    const settings = { labelWidthMm: 89, labelHeightMm: 102 };
    const visitors = [1, 2].map((i) => ({ name: `زائر ${i}`, category_name: 'مدني', badge_no: `B-${i}` }));
    const body = visitorLabels(visitors, [qrUrl, qrUrl], 2);
    const r = await render({ html: documentHtml({ title: 't', body, settings, fontUrl: FONT, mode: 'label' }), mode: 'label', settings });
    check(`visitor labels 2x2: pages=${r.pages}`, r.pages === 4, 'expected 4 pages');
  }
  // Receipts: one continuous page, whatever the length, size, font, margin or height mode.
  const permit = {
    no: 15, rank: 'جندي', name: 'محمد عبد الرحمن إبراهيم', military_no: '000012345', company: 'الأولى',
    reason: 'سبب طويل جدًا '.repeat(60), exit_at: new Date().toISOString(), expected_return: new Date().toISOString(),
  };
  const long = voucher(permit) + Array.from({ length: 120 }, (_, i) => `<p>سطر رقم ${i} من إيصال طويل جدًا لاختبار الطباعة المستمرة</p>`).join('');
  const unbroken = canteenReceipt({
    rank: 'جندي', name: 'أ'.repeat(90), military_no: '9'.repeat(60), company: 'ب'.repeat(70), at: new Date().toISOString(),
    amount_cents: 123456789, notes: 'ملاحظة'.repeat(80), outlet_name: 'كانتين', cashier: 'x'.repeat(80),
  });
  const short = canteenReceipt({ rank: 'جندي', name: 'أحمد', military_no: '1', company: 'أ', at: new Date().toISOString(), amount_cents: 1250, notes: '', outlet_name: 'الكانتين' });
  const base = { unitName: 'وحدة الاختبار', receiptShowLogo: false };
  const configs = [
    { receiptWidthMm: 80, receiptPrintableWidthMm: 72 },
    { receiptWidthMm: 58, receiptPrintableWidthMm: 48 },
    { receiptWidthMm: 80, receiptPrintableWidthMm: 72, receiptMarginMm: 0 },
    { receiptWidthMm: 80, receiptPrintableWidthMm: 72, receiptMarginMm: 10 },
    { receiptWidthMm: 58, receiptPrintableWidthMm: 48, receiptMarginMm: 10, receiptFontPt: 18 },
    { receiptFontPt: 7 },
    { receiptFontPt: 18 },
    { receiptBold: false },
    { receiptBold: true, receiptShowLogo: true, receiptLogoMm: 40, receiptFooter: 'شكرًا لزيارتكم — ' + 'x'.repeat(100) },
    { receiptHeightMode: 'fixed', receiptHeightMm: 300 },
    { receiptHeightMode: 'fixed', receiptHeightMm: 40 },
    { receiptLineHeight: 2.2, receiptTopFeedMm: 20, receiptBottomFeedMm: 30 },
  ];
  for (const extra of configs) {
    const settings = { ...base, ...extra };
    const cfg = geometry.receiptConfig(settings);
    const tag = JSON.stringify(extra);
    for (const [label, body] of [['long', long], ['short', short], ['unbroken', unbroken]]) {
      const html = documentHtml({ title: 't', body, settings, fontUrl: FONT, mode: 'receipt' });
      const r = await render({ html, mode: 'receipt', settings });
      check(
        `receipt ${label} ${tag}: pages=${r.pages}, size=${r.widthMm.toFixed(1)}x${r.heightMm.toFixed(1)}`,
        r.pages === 1 && Math.abs(r.widthMm - cfg.widthMm) < 1 && Math.abs(r.heightMm - r.spec.heightMm) < 1,
        'expected exactly 1 page of the measured size',
      );
      const o = r.overflow;
      check(
        `receipt ${label} ${tag}: content box ${cfg.contentMm}mm, no horizontal overflow`,
        o.scroll <= o.client && o.worst <= 0.5 && o.bodyScroll <= o.htmlW && Math.abs(o.widthPx - (cfg.contentMm * 96) / 25.4) < 1,
        JSON.stringify(o),
      );
      if (cfg.heightMode === 'fixed' && cfg.heightMm >= 300 && label === 'short')
        check(`receipt fixed ${cfg.heightMm}mm short -> ${r.spec.heightMm}mm`, r.spec.heightMm === cfg.heightMm, 'fixed height not applied');
      if (cfg.heightMode === 'fixed' && label === 'long')
        check(`receipt fixed long never clipped -> ${r.spec.heightMm}mm`, r.spec.heightMm > cfg.heightMm, 'content clipped');
    }
  }
  // Copies: every copy is the same single page (the print path repeats the job N times).
  for (const copies of [1, 2, 3]) {
    const settings = { ...base, receiptCopies: copies };
    check(`receipt copies ${copies} -> ${geometry.receiptConfig(settings).copies} jobs`, geometry.receiptConfig(settings).copies === copies, 'bad copies');
    for (let i = 0; i < copies; i++) {
      const r = await render({ html: documentHtml({ title: 't', body: short, settings, fontUrl: FONT, mode: 'receipt' }), mode: 'receipt', settings });
      check(`receipt copy ${i + 1}/${copies}: pages=${r.pages}`, r.pages === 1, 'expected 1 page');
    }
  }
  // Calibration receipt: one page at paper width, for the default and the 58 mm preset.
  for (const extra of [{}, { receiptWidthMm: 58, receiptPrintableWidthMm: 48 }]) {
    const settings = { ...base, ...extra };
    const body = testReceipt(settings, qrUrl);
    const html = documentHtml({ title: 't', body, settings, fontUrl: FONT, mode: 'receipt', calibration: true });
    const r = await render({ html, mode: 'receipt', settings, calibration: true });
    check(`calibration ${JSON.stringify(extra)}: pages=${r.pages}, width=${r.widthMm.toFixed(1)}`, r.pages === 1 && Math.abs(r.widthMm - geometry.receiptConfig(settings).widthMm) < 1, 'expected 1 page');
  }
  // PNG samples (default 80/72 settings) for visual review.
  const sample = { unitName: 'الكتيبة الثالثة مشاة', parentFormation: 'المنطقة المركزية', receiptFooter: 'شكرًا لكم' };
  const art = path.join(__dirname, '../artifacts');
  const shot = (name, body, calibration = false) =>
    render({
      html: documentHtml({ title: 't', body, settings: sample, fontUrl: FONT, mode: 'receipt', calibration }),
      mode: 'receipt', settings: sample, calibration, capture: path.join(art, name),
    });
  await shot('receipt-sample.png', short.replace('الكانتين', 'كانتين الكتيبة'));
  await shot('receipt-voucher-sample.png', voucher({ ...permit, reason: 'زيارة عائلية' }));
  await shot('receipt-calibration.png', testReceipt(sample, qrUrl), true);
  check('receipt PNG samples written', fs.existsSync(path.join(art, 'receipt-sample.png')), 'missing png');
}

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    await main();
  } catch (error) {
    console.error(error);
    failures.push('exception');
  }
  console.log(failures.length ? `\n${failures.length} FAILED` : '\nall print layout checks passed');
  app.exit(failures.length ? 1 : 0);
});
