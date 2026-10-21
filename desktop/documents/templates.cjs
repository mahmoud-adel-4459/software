'use strict';
/** HTML bodies of each printable document (wrapped later by page.cjs). All values are escaped. */
const { EXPORT_FIELDS, EXPORT_TITLES } = require('../../shared/reports.cjs');
const { esc, LABELS, cell, money } = require('./format.cjs');
const { receiptConfig } = require('./geometry.cjs');

const join = (parts) => parts.join('');

// ---- Thermal receipt building blocks (flex lines, no tables/borders; styled in page.cjs) ----
/** `label … value` line; empty values are skipped. */
const line = (label, value) =>
  value === '' || value == null ? '' : `<div class="r"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;
const sep = '<hr class="sep">';
const signLine = (label) => `<span>${esc(label)}<i></i></span>`;

// ---- Detailed report table -----------------------------------------------------------------

function reportTable(report) {
  const fields = EXPORT_FIELDS[report.type];
  if (!fields) throw new Error('نوع التقرير غير صالح');
  const title = EXPORT_TITLES[report.type] || report.type;
  const period =
    report.type === 'soldiers' ? 'بدون فلتر تاريخ — حسب البحث والسرية' : `${esc(report.from)} — ${esc(report.to)}`;
  const head = fields.map((key) => `<th>${esc(LABELS[key] || key)}</th>`).join('');
  const body = report.rows
    .map((row) => `<tr>${fields.map((key) => `<td>${esc(cell(key, row[key]))}</td>`).join('')}</tr>`)
    .join('');
  const total = report.totalCents == null ? '' : `<p>الإجمالي: ${money(report.totalCents)} ج.م</p>`;
  return join([
    `<h2>${esc(title)}</h2><p>${period} · ${report.rows.length} سجل</p>`,
    `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${total}`,
  ]);
}

// ---- Soldier QR labels and ID cards --------------------------------------------------------

/** One sticker: QR + name + number + one small line (`rank`/category and `sub`). */
function labelBox({ qr, name, rank, no, sub }) {
  return join([
    `<div class="label"><img src="${qr}" alt="QR"><div class="label-text"><strong>${esc(name)}</strong>`,
    rank ? `<span class="label-rank">${esc(rank)}</span>` : '',
    `<span class="label-no">${esc(no)}</span>`,
    sub ? `<span class="label-unit">${esc(sub)}</span>` : '',
    '</div></div>',
  ]);
}

const qrLabel = (soldier, qr) =>
  labelBox({
    qr,
    name: soldier.name,
    rank: soldier.rank,
    no: soldier.military_no,
    sub: `${soldier.company} · ${soldier.unit}`,
  });

const visitorLabel = (visitor, qr) =>
  labelBox({ qr, name: visitor.name, rank: visitor.category_name, no: visitor.badge_no, sub: '' });

/** Visitor QR stickers; `qr[i]` belongs to `visitors[i]`, each repeated `copies` times. */
function visitorLabels(visitors, qr, copies = 1) {
  return visitors.flatMap((v, i) => Array.from({ length: copies }, () => visitorLabel(v, qr[i]))).join('');
}

/** Small sample label / receipt / sheet used by «طباعة اختبارية». */
function testLabel(qr) {
  return labelBox({
    qr,
    name: 'اختبار الطباعة',
    rank: 'ملصق QR',
    no: 'TEST-0001',
    sub: new Date().toLocaleString('ar-EG'),
  });
}
/**
 * Calibration receipt: ruler across the PAPER width (mm ticks, label every 10 mm), the printable
 * rectangle, edge markers, font samples, current settings and a QR sample. Everything in the SVG is
 * in millimetres, so a visible clipping of the ruler/rectangle tells the user what to adjust.
 */
function testReceipt(settings = {}, qr = '') {
  const cfg = receiptConfig(settings);
  const W = cfg.widthMm;
  const pw = cfg.printableMm;
  const x0 = (W - pw) / 2;
  const cx0 = (W - cfg.contentMm) / 2;
  const H = 22;
  const ticks = [];
  for (let mm = 0; mm <= W; mm++) {
    const x = Math.min(Math.max(mm, 0.15), W - 0.15);
    const len = mm % 10 === 0 ? 5 : mm % 5 === 0 ? 3.5 : 2;
    ticks.push(`<line x1="${x}" y1="0" x2="${x}" y2="${len}" stroke="#000" stroke-width="${mm % 10 === 0 ? 0.35 : 0.2}"/>`);
    if (mm % 10 === 0 && mm < W)
      ticks.push(`<text x="${Math.min(Math.max(mm, 2.2), W - 2.2)}" y="9" font-size="3" text-anchor="middle" fill="#000">${mm}</text>`);
  }
  const svg =
    `<svg width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">` +
    ticks.join('') +
    `<rect x="${x0}" y="11" width="${pw}" height="9" fill="none" stroke="#000" stroke-width="0.4"/>` +
    `<rect x="${cx0}" y="12.2" width="${cfg.contentMm}" height="6.6" fill="none" stroke="#000" stroke-width="0.2" stroke-dasharray="1 0.8"/>` +
    `<rect x="0" y="10" width="1.2" height="11" fill="#000"/><rect x="${W - 1.2}" y="10" width="1.2" height="11" fill="#000"/>` +
    `<text x="2.4" y="14.6" font-size="2.6" fill="#000">L يسار</text>` +
    `<text x="${W - 2.4}" y="14.6" font-size="2.6" text-anchor="end" fill="#000">يمين R</text>` +
    `<text x="${W / 2}" y="17.2" font-size="2.6" text-anchor="middle" fill="#000">${pw} mm</text>` +
    '</svg>';
  const lines = [
    `الورق: ${W} مم · الطباعة: ${pw} مم`,
    `الهامش: ${cfg.marginMm} مم · المحتوى: ${cfg.contentMm} مم`,
    `الخط: ${cfg.fontPt} نقطة · التباعد: ${cfg.lineHeight} · ${cfg.bold ? 'عريض' : 'عادي'}`,
    `الارتفاع: ${cfg.heightMode === 'fixed' ? cfg.heightMm + ' مم (ثابت)' : 'تلقائي'} · نسخ: ${cfg.copies}`,
  ];
  return join([
    '<div class="cal">',
    svg,
    '<div class="box">',
    '<h2>معايرة طابعة الإيصالات</h2>',
    `<div class="t s1">نص صغير 7pt — ABC abc 0123456789</div>`,
    `<div class="t s2">نص متوسط 10pt — ABC abc 0123456789</div>`,
    `<div class="t s3">نص كبير 14pt — ABC 0123</div>`,
    '<div class="t">الجيش المصري — اختبار طباعة الإيصال العربي بخط واضح</div>',
    sep,
    lines.map((l) => `<div class="t">${esc(l)}</div>`).join(''),
    sep,
    qr ? `<img class="qr" src="${esc(qr)}" alt="QR">` : '',
    `<div class="t">${esc(cell('at', new Date().toISOString()))}</div>`,
    '<div class="t">إذا قُصّ أي طرف من المسطرة فقلل «منطقة الطباعة».</div>',
    '</div></div>',
  ]);
}
function testOffice() {
  return `<h2>طباعة اختبارية</h2><p>إذا ظهرت هذه الصفحة كاملة فالإعداد صحيح.</p><p>${esc(new Date().toLocaleString('ar-EG'))}</p>`;
}

