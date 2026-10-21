import dayjs from 'dayjs';

const CAIRO = 'Africa/Cairo';
const dtf = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: CAIRO });
const df = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeZone: CAIRO });
const tf = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeStyle: 'short', timeZone: CAIRO });
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Date + time in Cairo time with Latin digits. */
export const formatDateTime = (v?: string | null): string => (v ? dtf.format(new Date(v)) : '—');
export const formatDate = (v?: string | null): string => (v ? df.format(new Date(v)) : '—');
export const formatTime = (v?: string | null): string => (v ? tf.format(new Date(v)) : '—');
/** Calendar day (YYYY-MM-DD) from a DB `date` value, no timezone shifting. */
export const dayOnly = (v?: string | null): string => (v ? String(v).slice(0, 10) : '—');
export const formatNumber = (n: number | string | null | undefined): string => Number(n ?? 0).toLocaleString('en-US');
/** Cents to "12.50 ج.م". */
export const cash = (cents: number | string | null | undefined): string => `${(Number(cents ?? 0) / 100).toFixed(2)} ج.م`;
export const formatBytes = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(n / 1024))} KB`);

/** Today in Cairo as YYYY-MM-DD. */
export const todayCairo = (): string => ymd.format(new Date());
export const monthNow = (): string => todayCairo().slice(0, 7);
/** Adds days to a YYYY-MM-DD string (calendar math, no timezone). */
export const addDays = (iso: string, delta: number): string => dayjs(iso).add(delta, 'day').format('YYYY-MM-DD');
export const startOfMonth = (iso: string): string => `${iso.slice(0, 8)}01`;

export const ROLE_LABELS = { admin: 'مسؤول', gate: 'بوابة', clerk: 'كاشير' } as const;
export const TIER_LABELS = { normal: 'عادي', special: 'خاص', admin: 'إداري' } as const;
export const OUTLET_LABELS = { canteen: 'كانتين', buffet: 'بوفيه' } as const;

/** True when an expected return time has passed. */
export const isLate = (iso: string): boolean => Date.parse(iso) < Date.now();

/** Converts a cash string ("12.5") to integer cents, or null when invalid (max 2 decimals). */
export function parseCents(value: string): number | null {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimal = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
/** Arabic relative time ("منذ 5 دقائق") for an ISO timestamp. */
export function fromNow(iso?: string | null, now: number = Date.now()): string {
  if (!iso) return '—';
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'الآن';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
/** Percent change from `previous` to `current`; null without a baseline. */
export const percentChange = (current: number, previous: number): number | null => (previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? null : 0);
