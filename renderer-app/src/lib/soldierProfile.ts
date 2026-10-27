import type { AttachmentKind, Soldier, SoldierDetails } from '@/api/types';

/** Gate + QR field order (mirror of shared/soldier-profile.cjs). */
interface Row {
  key: string;
  label: string;
  detail?: boolean;
}
export const GATE_PROFILE_ROWS: Row[] = [
  { key: 'rank', label: 'الدرجة' },
  { key: 'military_rank', label: 'الرتبة' },
  { key: 'name', label: 'الاسم' },
  { key: 'military_no', label: 'الرقم العسكري' },
  { key: 'cardNo', label: 'رقم البطاقة', detail: true },
  { key: 'unit', label: 'الوحدة' },
  { key: 'sub_unit', label: 'الوحدة الفرعية' },
  { key: 'originalUnit', label: 'الوحدة الأصلية', detail: true },
  { key: 'company', label: 'السرية' },
  { key: 'specialty', label: 'التخصص', detail: true },
  { key: 'address', label: 'العنوان المدني' },
  { key: 'enlistDate', label: 'تاريخ التجنيد', detail: true },
  { key: 'dischargeDate', label: 'تاريخ التسريح', detail: true },
  { key: 'weaponNo', label: 'رقم السلاح', detail: true },
  { key: 'unitJoinDate', label: 'تاريخ الضم على الوحدة', detail: true },
  { key: 'phone', label: 'رقم الهاتف' },
  { key: 'height', label: 'الطول', detail: true },
  { key: 'weight', label: 'الوزن', detail: true },
  { key: 'age', label: 'العمر', detail: true },
  { key: 'offDutyJob', label: 'الوظيفة خارج الوحدة', detail: true },
];

export const DETAIL_FIELDS: Record<keyof SoldierDetails, string> = {
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
export const DATE_DETAIL_KEYS = ['enlistDate', 'dischargeDate', 'unitJoinDate', 'birthDate'];
export const NUMBER_DETAIL_KEYS = ['height', 'weight', 'age'];

export const PHOTO_KINDS: [AttachmentKind, string][] = [
  ['photo', 'صورة 4×6'],
  ['idPhoto', 'صورة البطاقة'],
  ['carnetFront', 'الكارنيه العسكري — الوجه'],
  ['carnetBack', 'الكارنيه العسكري — الظهر'],
];
export const ATTACHMENT_LABELS: Record<AttachmentKind, string> = {
  photo: 'صورة 4×6',
  idPhoto: 'صورة البطاقة',
  carnetFront: 'الكارنيه — الوجه',
  carnetBack: 'الكارنيه — الظهر',
  tagPhoto: 'صورة البطاقة المعدنية',
  document: 'مستند',
};

/** Title shown before the name ("رقيب / أحمد"): the rank, or the grade for files saved before ranks existed. */
export const rankTitle = (soldier: Pick<Soldier, 'rank' | 'military_rank'>): string => soldier.military_rank || soldier.rank;

export function parseDetails(raw: Soldier['details']): SoldierDetails {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) as SoldierDetails;
  } catch {
    return {};
  }
}

export function computeAge(birthDate?: string): string {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return '';
  const born = new Date(`${birthDate}T12:00:00`);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return age > 0 && age < 120 ? String(age) : '';
}

/** Label/value pairs in gate order; empty values show an em dash. */
export function gateProfileRows(soldier: Soldier): { label: string; value: string }[] {
  const d = parseDetails(soldier.details);
  return GATE_PROFILE_ROWS.map((row) => {
    let value: unknown;
    if (row.key === 'age') value = d.age || computeAge(d.birthDate);
    else if (row.detail) value = d[row.key as keyof SoldierDetails];
    else value = soldier[row.key as keyof Soldier];
    return { label: row.label, value: value ? String(value) : '—' };
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type GateScan = { kind: 'visitor-card'; cardNo: number } | { kind: 'none' } | { kind: 'visitor'; id: string } | { kind: 'soldier'; militaryNo: string };

/** Interprets scanner/keyboard input: Arabic-Indic digits, JSON payloads, UUID visitor ids, plain numbers. */
export function parseGateScan(raw: unknown): GateScan {
  const text = String(raw ?? '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!text) return { kind: 'none' };
  if (/^(?:[1-9]|1[0-9]|2[0-4])$/.test(text)) return { kind: 'visitor-card', cardNo: Number(text) };
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
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
  // 41 digits cannot collide with military numbers (at most 30 digits).
  if (/^99[0-9]{39}$/.test(text)) {
    const hex = BigInt(text.slice(2)).toString(16).padStart(32, '0');
    if (hex.length === 32) {
      const id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
      return { kind: 'visitor', id };
    }
    return { kind: 'none' };
  }
  // Older UUID labels may be typed in Arabic by a keyboard-wedge scanner.
  const keys: Record<string, string> = { '\u0634': 'a', '\u0644\u0627': 'b', '\u0624': 'c', '\u064a': 'd', '\u062b': 'e', '\u0628': 'f' };
  const legacyId = text.toLowerCase().replace(/\u0644\u0627|[\u0634\u0624\u064a\u062b\u0628]/g, (key) => keys[key]!);
  if (UUID_RE.test(legacyId)) return { kind: 'visitor', id: legacyId };
  return { kind: 'soldier', militaryNo: text };
}
