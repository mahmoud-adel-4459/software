import { requireValue } from '@/common/errors/AppError';
import type { Input } from '@/common/http/types';
import { attachmentBytes, soldierDetails, text } from '@/common/utils/validation';

export const REQUIRED_PHOTOS: Record<string, string> = { photo: 'صورة 4×6', idPhoto: 'صورة البطاقة', carnetFront: 'وجه الكارنيه العسكري', carnetBack: 'ظهر الكارنيه العسكري' };
const REQUIRED_DETAILS: Record<string, string> = { cardNo: 'رقم البطاقة', originalUnit: 'الوحدة الأصلية', specialty: 'التخصص', enlistDate: 'تاريخ التجنيد', dischargeDate: 'تاريخ التسريح', weaponNo: 'رقم السلاح', unitJoinDate: 'تاريخ الضم على الوحدة', birthDate: 'تاريخ الميلاد', height: 'الطول', weight: 'الوزن', age: 'العمر', offDutyJob: 'الوظيفة خارج الوحدة' };

export function soldierPhotos(value: unknown): Input[] {
  const photos = value ?? [];
  requireValue(Array.isArray(photos) && photos.length <= 4, 'صور العسكري غير صالحة');
  const kinds = new Set<string>();
  for (const photo of photos) {
    requireValue(photo && typeof photo === 'object' && Object.hasOwn(REQUIRED_PHOTOS, photo.kind), 'نوع صورة العسكري غير صالح');
    requireValue(!kinds.has(photo.kind), 'نوع صورة العسكري مكرر');
    kinds.add(photo.kind);
    requireValue(['image/png', 'image/jpeg'].includes(photo.mime), 'صور العسكري يجب أن تكون PNG أو JPEG');
    attachmentBytes(photo.content, photo.mime);
    text(photo.name, 200, true);
  }
  return photos;
}

export function requireSoldierPhotos(kinds: string[]): void {
  const missing = Object.keys(REQUIRED_PHOTOS).filter((kind) => !kinds.includes(kind));
  requireValue(!missing.length, `صور العسكري مطلوبة: ${missing.map((kind) => REQUIRED_PHOTOS[kind]).join('، ')}`);
}

export const NATIONAL_ID = /^\d{14}$/;
export const MILITARY_NO = /^\d{6,30}$/;

/** Fields common to create and update, validated and trimmed. */
export function soldierFields(data: Input) {
  const required: Record<string, string> = { name: 'الاسم', militaryNo: 'الرقم العسكري', nationalId: 'الرقم القومي', rank: 'الدرجة', company: 'السرية', unit: 'الوحدة', phone: 'رقم الهاتف', address: 'العنوان المدني' };
  for (const [key, label] of Object.entries(required)) requireValue(typeof data[key] === 'string' && String(data[key]).trim(), `${label} مطلوب`);
  const details = soldierDetails(data.details || {});
  const missing = Object.keys(REQUIRED_DETAILS).filter((key) => !details[key]);
  requireValue(!missing.length, `بيانات العسكري مطلوبة: ${missing.map((key) => REQUIRED_DETAILS[key]).join('، ')}`);
  return {
    name: text(data.name, 200, true),
    militaryNo: text(data.militaryNo, 30, true),
    nationalId: text(data.nationalId, 14, true),
    rank: text(data.rank, 80, true),
    company: text(data.company, 100, true),
    unit: text(data.unit, 100, true),
    phone: text(data.phone, 30, true),
    address: text(data.address, 500, true),
    details,
  };
}

export function newSoldierInput(data: Input) {
  const soldier = soldierFields(data);
  requireValue(
    NATIONAL_ID.test(soldier.nationalId) && MILITARY_NO.test(soldier.militaryNo),
    'الرقم القومي 14 رقمًا والرقم العسكري من 6 إلى 30 رقمًا',
  );
  return soldier;
}

/** Page offset from the query string. */
export function offsetParam(value: string | null): number {
  const offset = Number(value || 0);
  requireValue(Number.isSafeInteger(offset) && offset >= 0 && offset <= 1000000, 'صفحة غير صالحة');
  return offset;
}
