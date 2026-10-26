import { text } from '@/common/utils/validation';
import type { Input } from '@/common/http/types';

export const MEMO_KEYS = ['memoFormation', 'memoUnitLine', 'memoRightName', 'memoRightRank', 'memoRightRole', 'memoLeftName', 'memoLeftRank', 'memoLeftRole'] as const;

export function memoFields(source: object): Record<string, unknown> {
  const data = source as Input;
  return Object.fromEntries([...MEMO_KEYS, 'memoLogo'].map((key) => [key, data[key] ?? null]));
}

export function parseMemoFields(data: Input, previous: object) {
  const current = previous as Input;
  return Object.fromEntries(MEMO_KEYS.map((key) => [key, text(data[key] === undefined ? current[key] || '' : data[key], 150)]));
}
