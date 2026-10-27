import { requireValue } from '@/common/errors/AppError';
import type { Input } from '@/common/http/types';
import { text } from '@/common/utils/validation';

/** Choices offered in the soldier form; edited from Settings. */
export const DEFAULT_SOLDIER_GRADES = ['مجند', 'متطوع', 'ضابط صف', 'ضابط'];
export const DEFAULT_SOLDIER_RANKS = [
  'عسكري',
  'عريف',
  'رقيب',
  'رقيب أول',
  'مساعد',
  'مساعد أول',
  'ملازم',
  'ملازم أول',
  'نقيب',
  'رائد',
  'مقدم',
  'عقيد',
  'عميد',
  'لواء',
];

interface StoredLists {
  soldierGrades?: unknown;
  soldierRanks?: unknown;
}

export function soldierListsOf(settings: StoredLists) {
  return {
    soldierGrades: Array.isArray(settings.soldierGrades) ? (settings.soldierGrades as string[]) : DEFAULT_SOLDIER_GRADES,
    soldierRanks: Array.isArray(settings.soldierRanks) ? (settings.soldierRanks as string[]) : DEFAULT_SOLDIER_RANKS,
  };
}

function parseList(value: unknown, label: string): string[] {
  requireValue(Array.isArray(value) && value.length <= 100, `قائمة ${label} غير صالحة`);
  const items = value.map((item: unknown) => text(item, 80, true));
  requireValue(new Set(items).size === items.length, `${label} مكررة في القائمة`);
  return items;
}

/** Lists sent with the settings form; a list that was not sent keeps its stored value. */
export function parseSoldierLists(data: Input, previous: StoredLists) {
  const current = soldierListsOf(previous);
  return {
    soldierGrades: data.soldierGrades === undefined ? current.soldierGrades : parseList(data.soldierGrades, 'الدرجات'),
    soldierRanks: data.soldierRanks === undefined ? current.soldierRanks : parseList(data.soldierRanks, 'الرتب'),
  };
}
