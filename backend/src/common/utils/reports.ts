/** Single definition of the report types: used by the API catalog and the report builders. */
export const REPORT_IDS = ['soldiers', 'gate', 'visitor', 'canteen', 'buffet', 'fitness'] as const;
export type ReportId = (typeof REPORT_IDS)[number];

interface ReportMeta {
  title: string;
  short: string;
  hint: string;
  filters: { fromTo: boolean; company: boolean; q: boolean; outlet: boolean; outletKind?: string };
  clerk: boolean;
}

const REPORT_META: Record<ReportId, ReportMeta> = {
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

const UI_COLUMNS: Record<ReportId, [string, string][]> = {
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

/** Report types visible to a role (cashiers only see canteen/buffet). */
export function catalogForClient(role: string) {
  return REPORT_IDS.filter((id) => (role === 'clerk' ? REPORT_META[id].clerk : true)).map((id) => ({
    id,
    title: REPORT_META[id].title,
    short: REPORT_META[id].short,
    hint: REPORT_META[id].hint,
    filters: REPORT_META[id].filters,
    columns: UI_COLUMNS[id],
  }));
}

export type ReportRow = Record<string, unknown>;

/** Aggregates the rows of a report into the summary block shown above the table. */
export function summarizeReport(type: ReportId, rows: ReportRow[]): Record<string, number> {
  const count = (predicate: (row: ReportRow) => boolean) => rows.filter(predicate).length;
  if (type === 'soldiers') {
    const archived = count((r) => Boolean(r.archived));
    const inside = count((r) => !r.archived && r.status === 'in');
    return { rows: rows.length, inside, outside: rows.length - archived - inside, archived };
  }
  if (type === 'gate') {
    const entries = count((r) => r.kind === 'entry');
    return {
      rows: rows.length,
      entries,
      exits: rows.length - entries,
      corrected: count((r) => Boolean(r.correction_reason)),
    };
  }
  if (type === 'visitor') {
    const open = count((r) => !r.check_out);
    return { rows: rows.length, openVisits: open, completed: rows.length - open };
  }
  if (type === 'canteen' || type === 'buffet') {
    return {
      rows: rows.length,
      totalCents: rows.reduce((sum, r) => sum + Number(r.amount_cents), 0),
      reversals: count((r) => Boolean(r.reversal_of) || Number(r.amount_cents) < 0),
    };
  }
  return { rows: rows.length };
}
