'use strict';
/** HTML bodies of each printable document (wrapped later by page.cjs). All values are escaped. */
const { EXPORT_FIELDS, EXPORT_TITLES } = require('../../shared/reports.cjs');
const { esc, LABELS, cell, money } = require('./format.cjs');
const { receiptConfig } = require('./geometry.cjs');

const join = (parts) => parts.join('');
/** "رقيب / أحمد": the rank, or the grade for files saved before ranks existed. */
const titled = (s) => `${esc(s.military_rank || s.rank)} / ${esc(s.name)}`;

// ---- Thermal receipt building blocks (flex lines, no tables/borders; styled in page.cjs) ----
/** `label … value` line; empty values are skipped. */
const line = (label, value) =>
  value === '' || value == null
    ? ''
    : `<div class="r"><span class="k">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;
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

/** One sticker contains only the QR image. */
function labelBox({ qr }) {
  return `<div class="label"><img src="${esc(qr)}" alt="QR"></div>`;
}

const qrLabel = (_soldier, qr) => labelBox({ qr });
const visitorLabel = (_visitor, qr) => labelBox({ qr });

/** Visitor QR stickers; `qr[i]` belongs to `visitors[i]`, each repeated `copies` times. */
function visitorLabels(visitors, qr, copies = 1) {
  return visitors.flatMap((v, i) => Array.from({ length: copies }, () => visitorLabel(v, qr[i]))).join('');
}

/** Small sample label / receipt / sheet used by «طباعة اختبارية». */
function testLabel(qr) {
  return labelBox({ qr });
}
/**
 * Calibration receipt: ruler across the PAPER width (mm ticks, label every 10 mm), the printable
 * rectangle, edge markers, font samples, current settings and a QR sample. Everything in the SVG is
 * in millimetres, so a visible clipping of the ruler/rectangle tells the user what to adjust.
 */
function testReceipt(settings = {}, qr = '') {
  const cfg = receiptConfig(settings);
  const pw = cfg.printableMm;
  const W = pw;
  const x0 = 0;
  const cx0 = (W - cfg.contentMm) / 2;
  const H = 22;
  const ticks = [];
  for (let mm = 0; mm <= W; mm++) {
    const x = Math.min(Math.max(mm, 0.15), W - 0.15);
    const len = mm % 10 === 0 ? 5 : mm % 5 === 0 ? 3.5 : 2;
    ticks.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${len}" stroke="#000" stroke-width="${mm % 10 === 0 ? 0.35 : 0.2}"/>`,
    );
    if (mm % 10 === 0 && mm < W)
      ticks.push(
        `<text x="${Math.min(Math.max(mm, 2.2), W - 2.2)}" y="9" font-size="3" text-anchor="middle" fill="#000">${mm}</text>`,
      );
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
    `الورق: ${cfg.widthMm} مم · الطباعة: ${pw} مم`,
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
    `<section class="card"><img src="${qr}" alt="QR"><div><strong>${titled(soldier)}</strong>`,
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

function voucher(permit, printedBy = '') {
  const entered = permit.returned_at ? cell('returned_at', permit.returned_at) : 'لم يسجل الدخول بعد';
  return join([
    `<section class="rcpt"><h2>إذن خروج ودخول رقم ${esc(permit.no)}</h2>`,
    `<div class="t"><strong>${titled(permit)}</strong></div>`,
    sep,
    line('الرقم العسكري', permit.military_no),
    line('السرية', permit.company),
    line('سبب الخروج', permit.reason),
    sep,
    line('وقت الخروج', cell('at', permit.exit_at)),
    line('العودة المتوقعة', cell('expected_return', permit.expected_return)),
    line('الدخول الفعلي', entered),
    line('ملاحظات الخروج', permit.notes),
    line('ملاحظات الدخول', permit.entry_notes),
    sep,
    `<div class="t"><strong>${esc(permitStatus(permit))}</strong></div>`,
    `<div class="sign">${signLine('مسؤول الخروج')}${signLine('مسؤول الدخول')}${signLine('ختم الوحدة')}</div>`,
    line('طُبع بواسطة', printedBy),
    '</section>',
  ]);
}

// ---- Canteen -------------------------------------------------------------------------------

const outletWord = (kind) => (kind === 'buffet' ? 'بوفيه' : 'كانتين');

function receiptStatus(t, isReversal) {
  if (isReversal) return 'حركة عكسية / تصحيح';
  if (t.reversed_by) return 'تم عكس هذه العملية';
  return t.amount_cents > 0 ? `مشتريات ${outletWord(t.outlet_kind)}` : '';
}

const transactionState = (t) => (t.reversal_of ? 'حركة عكسية' : t.reversed_by ? 'تم عكسها' : 'سارية');

