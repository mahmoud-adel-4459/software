import { requireValue } from '@/common/errors/AppError';
import { text } from '@/common/utils/validation';

export interface PrintSettings {
  printer: string;
  labelPrinter: string;
  receiptPrinter: string;
  labelWidthMm: number;
  labelHeightMm: number;
  /** Receipt paper width (mm). */
  receiptWidthMm: number;
  /** Width the printer can actually print (XP-90 ≈ 72 mm); must be ≤ receiptWidthMm. */
  receiptPrintableWidthMm: number;
  receiptMarginMm: number;
  receiptFontPt: number;
  receiptLineHeight: number;
  receiptBold: boolean;
  receiptShowLogo: boolean;
  receiptLogoMm: number;
  receiptHeightMode: 'auto' | 'fixed';
  receiptHeightMm: number;
  receiptCopies: number;
  receiptFooter: string;
  receiptTopFeedMm: number;
  receiptBottomFeedMm: number;
  silentPrint: boolean;
}

export const PRINT_DEFAULTS: PrintSettings = {
  printer: '',
  labelPrinter: '',
  receiptPrinter: '',
  labelWidthMm: 45,
  labelHeightMm: 50,
  receiptWidthMm: 80,
  receiptPrintableWidthMm: 72,
  receiptMarginMm: 1,
  receiptFontPt: 11,
  receiptLineHeight: 1.4,
  receiptBold: true,
  receiptShowLogo: true,
  receiptLogoMm: 20,
  receiptHeightMode: 'auto',
  receiptHeightMm: 150,
  receiptCopies: 1,
  receiptFooter: '',
  receiptTopFeedMm: 2,
  receiptBottomFeedMm: 8,
  silentPrint: false,
};
const RANGES = {
  labelWidthMm: [20, 120, 'عرض الملصق من 20 إلى 120 مم'],
  labelHeightMm: [15, 200, 'ارتفاع الملصق من 15 إلى 200 مم'],
  receiptWidthMm: [48, 110, 'عرض الإيصال من 48 إلى 110 مم'],
  receiptPrintableWidthMm: [40, 108, 'منطقة الطباعة من 40 إلى 108 مم'],
  receiptMarginMm: [0, 10, 'هامش الإيصال من 0 إلى 10 مم'],
  receiptFontPt: [7, 18, 'حجم خط الإيصال من 7 إلى 18'],
  receiptLineHeight: [1, 2.2, 'تباعد أسطر الإيصال من 1 إلى 2.2'],
  receiptLogoMm: [10, 40, 'حجم الشعار من 10 إلى 40 مم'],
  receiptHeightMm: [40, 400, 'ارتفاع الإيصال من 40 إلى 400 مم'],
  receiptCopies: [1, 3, 'عدد نسخ الإيصال من 1 إلى 3'],
  receiptTopFeedMm: [0, 20, 'تغذية أعلى الإيصال من 0 إلى 20 مم'],
  receiptBottomFeedMm: [0, 30, 'تغذية أسفل الإيصال من 0 إلى 30 مم'],
} as const;
type RangeKey = keyof typeof RANGES;
const BOOLS = ['silentPrint', 'receiptBold', 'receiptShowLogo'] as const;

const inRange = (value: unknown, key: RangeKey) => {
  if (value === '' || value === null || typeof value === 'boolean') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= RANGES[key][0] && n <= RANGES[key][1];
};
const validHeightMode = (v: unknown) => v === 'auto' || v === 'fixed';

/** Print settings with defaults applied (stored settings may predate these keys). */
export function mergePrintSettings(data?: unknown): PrintSettings {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const str = (k: 'printer' | 'labelPrinter' | 'receiptPrinter') => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const num = (k: RangeKey) => (inRange(d[k], k) ? Number(d[k]) : PRINT_DEFAULTS[k]);
  const bool = (k: (typeof BOOLS)[number]) => (typeof d[k] === 'boolean' ? (d[k] as boolean) : PRINT_DEFAULTS[k]);
  const receiptWidthMm = num('receiptWidthMm');
  const printable = num('receiptPrintableWidthMm');
  return {
    printer: str('printer'),
    labelPrinter: str('labelPrinter'),
    receiptPrinter: str('receiptPrinter'),
    labelWidthMm: num('labelWidthMm'),
    labelHeightMm: num('labelHeightMm'),
    receiptWidthMm,
    receiptPrintableWidthMm: Math.min(printable, receiptWidthMm),
    receiptMarginMm: num('receiptMarginMm'),
    receiptFontPt: num('receiptFontPt'),
    receiptLineHeight: num('receiptLineHeight'),
    receiptBold: bool('receiptBold'),
    receiptShowLogo: bool('receiptShowLogo'),
    receiptLogoMm: num('receiptLogoMm'),
    receiptHeightMode: validHeightMode(d.receiptHeightMode) ? (d.receiptHeightMode as 'auto' | 'fixed') : 'auto',
    receiptHeightMm: num('receiptHeightMm'),
    receiptCopies: Math.round(num('receiptCopies')),
    receiptFooter: typeof d.receiptFooter === 'string' ? d.receiptFooter.slice(0, 120) : '',
    receiptTopFeedMm: num('receiptTopFeedMm'),
    receiptBottomFeedMm: num('receiptBottomFeedMm'),
    silentPrint: d.silentPrint === true,
  };
}

/** Validates the print keys of a settings update; missing keys fall back to the defaults. */
export function parsePrintFields(data: Record<string, unknown>): PrintSettings {
  const merged = mergePrintSettings({ ...PRINT_DEFAULTS, ...data });
  for (const key of Object.keys(RANGES) as RangeKey[]) {
    if (data[key] !== undefined) requireValue(inRange(data[key], key), RANGES[key][2]);
  }
  for (const key of BOOLS) {
    requireValue(data[key] === undefined || typeof data[key] === 'boolean', 'خيار الطباعة غير صالح');
  }
  requireValue(data.receiptHeightMode === undefined || validHeightMode(data.receiptHeightMode), 'نمط ارتفاع الإيصال غير صالح');
  requireValue(
    data.receiptFooter === undefined || (typeof data.receiptFooter === 'string' && data.receiptFooter.length <= 120),
    'نص أسفل الإيصال حتى 120 حرفًا',
  );
  requireValue(
    data.receiptCopies === undefined || Number.isInteger(Number(data.receiptCopies)),
    'عدد نسخ الإيصال يجب أن يكون عددًا صحيحًا',
  );
  requireValue(
    data.receiptPrintableWidthMm === undefined || Number(data.receiptPrintableWidthMm) <= merged.receiptWidthMm,
    'منطقة الطباعة يجب ألا تتجاوز عرض الورق',
  );
  requireValue(
    merged.receiptPrintableWidthMm - 2 * merged.receiptMarginMm >= 20,
    'الهامش كبير جدًا بالنسبة لمنطقة الطباعة',
  );
  return {
    ...merged,
    receiptFooter: text(data.receiptFooter || '', 120),
    printer: text(data.printer || '', 200),
    labelPrinter: text(data.labelPrinter || '', 200),
    receiptPrinter: text(data.receiptPrinter || '', 200),
  };
}
