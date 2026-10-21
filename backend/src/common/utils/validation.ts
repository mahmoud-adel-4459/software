import { requireValue } from '@/common/errors/AppError';
import { DETAIL_FIELD_KEYS } from './catalog';

/**
 * Input validators shared by every module. They return the cleaned value or throw AppError(400);
 * messages are the exact Arabic texts of the existing API contract.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

/** Trimmed string of at most `max` characters; `required` rejects empty text. */
export function text(value: unknown, max = 200, required = false): string {
  requireValue(
    typeof value === 'string' && value.trim().length <= max && (!required || value.trim()),
    'تحقق من الحقول المطلوبة وأطوالها',
  );
  return value.trim();
}

export function identifier(value: unknown): string {
  requireValue(isUuid(value), 'معرف غير صالح');
  return value;
}

/** Calendar date as YYYY-MM-DD (rejects things like 2026-02-31). */
export function date(value: unknown): string {
  requireValue(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    'تاريخ غير صالح',
  );
  return value;
}

export function positiveInt(value: unknown, max = 100000000): number {
  requireValue(
    typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max,
    'قيمة رقمية غير صالحة',
  );
  return value;
}

const DATE_DETAILS = ['enlistDate', 'dischargeDate', 'unitJoinDate', 'birthDate'];
const SHORT_DETAILS = ['weaponNo', 'cardNo'];

/** Optional soldier profile fields (card no, dates, height ...). Unknown keys are dropped. */
export function soldierDetails(source: unknown = {}): Record<string, string> {
  requireValue(source && typeof source === 'object' && !Array.isArray(source), 'تفاصيل الملف غير صالحة');
  const input = source as Record<string, unknown>;
  const details: Record<string, string> = {};
  for (const key of DETAIL_FIELD_KEYS) {
    const value = text(input[key] || '', SHORT_DETAILS.includes(key) ? 40 : 200);
    details[key] = value;
    if (DATE_DETAILS.includes(key) && value) date(value);
    if (['height', 'weight'].includes(key) && value) {
      requireValue(Number(value) > 0 && Number(value) < 1000, 'قياس غير صالح');
    }
    if (key === 'age' && value) {
      requireValue(/^\d{1,3}$/.test(value) && Number(value) > 0 && Number(value) < 120, 'عمر غير صالح');
    }
  }
  return details;
}

const MAGIC_BYTES: Record<string, (bytes: Buffer) => boolean> = {
  'image/png': (bytes) => bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/jpeg': (bytes) => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
  'application/pdf': (bytes) => bytes.subarray(0, 5).toString() === '%PDF-',
};

/** Validates a base64 attachment (size and real file signature) and returns its bytes. */
export function attachmentBytes(data: unknown, mime: unknown): Buffer {
  requireValue(
    typeof data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(data) && data.length < 7100000,
    'المرفق أكبر من 5 ميجابايت أو غير صالح',
  );
  const bytes = Buffer.from(data, 'base64');
  requireValue(
    bytes.length > 0 && bytes.length <= MAX_ATTACHMENT_BYTES && bytes.toString('base64') === data,
    'ملف غير صالح',
  );
  requireValue(typeof mime === 'string' && MAGIC_BYTES[mime]?.(bytes) === true, 'المسموح PNG أو JPEG أو PDF حقيقي فقط');
  return bytes;
}
