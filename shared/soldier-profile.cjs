'use strict';

/** Gate + QR field order (Arabic labels). */
const GATE_PROFILE_ROWS = [
  { key: 'rank', label: 'الدرجة', column: true },
  { key: 'name', label: 'الاسم', column: true },
  { key: 'military_no', label: 'الرقم العسكري', column: true },
  { key: 'cardNo', label: 'رقم البطاقة', detail: true },
  { key: 'unit', label: 'الوحدة', column: true },
  { key: 'originalUnit', label: 'الوحدة الأصلية', detail: true },
  { key: 'company', label: 'السرية', column: true },
  { key: 'specialty', label: 'التخصص', detail: true },
  { key: 'address', label: 'العنوان المدني', column: true },
  { key: 'enlistDate', label: 'تاريخ التجنيد', detail: true, date: true },
  { key: 'dischargeDate', label: 'تاريخ التسريح', detail: true, date: true },
  { key: 'weaponNo', label: 'رقم السلاح', detail: true },
  { key: 'unitJoinDate', label: 'تاريخ الضم على الوحدة', detail: true, date: true },
  { key: 'phone', label: 'رقم الهاتف', column: true },
  { key: 'height', label: 'الطول', detail: true },
  { key: 'weight', label: 'الوزن', detail: true },
  { key: 'age', label: 'العمر', detail: true },
  { key: 'offDutyJob', label: 'الوظيفة خارج الوحدة', detail: true },
];

const DETAIL_FIELD_KEYS = [
  'cardNo',
  'originalUnit',
  'specialty',
  'enlistDate',
  'dischargeDate',
  'weaponNo',
  'unitJoinDate',
  'birthDate',
  'height',
  'weight',
  'age',
  'offDutyJob',
];

const PHOTO_KINDS = ['photo', 'idPhoto', 'carnetFront', 'carnetBack'];
const PHOTO_KIND_LABELS = {
  photo: 'صورة 4×6',
  idPhoto: 'صورة البطاقة',
  carnetFront: 'الكارنيه العسكري — الوجه',
  carnetBack: 'الكارنيه العسكري — الظهر',
};
const GATE_READABLE_ATTACHMENTS = ['photo', 'idPhoto', 'carnetFront', 'carnetBack', 'tagPhoto'];

function parseDetails(raw) {
  if (!raw || typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function computeAge(birthDate) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return '';
  const born = new Date(`${birthDate}T12:00:00`);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return age > 0 && age < 120 ? String(age) : '';
}

function fieldValue(soldier, row) {
  const details = parseDetails(soldier.details);
  if (row.key === 'age') {
    return details.age || computeAge(details.birthDate) || '';
  }
  if (row.detail) return details[row.key] ?? '';
  return soldier[row.key] ?? '';
}

function gateProfileRows(soldier) {
  return GATE_PROFILE_ROWS.map((row) => ({
    label: row.label,
    value: fieldValue(soldier, row) || '—',
  }));
}

function buildQrPayload(soldier) {
  // Digits only: USB scanners act as a keyboard and corrupt JSON/Arabic characters.
  return String(soldier.military_no);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildVisitorQrPayload(visitor) {
  return String(visitor.id);
}

function parseGateScan(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!text) return { kind: 'none' };
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text);
      if (data.t === 'visitor' && typeof data.id === 'string' && UUID_RE.test(data.id)) {
        return { kind: 'visitor', id: data.id };
      }
      const mn = String(data.mn || data.military_no || data.militaryNo || '').trim();
      if (mn) return { kind: 'soldier', militaryNo: mn };
    } catch {
      const m = /"mn"\s*:\s*"(\d{6,30})"/.exec(text);
      if (m) return { kind: 'soldier', militaryNo: m[1] };
    }
  }
  if (UUID_RE.test(text)) return { kind: 'visitor', id: text };
  return { kind: 'soldier', militaryNo: text };
}

function parseQrScan(raw) {
  const scan = parseGateScan(raw);
  if (scan.kind === 'soldier') return scan.militaryNo;
  return '';
}

module.exports = {
  GATE_PROFILE_ROWS,
  DETAIL_FIELD_KEYS,
  PHOTO_KINDS,
  PHOTO_KIND_LABELS,
  GATE_READABLE_ATTACHMENTS,
  parseDetails,
  gateProfileRows,
  buildQrPayload,
  buildVisitorQrPayload,
  parseGateScan,
  parseQrScan,
  computeAge,
};
