'use strict';

/** مصدر واحد لتعريف التقارير — يُستخدم في الخادم، التصدير، والكتالوج. */
const REPORT_IDS = ['soldiers', 'gate', 'visitor', 'canteen', 'buffet', 'fitness'];

const REPORT_META = {
  soldiers: {
    title: 'قائمة العسكريين',
    short: 'العسكريون',
    hint: 'بحث بالاسم أو الرقم العسكري والسرية. لا يُستخدم نطاق التاريخ — يعرض كل الأفراد المطابقين.',
    filters: { fromTo: false, company: true, q: true, outlet: false },
    clerk: false,
  },
  gate: {
    title: 'حركات البوابة',
    short: 'البوابة',
    hint: 'خروج ودخول مرتبط بالتصاريح في الفترة المحددة؛ يظهر سبب التصحيح إن وُجد.',
    filters: { fromTo: true, company: true, q: true, outlet: false },
    clerk: false,
  },
  visitor: {
    title: 'زيارات الزوار',
    short: 'الزوار',
    hint: 'زيارات مسجّلة في الفترة؛ البحث بالاسم، البطاقة، الجهة، أو «جاي ليه».',
    filters: { fromTo: true, company: false, q: true, outlet: false },
    clerk: false,
  },
  canteen: {
    title: 'حركات الكانتين',
    short: 'الكانتين',
    hint: 'مشتريات وتصحيحات الكانتين؛ اختر كانتينًا محددًا أو الكل. الإجمالي يشمل العكسيات.',
    filters: { fromTo: true, company: true, q: true, outlet: true, outletKind: 'canteen' },
    clerk: true,
  },
  buffet: {
    title: 'حركات البوفيه',
    short: 'البوفيه',
    hint: 'مثل الكانتين لكن لنقاط البوفيه.',
    filters: { fromTo: true, company: true, q: true, outlet: true, outletKind: 'buffet' },
    clerk: true,
  },
  fitness: {
    title: 'سجل اللياقة',
    short: 'اللياقة',
    hint: 'نتائج الاختبارات ضمن تواريخ الاختبار (وليس وقت التسجيل).',
    filters: { fromTo: true, company: true, q: true, outlet: false },
    clerk: false,
  },
};

const UI_COLUMNS = {
  soldiers: [
    ['name', 'الاسم'],
    ['military_no', 'الرقم العسكري'],
    ['rank', 'الرتبة'],
    ['company', 'السرية'],
    ['status', 'الحالة'],
    ['archived', 'مؤرشف'],
  ],
  gate: [
    ['name', 'العسكري'],
    ['military_no', 'الرقم'],
    ['kind', 'الحركة'],
    ['at', 'الوقت'],
    ['reason', 'سبب الخروج'],
    ['notes', 'ملاحظات الحركة'],
    ['correction_reason', 'تصحيح'],
  ],
  canteen: [
    ['outlet_name', 'الكانتين'],
    ['name', 'العسكري'],
    ['at', 'الوقت'],
    ['amount_cents', 'المبلغ'],
    ['notes', 'ملاحظات'],
  ],
  buffet: [
    ['outlet_name', 'البوفيه'],
    ['name', 'العسكري'],
    ['at', 'الوقت'],
    ['amount_cents', 'المبلغ'],
    ['notes', 'ملاحظات'],
  ],
  fitness: [
    ['name', 'العسكري'],
    ['date', 'التاريخ'],
    ['type', 'الاختبار'],
    ['value', 'النتيجة'],
    ['unit', 'الوحدة'],
  ],
  visitor: [
    ['category_name', 'الفئة'],
    ['name', 'الزائر'],
    ['badge_no', 'البطاقة'],
    ['purpose', 'سبب الزيارة'],
    ['at', 'الدخول'],
    ['check_out', 'الخروج'],
  ],
};

const EXPORT_FIELDS = {
  soldiers: ['name', 'military_no', 'national_id', 'rank', 'company', 'unit', 'status', 'archived'],
  gate: [
    'name',
    'military_no',
    'company',
    'kind',
    'at',
    'no',
    'reason',
    'notes',
    'expected_return',
    'returned_at',
    'voided',
    'correction_reason',
  ],
  canteen: ['outlet_name', 'name', 'military_no', 'company', 'at', 'amount_cents', 'notes', 'reversal_of'],
  buffet: ['outlet_name', 'name', 'military_no', 'company', 'at', 'amount_cents', 'notes', 'reversal_of'],
  fitness: ['name', 'military_no', 'company', 'date', 'type', 'value', 'raw_result', 'unit', 'notes'],
  visitor: ['category_name', 'name', 'badge_no', 'organization', 'purpose', 'at', 'check_out', 'entry_notes'],
};

const EXPORT_LABELS = {
  outlet_name: 'النقطة',
  organization: 'الجهة',
  entry_notes: 'ملاحظات الدخول',
  check_out: 'وقت الخروج',
};

const EXPORT_TITLES = {
  soldiers: 'قائمة العسكريين',
  gate: 'حركات البوابة',
  visitor: 'زيارات الزوار',
  canteen: 'حركات الكانتين',
  buffet: 'حركات البوفيه',
  fitness: 'سجل اللياقة',
};

function reportTypesForRole(role) {
  return REPORT_IDS.filter((id) => (role === 'clerk' ? REPORT_META[id].clerk : true));
}

function catalogForClient(role) {
  const allowed = new Set(reportTypesForRole(role));
  return REPORT_IDS.filter((id) => allowed.has(id)).map((id) => ({
    id,
    title: REPORT_META[id].title,
    short: REPORT_META[id].short,
    hint: REPORT_META[id].hint,
    filters: REPORT_META[id].filters,
    columns: UI_COLUMNS[id],
  }));
}

function assertReportType(type) {
  if (!REPORT_IDS.includes(type)) {
    const err = new Error('نوع تقرير غير صالح');
    err.status = 400;
    throw err;
  }
}

function summarizeReport(type, rows) {
  if (type === 'soldiers') {
    let inside = 0;
    let outside = 0;
    let archived = 0;
    for (const r of rows) {
      if (r.archived) archived++;
      else if (r.status === 'in') inside++;
      else outside++;
    }
    return { rows: rows.length, inside, outside, archived };
  }
  if (type === 'gate') {
    let entries = 0;
    let exits = 0;
    let corrected = 0;
    for (const r of rows) {
      if (r.kind === 'entry') entries++;
      else exits++;
      if (r.correction_reason) corrected++;
    }
    return { rows: rows.length, entries, exits, corrected };
  }
  if (type === 'visitor') {
    let open = 0;
    for (const r of rows) if (!r.check_out) open++;
    return { rows: rows.length, openVisits: open, completed: rows.length - open };
  }
  if (type === 'canteen' || type === 'buffet') {
    let totalCents = 0;
    let reversals = 0;
    for (const r of rows) {
      totalCents += r.amount_cents;
      if (r.reversal_of || r.amount_cents < 0) reversals++;
    }
    return { rows: rows.length, totalCents, reversals };
  }
  if (type === 'fitness') return { rows: rows.length };
  return { rows: rows.length };
}

module.exports = {
  REPORT_IDS,
  REPORT_META,
  UI_COLUMNS,
  EXPORT_FIELDS,
  EXPORT_LABELS,
  EXPORT_TITLES,
  reportTypesForRole,
  catalogForClient,
  assertReportType,
  summarizeReport,
};
