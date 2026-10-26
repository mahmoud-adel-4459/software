'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cairoDate, dayStart, nextDay } = require('../shared/time.cjs');
const { csv, documentHtml, cards } = require('../desktop/documents.cjs');

test('Cairo calendar day boundaries are consistent across DST dates', () => {
  for (const d of ['2026-04-24', '2026-10-30', '2026-10-07']) {
    const start = Date.parse(dayStart(d));
    assert.equal(cairoDate(new Date(start)), d);
    const dayBefore = new Date(Date.parse(`${d}T12:00Z`) - 86400000).toISOString().slice(0, 10);
    assert.equal(cairoDate(new Date(start - 1000)), dayBefore);
    assert.ok(Date.parse(dayStart(nextDay(d))) > start);
  }
});

test('CSV export neutralizes spreadsheet formulas and keeps money numeric', () => {
  const output = csv({
    type: 'canteen',
    rows: [{ name: '=HYPERLINK("bad")', military_no: '000012345', amount_cents: -1234, notes: '@formula' }],
  });
  assert.match(output, /"'=HYPERLINK/);
  assert.match(output, /"'@formula"/);
  assert.match(output, /"-12.34"/);
  assert.match(output, /"000012345"/);
});

test('printed documents escape HTML and honor paper size and QR label page', () => {
  const body = cards([{ name: '<script>bad</script>', military_no: '000012345' }], ['data:image/png;base64,AA==']);
  const html = documentHtml({
    title: '<script>bad</script>',
    body,
    settings: { paper: 'A5' },
    fontUrl: 'file:///f.woff2',
  });
  assert.equal(html.includes('<script>bad</script>'), false);
  assert.match(html, /@page\{size:A5/);
  assert.match(html, /110mm/);
  const label = documentHtml({ title: 't', body: '', settings: {}, fontUrl: 'file:///f.woff2', mode: 'label' });
  assert.match(label, /@page\{size:89mm 102mm;margin:0\}/);
  assert.match(label, /\.label\+\.label\{break-before:page/);
  assert.equal(label.includes('<header>'), false);
  const small = documentHtml({
    title: 't',
    body: '',
    settings: { labelWidthMm: 50, labelHeightMm: 30 },
    fontUrl: 'f',
    mode: 'label',
  });
  assert.match(small, /@page\{size:50mm 30mm;margin:0\}/);
  assert.throws(() => documentHtml({ title: 't', body: '', settings: { paper: 'A3' } }));
});

test('45x50 label prints only QR even when office branding is enabled', () => {
  const body = cards([{ name: 'أحمد', military_no: '000012345', rank: 'جندي', company: 'الأولى', unit: 'الوحدة' }], ['data:image/png;base64,AA=='], 1, true);
  const html = documentHtml({ title: 'ملصق', body, settings: { labelWidthMm: 45, labelHeightMm: 50, showLogo: true, logo: 'data:image/png;base64,LOGO' }, fontUrl: 'f', mode: 'label' });
  assert.match(html, /@page\{size:45mm 50mm;margin:0\}/);
  assert.equal(html.includes('000012345'), false);
  assert.equal(body.replace(/<[^>]*>/g, ''), '');
  assert.equal(body, '<div class="label"><img src="data:image/png;base64,AA==" alt="QR"></div>');
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.equal(html.includes('base64,LOGO'), false);
});

test('print geometry picks mode, printer and Electron options per document kind', () => {
  const g = require('../desktop/documents/geometry.cjs');
  assert.deepEqual(['qr', 'visitor-qr', 'voucher', 'canteen', 'card', 'report'].map(g.modeOf), [
    'label',
    'label',
    'receipt',
    'receipt',
    'office',
    'memo',
  ]);
  const settings = {
    printer: 'Office',
    labelPrinter: 'XP-246B',
    receiptPrinter: '',
    silentPrint: true,
    labelWidthMm: 60,
    labelHeightMm: 40,
  };
  const label = g.printOptions(g.pageSpec('label', settings), settings);
  assert.deepEqual(label.pageSize, { width: 60000, height: 40000 });
  assert.equal(label.silent, true);
  assert.equal(label.deviceName, 'XP-246B');
  assert.equal(label.margins.marginType, 'none');
  assert.equal(label.scaleFactor, 100);
  assert.equal(label.pagesPerSheet, 1);
  assert.equal(label.duplexMode, 'simplex');
  assert.equal(label.copies, 1);
  assert.equal(g.printOptions(g.pageSpec('receipt', settings, 100), settings).deviceName, 'Office');
  assert.equal(
    g.printOptions(g.pageSpec('office', { ...settings, silentPrint: false }), { ...settings, silentPrint: false })
      .silent,
    false,
  );
  assert.equal(g.printOptions(g.pageSpec('label', {}), {}).silent, false);
  assert.equal(
    g.printOptions(g.pageSpec('label', { labelPrinter: 'XP' }), { labelPrinter: 'XP' }).silent,
    true,
    'labels go directly to the selected printer',
  );
  assert.equal(g.receiptHeightMm(10), 40);
  assert.equal(g.receiptHeightMm(1000), Math.ceil((1000 * 25.4) / 96) + 1);
});

test('A4 reports use the detailed memo furniture and reserve space for signatures', () => {
  const geometry = require('../desktop/documents/geometry.cjs');
  const spec = geometry.pageSpec('memo', { paper: 'A5' });
  assert.equal(spec.paper, 'A4');
  assert.equal(geometry.modeOf('daily-report'), 'memo');
  assert.equal(geometry.printOptions(spec).margins.marginType, 'none');
  const html = documentHtml({ title: 'تقرير', body: '<table><tr><td>بيانات</td></tr></table>', mode: 'memo', settings: { memoRightName: '<script>', memoLeftName: 'القائد', memoLogo: 'data:image/png;base64,TEST' }, fontUrl: 'file:///font' });
  assert.match(html, /مذكرة تفصيلية/);
  assert.match(html, /@page\{size:A4 portrait;margin:0\}/);
  assert.match(html, /\.memo-footer\{position:absolute;/);
  assert.equal(html.includes('position:fixed'), false);
  assert.equal((html.match(/<footer class="memo-footer">/g) || []).length, 1);
  assert.match(html, /memo-watermark/);
  assert.match(html, /memo-signature right/);
  assert.match(html, /memo-signature left/);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(html.includes('<script>'), false);
  assert.equal((html.match(/src="data:image\/png;base64,TEST"/g) || []).length, 2);
});

test('receipt config: defaults, clamping, content box, height modes, copies', () => {
  const g = require('../desktop/documents/geometry.cjs');
  const d = g.receiptConfig({});
  assert.deepEqual(
    [d.widthMm, d.printableMm, d.marginMm, d.contentMm, d.fontPt, d.lineHeight, d.bold, d.showLogo, d.logoMm],
    [80, 72, 1, 70, 11, 1.4, true, true, 20],
  );
  assert.deepEqual([d.heightMode, d.heightMm, d.copies, d.footer, d.topFeedMm, d.bottomFeedMm], ['auto', 150, 1, '', 2, 8]);
  const c = g.receiptConfig({ receiptWidthMm: 58, receiptPrintableWidthMm: 90, receiptMarginMm: 99, receiptFontPt: 2, receiptCopies: 9, receiptFooter: 'x'.repeat(200) });
  assert.equal(c.printableMm, 58, 'printable never exceeds paper');
  assert.equal(c.marginMm, 10);
  assert.equal(c.contentMm, 38);
  assert.equal(c.fontPt, 7);
  assert.equal(c.copies, 3);
  assert.equal(c.footer.length, 120);
  assert.equal(g.receiptConfig({ receiptBold: false }).bold, false);
  // fixed height: used when taller than content, content never clipped
  const fixed = { receiptHeightMode: 'fixed', receiptHeightMm: 150 };
  assert.equal(g.receiptHeightMm(100, fixed), 150);
  assert.equal(g.receiptHeightMm(1000, fixed), Math.ceil((1000 * 25.4) / 96) + 1);
  assert.equal(g.receiptHeightMm(100, { receiptHeightMode: 'auto', receiptHeightMm: 300 }), 40);
  const spec = g.pageSpec('receipt', { receiptWidthMm: 58 }, 123);
  assert.deepEqual([spec.widthMm, spec.heightMm], [58, 123]);
  const xp90 = g.pageSpec('receipt', { receiptWidthMm: 80, receiptPrintableWidthMm: 72 }, 150);
  assert.equal(xp90.widthMm, 72, 'the printed page never exceeds the print head width');
});

test('receipt html: thermal css, content box, footer, bold, no table/colors', () => {
  const { documentHtml, voucher, canteenReceipt, testReceipt } = require('../desktop/documents.cjs');
  const settings = { receiptWidthMm: 80, receiptPrintableWidthMm: 72, receiptMarginMm: 3, receiptFontPt: 12, receiptBold: false, receiptFooter: 'شكرًا لكم', receiptShowLogo: false, unitName: 'وحدة' };
  const receiptData = { name: 'اختبار', at: new Date().toISOString(), amount_cents: 500 };
  assert.match(canteenReceipt(receiptData, 'admin', 1), /أصل الإيصال/);
  assert.match(canteenReceipt(receiptData, 'admin', 2), /نسخة رقم 1/);
  assert.match(canteenReceipt(receiptData, 'admin', 3), /نسخة رقم 2/);
  assert.doesNotMatch(canteenReceipt(receiptData), /نسخة رقم|أصل الإيصال/);
  const html = documentHtml({ title: 't', body: canteenReceipt({ rank: 'جندي', name: 'أ', military_no: '1', company: 'ب', at: new Date().toISOString(), amount_cents: 1250, outlet_name: 'ك' }), settings, fontUrl: 'f', mode: 'receipt' });
  assert.match(html, /#receipt\{width:66mm;margin:0 auto;overflow-wrap:anywhere/);
  assert.match(html, /font-size:12pt/);
  assert.match(html, /font-weight:500/);
  assert.match(html, /@page\{size:72mm auto;margin:0\}/);
  assert.match(html, /<div class="foot">شكرًا لكم<\/div>/);
  assert.equal(html.includes('<img class="logo"'), false);
  assert.equal(html.includes('<table'), false);
  assert.equal(/border-radius:[1-9]|box-shadow:[^n]|background:#(?!fff)/.test(html), false);
  assert.match(html, /<strong>12\.50 ج\.م<\/strong>/);
  assert.match(documentHtml({ title: 't', body: '', settings: { receiptBold: true }, fontUrl: 'f', mode: 'receipt' }), /font-weight:600/);
  assert.match(voucher({ no: 1, rank: 'ر', name: 'ن', military_no: '1', company: 'ج', reason: 'س', exit_at: new Date().toISOString(), expected_return: new Date().toISOString() }), /class="r"/);
  const cal = testReceipt({ receiptWidthMm: 80, receiptPrintableWidthMm: 72 }, 'data:image/png;base64,AA');
  assert.match(cal, /<svg width="72mm"/);
  assert.match(cal, /<rect x="0" y="11" width="72"/);
  assert.match(cal, /الورق: 80 مم · الطباعة: 72 مم/);
  assert.match(cal, /class="qr"/);
});
