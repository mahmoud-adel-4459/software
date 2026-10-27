'use strict';
/** Text helpers shared by every printed/exported document. */
const { EXPORT_LABELS } = require('../../shared/reports.cjs');

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escapes any value (null/undefined become an empty string). */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

/** Arabic column titles by database field name. */
const LABELS = {
  name: 'الاسم',
  military_no: 'الرقم العسكري',
  national_id: 'الرقم القومي',
  rank: 'الدرجة',
  military_rank: 'الرتبة',
  score: 'النسبة %',
  grade: 'التقدير',
  company: 'السرية',
  unit: 'الوحدة',
  sub_unit: 'الوحدة الفرعية',
  phone: 'الهاتف',
  address: 'العنوان',
  status: 'الحالة',
  archived: 'مؤرشف',
  kind: 'الحركة',
  at: 'التاريخ والوقت',
  no: 'التصريح',
  reason: 'السبب',
  expected_return: 'العودة المتوقعة',
  returned_at: 'العودة الفعلية',
  voided: 'تصريح ملغى',
  correction_reason: 'سبب التصحيح',
  amount_cents: 'القيمة بالجنيه',
  reversal_of: 'مرجع التصحيح',
  date: 'تاريخ الاختبار',
  type: 'نوع الاختبار',
  value: 'النتيجة',
  raw_result: 'النتيجة القديمة',
  notes: 'ملاحظات',
  category_name: 'فئة الزائر',
  badge_no: 'رقم البطاقة',
  purpose: 'سبب الزيارة',
  ...EXPORT_LABELS,
};

const DATE_FIELDS = ['at', 'expected_return', 'returned_at', 'check_out'];
const cairoDateTime = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Cents -> "12.34" (no currency). */
const money = (cents) => (Number(cents) / 100).toFixed(2);

/** Display text of one report cell, by field name. */
function cell(key, value) {
  if (value == null) return '';
  if (key === 'amount_cents') return money(value);
  if (key === 'kind') return value === 'entry' ? 'عودة' : 'خروج';
  if (key === 'status') return value === 'in' ? 'داخل الوحدة' : 'خارج الوحدة';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (DATE_FIELDS.includes(key)) return cairoDateTime.format(new Date(value));
  return String(value);
}

module.exports = { esc, LABELS, cell, money };
