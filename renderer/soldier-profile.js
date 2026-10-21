'use strict';
/** Browser mirror of shared/soldier-profile.cjs (keep in sync). */
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
  { key: 'enlistDate', label: 'تاريخ التجنيد', detail: true },
  { key: 'dischargeDate', label: 'تاريخ التسريح', detail: true },
  { key: 'weaponNo', label: 'رقم السلاح', detail: true },
  { key: 'unitJoinDate', label: 'تاريخ الضم على الوحدة', detail: true },
  { key: 'phone', label: 'رقم الهاتف', column: true },
  { key: 'height', label: 'الطول', detail: true },
  { key: 'weight', label: 'الوزن', detail: true },
  { key: 'age', label: 'العمر', detail: true },
  { key: 'offDutyJob', label: 'الوظيفة خارج الوحدة', detail: true },
];
const SOLDIER_DETAIL_FIELDS = {
  cardNo: 'رقم البطاقة',
  originalUnit: 'الوحدة الأصلية',
  specialty: 'التخصص',
  enlistDate: 'تاريخ التجنيد',
  dischargeDate: 'تاريخ التسريح',
  weaponNo: 'رقم السلاح',
  unitJoinDate: 'تاريخ الضم على الوحدة',
  birthDate: 'تاريخ الميلاد',
  height: 'الطول',
  weight: 'الوزن',
  age: 'العمر',
  offDutyJob: 'الوظيفة خارج الوحدة',
};
const SOLDIER_PHOTO_KINDS = [
  ['photo', 'صورة 4×6'],
  ['idPhoto', 'صورة البطاقة'],
  ['carnetFront', 'الكarnet العسكري — الوجه'],
  ['carnetBack', 'الكarnet العسكري — الظهر'],
];
function parseSoldierDetails(raw) {
  if (!raw || typeof raw === 'object') return raw || {};
  try { return JSON.parse(raw); } catch { return {}; }
}
function soldierFieldValue(soldier, row) {
  const details = parseSoldierDetails(soldier.details);
  if (row.key === 'age') return details.age || '';
  if (row.detail) return details[row.key] ?? '';
  return soldier[row.key] ?? '';
}
function gateProfileRows(soldier) {
  return GATE_PROFILE_ROWS.map(row => ({
    label: row.label,
    value: soldierFieldValue(soldier, row) || '—',
  }));
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function buildVisitorQrPayload(visitor) {
  return JSON.stringify({ v: 2, t: 'visitor', id: visitor.id, name: visitor.name, badge: visitor.badge_no });
}
function parseGateScan(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { kind: 'none' };
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text);
      if (data.t === 'visitor' && typeof data.id === 'string' && UUID_RE.test(data.id)) {
        return { kind: 'visitor', id: data.id };
      }
      const mn = String(data.mn || data.military_no || data.militaryNo || '').trim();
      if (mn) return { kind: 'soldier', militaryNo: mn };
    } catch { /* ignore */ }
  }
  if (UUID_RE.test(text)) return { kind: 'visitor', id: text };
  return { kind: 'soldier', militaryNo: text };
}
function parseQrScan(raw) {
  const scan = parseGateScan(raw);
  if (scan.kind === 'soldier') return scan.militaryNo;
  return '';
}
function visitorTierLabel(tier) {
  return ({ normal: 'عادي', special: 'خاص', admin: 'إداري' }[tier] || tier);
}