function canteenReceipt(t, printedBy = '', printNumber = 0) {
  const isReversal = t.amount_cents < 0 || t.reversal_of;
  const place = t.outlet_name || `ال${outletWord(t.outlet_kind)}`;
  const status = receiptStatus(t, isReversal);
  return join([
    `<section class="rcpt"><h2>${esc(isReversal ? `إيصال تصحيح — ${place}` : `إيصال ${place}`)}</h2>`,
    printNumber > 0
      ? `<div class="t"><strong>${printNumber === 1 ? 'أصل الإيصال' : `نسخة رقم ${esc(printNumber - 1)}`}</strong></div>`
      : '',
    `<div class="t"><strong>${titled(t)}</strong></div>`,
    sep,
    line('الرقم العسكري', t.military_no),
    line('السرية', t.company),
    line('الوحدة', t.unit),
    line('التاريخ', cell('at', t.at)),
    `<div class="amt"><span class="k">المبلغ</span><strong>${money(Math.abs(t.amount_cents))} ج.م</strong></div>`,
    line('ملاحظات', t.notes),
    status ? `<div class="t">${esc(status)}</div>` : '',
    line('مسؤول التسجيل', t.cashier),
    `<div class="sign">${signLine('توقيع العسكري')}${signLine('توقيع الكاشير')}</div>`,
    line('طُبع بواسطة', printedBy),
    '</section>',
  ]);
}

