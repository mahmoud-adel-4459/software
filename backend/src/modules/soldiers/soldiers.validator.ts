import { requireValue } from '@/common/errors/AppError';
import type { Input } from '@/common/http/types';
import { soldierDetails, text } from '@/common/utils/validation';

export const NATIONAL_ID = /^\d{14}$/;
export const MILITARY_NO = /^\d{6,30}$/;

/** Fields common to create and update, validated and trimmed. */
export function soldierFields(data: Input) {
  return {
    name: text(data.name, 200, true),
    militaryNo: text(data.militaryNo, 30, true),
    nationalId: text(data.nationalId, 14, true),
    rank: text(data.rank, 80, true),
    company: text(data.company, 100, true),
    unit: text(data.unit, 100, true),
    phone: text(data.phone || '', 30),
    address: text(data.address || '', 500),
    details: soldierDetails(data.details || {}),
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