function idCard(soldier, qr) {
  return join([
    `<section class="card"><img src="${qr}" alt="QR"><div><strong>${esc(soldier.rank)} / ${esc(soldier.name)}</strong>`,
    `<p>الرقم: ${esc(soldier.military_no)}</p><p>${esc(soldier.company)} · ${esc(soldier.unit)}</p></div></section>`,
  ]);
}

/** `qr[i]` is the QR data-URL of `soldiers[i]`; every soldier is repeated `copies` times. */
function cards(soldiers, qr, copies = 1, labels = false) {
  const render = labels ? qrLabel : idCard;
  return soldiers.flatMap((soldier, i) => Array.from({ length: copies }, () => render(soldier, qr[i]))).join('');
}

// ---- Gate permit ---------------------------------------------------------------------------

function permitStatus(permit) {
  if (permit.voided) return 'هذا الإذن ملغى';
  if (permit.returned_at) return 'إذن مكتمل — عاد العسكري إلى الوحدة';
  return 'إذن نشط — العسكري خارج الوحدة';
}

function voucher(permit) {
  const entered = permit.returned_at ? cell('returned_at', permit.returned_at) : 'لم يسجل الدخول بعد';
  return join([
    `<section class="rcpt"><h2>إذن خروج ودخول رقم ${esc(permit.no)}</h2>`,
    `<div class="t"><strong>${esc(permit.rank)} / ${esc(permit.name)}</strong></div>`,
    sep,
    line('الرقم العسكري', permit.military_no),
    line('السرية', permit.company),
    line('سبب الخروج', permit.reason),
    sep,
    line('وقت الخروج', cell('at', permit.exit_at)),
    line('العودة المتوقعة', cell('expected_return', permit.expected_return)),
    line('الدخول الفعلي', entered),
    sep,
    `<div class="t"><strong>${esc(permitStatus(permit))}</strong></div>`,
    `<div class="sign">${signLine('مسؤول الخروج')}${signLine('مسؤول الدخول')}${signLine('ختم الوحدة')}</div></section>`,
  ]);
}

// ---- Canteen -------------------------------------------------------------------------------

function receiptStatus(t, isReversal) {
  if (isReversal) return 'حركة عكسية / تصحيح';
  if (t.reversed_by) return 'تم عكس هذه العملية';
  return t.amount_cents > 0 ? 'مشتريات كانتين' : '';
}