function canteenStatement({ soldier, transactions, totalCents, month, outletName, outletKind }, printedBy = '') {
  const list = transactions || [];
  const rows = list
    .map(
      (r) =>
        `<tr><td>${esc(cell('at', r.at))}</td><td>${esc(cell('amount_cents', r.amount_cents))}</td><td>${esc(r.notes || '')}</td><td>${esc(transactionState(r))}</td></tr>`,
    )
    .join('');
  const place = outletName || `ال${outletWord(outletKind)}`;
  const unit = soldier.unit ? ` · الوحدة: ${esc(soldier.unit)}` : '';
  return join([
    `<section class="voucher canteen-statement"><h2>كشف حساب ${esc(place)} — <bdi dir="ltr">${esc(month)}</bdi></h2>`,
    `<p>${titled(soldier)}</p>`,
    `<p>الرقم العسكري: ${esc(soldier.military_no)} · السرية: ${esc(soldier.company)}${unit}</p>`,
    '<table><thead><tr><th>التاريخ</th><th>المبلغ (ج.م)</th><th>ملاحظات</th><th>الحالة</th></tr></thead>',
    `<tbody>${rows || '<tr><td colspan="4">لا توجد حركات</td></tr>'}</tbody></table>`,
    `<p>عدد العمليات: ${list.length} · إجمالي الشهر: <strong>${money(totalCents || 0)} ج.م</strong></p>`,
    printedBy
      ? `<p>طُبع بواسطة: <bdi>${esc(printedBy)}</bdi> · <bdi>${esc(cell('at', new Date().toISOString()))}</bdi></p>`
      : '',
    '</section>',
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
  const period = report.period || 'day';
  const title = { day: 'التقرير اليومي الشامل', month: 'التقرير الشهري الشامل', year: 'التقرير السنوي الشامل' }[period];
  const span = period === 'day' ? report.date : `${report.from} — ${report.to}`;
  const personnel = report.activity.personnel || {};
  const timeline = report.activity.gateTimeline || [];
  return [
    `<h1>${title} — ${esc(report.unit.name)}</h1>` +
      `<p>${esc(report.unit.parentFormation || '')} · <bdi dir="ltr">${esc(span)}</bdi> · ${esc(cell('at', report.generatedAt))}</p>`,
    `<p><strong>الأفراد:</strong> نشط ${s.total} (داخل ${s.inside} · خارج ${s.outside}) · مؤرشف ${s.archived} · تصاريح خارج ${p.activeOutside} (متأخر ${p.late})</p>`,
    `<p><strong>نشاط الفترة:</strong> بوابة ${g.total} (دخول ${g.entries} · خروج ${g.exits}) · زوار ${v.checkIns} · كانتين ${money(cn.totalCents)} ج.م (${cn.transactions}) · بوفيه ${money(bf.totalCents)} ج.م (${bf.transactions}) · لياقة ${ft.records}${ft.averageScore == null ? '' : ` (متوسط ${ft.averageScore}% — ${esc(ft.averageGrade || '')})`}</p>`,
    Object.keys(personnel).length
      ? `<p><strong>ملفات العسكريين:</strong> ${Object.entries(personnel)
          .map(([k, n]) => `${esc(PERSONNEL_LABELS[k] || k)} ${n}`)
          .join(' · ')}</p>`
      : '',
    timeline.length
      ? section(
          period === 'month' ? 'حركة البوابة حسب اليوم' : 'حركة البوابة حسب الشهر',
          [period === 'month' ? 'اليوم' : 'الشهر', 'خروج', 'دخول'],
          timeline.filter((t) => t.entries || t.exits).map((t) => row([t.label, t.exits, t.entries])),
        )
      : '',
    ft.byType && ft.byType.length
      ? section(
          'اللياقة حسب الاختبار',
          ['الاختبار', 'عدد النتائج', 'متوسط النسبة'],
          ft.byType.map((t) => row([t.type, t.count, t.averageScore == null ? '—' : `${t.averageScore}%`])),
        )
      : '',
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
  ]
    .filter(Boolean)
    .join('\n  ');
}

// ---- Soldier file --------------------------------------------------------------------------

const PERSONNEL_LABELS = {
  leave: 'الإجازات',
  grant: 'المنح',
  reward: 'المكافآت',
  penalty: 'الجزاءات والغرامات',
  medical: 'الأوامر الطبية',
  medical_affairs: 'الموقف الطبي',
  security_scan: 'المسح الأمني',
  security_report: 'تقرير ضابط أمن الوحدة',
  evaluation: 'التقييم النهائي',
};

const at = (date, time) => (date ? `${date}${time ? ` ${time}` : ''}` : '—');

function recordsSection(category, records) {
  const mine = records.filter((r) => r.category === category);
  if (category === 'security_report' || category === 'security_scan') {
    if (!mine.length) return section(PERSONNEL_LABELS[category], ['التاريخ', 'البيان'], []);
    return (
      `<h2>${esc(PERSONNEL_LABELS[category])}</h2>` +
      mine
        .map(
          (r) =>
            `<p><strong>${esc(r.record_date)} — ${esc(r.title)}</strong>${r.reference ? ` (مرجع: ${esc(r.reference)})` : ''}</p>` +
            `<p style="white-space:pre-line">${esc(r.details || '—')}</p>`,
        )
        .join('')
    );
  }
  const leave = category === 'leave';
  return section(
    PERSONNEL_LABELS[category],
    [
      leave ? 'الخروج' : 'التاريخ',
      leave ? 'العودة' : 'النهاية',
      category === 'evaluation' ? 'التقدير' : 'البيان',
      'المرجع',
      'التفاصيل',
    ],
    mine.map((r) =>
      row([at(r.record_date, r.start_time), at(r.end_date, r.end_time), r.title, r.reference || '—', r.details || '—']),
    ),
  );
}

function evaluationSection(evaluation) {
  if (!evaluation) return '';
  const pct = (v) => (v == null ? '—' : `${v}%`);
  return (
    section(
      'اللياقة البدنية',
      ['الاختبار', 'المعيار', 'آخر نتيجة', 'النسبة'],
      evaluation.tests.map((t) =>
        row([t.name, `${t.target} ${t.unit}`, t.value == null ? '—' : `${t.value} ${t.unit}`, pct(t.score)]),
      ),
    ) +
    `<p><strong>متوسط اللياقة:</strong> ${pct(evaluation.average)} · <strong>التقدير المقترح:</strong> ${esc(evaluation.suggestedGrade || '—')} · ` +
    `<strong>التقدير النهائي:</strong> ${esc(evaluation.finalGrade ? evaluation.finalGrade.grade : 'لم يُحدد')}</p>`
  );
}

/** Soldier file for the memo layout: identity, evaluation and every section — or one section only. */
function soldierFile({ soldier, records = [], evaluation, category, printedBy = '' }) {
  const { gateProfileRows } = require('../../shared/soldier-profile.cjs');
  const identity = gateProfileRows(soldier).filter((r) => r.value && r.value !== '—');
  const pairs = [];
  for (let i = 0; i < identity.length; i += 2) {
    const [a, b] = [identity[i], identity[i + 1]];
    pairs.push(
      `<tr><th>${esc(a.label)}</th><td>${esc(a.value)}</td>${b ? `<th>${esc(b.label)}</th><td>${esc(b.value)}</td>` : '<td colspan="2"></td>'}</tr>`,
    );
  }
  const heading = category ? `${PERSONNEL_LABELS[category]} — ${titled(soldier)}` : `ملف العسكري — ${titled(soldier)}`;
  const used = Object.keys(PERSONNEL_LABELS).filter((c) => records.some((r) => r.category === c));
  const empty = Object.keys(PERSONNEL_LABELS).filter((c) => !used.includes(c));
  const sections = category
    ? [category === 'evaluation' ? evaluationSection(evaluation) : '', recordsSection(category, records)]
    : [
        evaluationSection(evaluation),
        ...used.map((c) => recordsSection(c, records)),
        empty.length
          ? `<p><strong>لا توجد سجلات في:</strong> ${empty.map((c) => esc(PERSONNEL_LABELS[c])).join('، ')}</p>`
          : '',
      ];
  return [
    `<h2>${esc(heading)}</h2>`,
    `<table><tbody>${pairs.join('')}</tbody></table>`,
    ...sections,
    printedBy
      ? `<p>طُبع بواسطة: <bdi>${esc(printedBy)}</bdi> · <bdi>${esc(cell('at', new Date().toISOString()))}</bdi></p>`
      : '',
  ]
    .filter(Boolean)
    .join('\n  ');
}

// ---- Analytic report (report center) -------------------------------------------------------

const MAX_PRINTED_ROWS = 2000;

/** Display text of a report value by column type. */
function typed(value, type) {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return `${Number(value).toFixed(2)} ج.م`;
  if (type === 'percent') return `${value}%`;
  return String(value);
}

function kpiValue(k) {
  if (k.value === null || k.value === undefined) return '—';
  return `${k.value}${k.unit ? ` ${k.unit === '%' ? '%' : k.unit}` : ''}`;
}

function change(k) {
  if (typeof k.value !== 'number' || typeof k.previous !== 'number') return '—';
  const diff = Math.round((k.value - k.previous) * 100) / 100;
  if (diff === 0) return '= بدون تغيير';
  const pct = k.previous ? ` (${Math.round((diff / k.previous) * 1000) / 10}%)` : '';
  return `${diff > 0 ? '▲ +' : '▼ '}${diff}${pct}`;
}

function kpiTable(kpis, compare) {
  const head = ['المؤشر', 'القيمة', ...(compare ? ['الفترة السابقة', 'التغير'] : [])];
  return (
    `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
    kpis
      .map(
        (k) =>
          `<tr><th>${esc(k.label)}</th><td><strong>${esc(kpiValue(k))}</strong></td>` +
          (compare
            ? `<td>${esc(k.previous === undefined || k.previous === null ? '—' : k.previous)}</td><td>${esc(change(k))}</td>`
            : '') +
          '</tr>',
      )
      .join('') +
    '</tbody></table>'
  );
}

function dataTable(table) {
  const cols = table.columns;
  const rows = table.rows.slice(0, MAX_PRINTED_ROWS);
  const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const body = rows.length
    ? rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(typed(r[c.key], c.type))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}">لا توجد بيانات في هذه الفترة</td></tr>`;
  const totals =
    rows.length && cols.some((c) => c.total)
      ? `<tr>${cols
          .map((c, i) => {
            if (c.total)
              return `<th>${esc(typed(Math.round(table.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0) * 100) / 100, c.type))}</th>`;
            return i === 0 ? '<th>الإجمالي</th>' : '<th></th>';
          })
          .join('')}</tr>`
      : '';
  const more =
    table.rows.length > MAX_PRINTED_ROWS
      ? `<p>عُرض أول ${MAX_PRINTED_ROWS} صف من ${table.rows.length}؛ الملف الكامل في Excel.</p>`
      : '';
  return `<h3>${esc(table.title)} <small>(${table.rows.length})</small></h3><table><thead><tr>${head}</tr></thead><tbody>${body}${totals}</tbody></table>${more}`;
}

/** Report center document: header, executive summary, exceptions, then each section's KPIs and tables. */
function analyticReportHtml(report) {
  if (!report || !Array.isArray(report.sections)) throw new Error('لا توجد بيانات للتقرير');
  const compare = Boolean(report.previous);
  const span = report.from === report.to ? report.from : `${report.from} — ${report.to}`;
  return [
    `<h2>${esc(report.title)} — ${esc(report.subject.label)}</h2>`,
    `<p><strong>الفترة:</strong> <bdi dir="ltr">${esc(span)}</bdi> (${report.days} يوم)` +
      (compare
        ? ` · <strong>مقارنة بـ:</strong> <bdi dir="ltr">${esc(report.previous.from)} — ${esc(report.previous.to)}</bdi>`
        : '') +
      ` · <strong>الأقسام:</strong> ${report.sections.length} · أعدّه: ${esc(report.generatedBy)} · ${esc(cell('at', report.generatedAt))}</p>`,
    report.profile ? dataTable({ ...report.profile, title: 'البيانات الأساسية' }) : '',
    `<h2>الملخص التنفيذي</h2>${kpiTable(report.summary, compare)}`,
    report.exceptions.length
      ? `<h2>استثناءات تحتاج انتباه</h2>${report.exceptions.map(dataTable).join('')}`
      : '<p><strong>لا توجد استثناءات تحتاج انتباه في هذه الفترة.</strong></p>',
    ...report.sections.map(
      (s) => `<h2>${esc(s.title)}</h2>${kpiTable(s.kpis, compare)}${s.tables.map(dataTable).join('')}`,
    ),
  ]
    .filter(Boolean)
    .join('\n  ');
}

module.exports = {
  analyticReportHtml,
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
  soldierFile,
};