function canteenReceipt(t) {
  const isReversal = t.amount_cents < 0 || t.reversal_of;
  const place = t.outlet_name || 'الكانتين';
  const status = receiptStatus(t, isReversal);
  return join([
    `<section class="rcpt"><h2>${esc(isReversal ? `إيصال تصحيح — ${place}` : `إيصال ${place}`)}</h2>`,
    `<div class="t"><strong>${esc(t.rank)} / ${esc(t.name)}</strong></div>`,
    sep,
    line('الرقم العسكري', t.military_no),
    line('السرية', t.company),
    line('التاريخ', cell('at', t.at)),
    `<div class="amt"><span class="k">المبلغ</span><strong>${money(Math.abs(t.amount_cents))} ج.م</strong></div>`,
    line('ملاحظات', t.notes),
    status ? `<div class="t">${esc(status)}</div>` : '',
    line('مسؤول التسجيل', t.cashier),
    `<div class="sign">${signLine('توقيع العسكري')}${signLine('توقيع الكاشير')}</div></section>`,
  ]);
}

function canteenStatement({ soldier, transactions, totalCents, month }) {
  const rows = (transactions || [])
    .map(
      (r) =>
        `<tr><td>${esc(cell('at', r.at))}</td><td>${esc(cell('amount_cents', r.amount_cents))}</td><td>${esc(r.notes || '')}</td></tr>`,
    )
    .join('');
  return join([
    `<section class="voucher canteen-statement"><h2>كشف حساب الكانتين — ${esc(month)}</h2>`,
    `<p>${esc(soldier.rank)} / ${esc(soldier.name)}</p>`,
    `<p>الرقم العسكري: ${esc(soldier.military_no)} · السرية: ${esc(soldier.company)}</p>`,
    '<table><thead><tr><th>التاريخ</th><th>المبلغ (ج.م)</th><th>ملاحظات</th></tr></thead>',
    `<tbody>${rows || '<tr><td colspan="3">لا توجد حركات</td></tr>'}</tbody></table>`,
    `<p>إجمالي الشهر: <strong>${money(totalCents || 0)} ج.م</strong></p></section>`,
  ]);
}

// ---- Daily report --------------------------------------------------------------------------

const row = (cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;

function section(title, head, rows) {
  const headCells = head.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows.length ? rows.join('') : `<tr><td colspan="${head.length}">—</td></tr>`;
  return `<h2>${esc(title)}</h2><table><thead><tr>${headCells}</tr></thead><tbody>${body}</tbody></table>`;
}

function dailyReportHtml(report) {
  if (!report) throw new Error('لا توجد بيانات للتقرير اليومي');
  const { soldiers: s, permits: p } = report.snapshot;
  const { gate: g, visitors: v, canteen: cn, buffet: bf, fitness: ft } = report.activity;
  const foodRow = (r) => row([cell('at', r.at), r.name, cell('amount_cents', r.amount_cents), r.notes || '']);
  const foodHead = ['الوقت', 'العسكري', 'المبلغ', 'ملاحظات'];
  return [
    `<h1>التقرير اليومي الشامل — ${esc(report.unit.name)}</h1>` +
      `<p>${esc(report.unit.parentFormation || '')} · ${esc(report.date)} · ${esc(cell('at', report.generatedAt))}</p>`,
    `<p><strong>الأفراد:</strong> نشط ${s.total} (داخل ${s.inside} · خارج ${s.outside}) · مؤرشف ${s.archived} · تصاريح خارج ${p.activeOutside} (متأخر ${p.late})</p>`,
    `<p><strong>نشاط اليوم:</strong> بوابة ${g.total} (دخول ${g.entries} · خروج ${g.exits}) · زوار ${v.checkIns} · كانتين ${money(cn.totalCents)} ج.م (${cn.transactions}) · بوفيه ${money(bf.totalCents)} ج.م (${bf.transactions}) · لياقة ${ft.records}</p>`,
    section(
      'السرية — أفراد نشطون',
      ['السرية', 'العدد'],
      s.byCompany.map((c) => row([c.company, c.count])),
    ),
    section(
      'أسباب الخروج',
      ['السبب', 'مرات'],
      g.byReason.map((r) => row([r.reason, r.count])),
    ),
    section(
      'حركات البوابة',
      ['الوقت', 'العسكري', 'الحركة', 'السبب'],
      g.recent.slice(0, 40).map((r) => row([cell('at', r.at), r.name, r.kind === 'entry' ? 'دخول' : 'خروج', r.reason])),
    ),
    section(
      'زوار',
      ['الدخول', 'الاسم', 'الفئة', 'الغرض'],
      v.recent.slice(0, 40).map((r) => row([cell('at', r.at), r.name, r.category_name, r.purpose])),
    ),
    section('كانتين', foodHead, cn.recent.slice(0, 40).map(foodRow)),
    section('بوفيه', foodHead, bf.recent.slice(0, 40).map(foodRow)),
  ].join('\n  ');
}

module.exports = {
  reportTable,
  cards,
  visitorLabels,
  testLabel,
  testReceipt,
  testOffice,
  voucher,
  canteenReceipt,
  canteenStatement,
  dailyReportHtml,
};
