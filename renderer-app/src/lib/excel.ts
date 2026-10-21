import type { ExcelColumn, ExcelImportFile, ExcelSheet, ExcelWorkbookArg, ImportResult } from '@/api/types';
import type { ImportPath } from '@/api/endpoints';

export interface ImportField {
  key: string;
  header: string;
  required?: boolean;
  sample: string | number;
}
export interface ImportSpec {
  path: ImportPath;
  title: string;
  fileName: string;
  fields: ImportField[];
}

export const CHUNK_SIZE = 1000;

/** Case/space/diacritic-insensitive comparison key for header texts. */
export function normalizeHeader(text: unknown): string {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\s_\-.:/\()]+/g, '')
    .toLowerCase();
}

export interface MappedImport {
  rows: Record<string, string | number | null>[];
  /** Header texts from the file that matched no field. */
  unknownHeaders: string[];
  /** Required fields with no matching column. */
  missingRequired: ImportField[];
  /** Field keys that matched a column. */
  matched: string[];
}

/** Maps an imported sheet (rows keyed by header text) to the endpoint keys; accepts the Arabic header or the key name. */
export function mapImportRows(file: ExcelImportFile, spec: ImportSpec): MappedImport {
  const byNorm = new Map<string, ImportField>();
  for (const f of spec.fields) {
    byNorm.set(normalizeHeader(f.header), f);
    byNorm.set(normalizeHeader(f.key), f);
  }
  const columnField = new Map<string, ImportField>();
  const unknownHeaders: string[] = [];
  for (const h of file.headers) {
    const f = byNorm.get(normalizeHeader(h));
    if (f && ![...columnField.values()].includes(f)) columnField.set(h, f);
    else if (String(h ?? '').trim()) unknownHeaders.push(h);
  }
  const matched = [...columnField.values()].map((f) => f.key);
  const rows = file.rows
    .map((r) => {
      const out: Record<string, string | number | null> = {};
      for (const [h, f] of columnField) {
        const v = r[h];
        out[f.key] = v === undefined || v === '' ? null : typeof v === 'string' ? v.trim() : v;
      }
      return out;
    })
    .filter((r) => Object.values(r).some((v) => v !== null && v !== ''));
  return { rows, unknownHeaders, missingRequired: spec.fields.filter((f) => f.required && !matched.includes(f.key)), matched };
}

export function chunk<T>(items: T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs the chunks one after another (each with its own request id) and sums the results; error rows are file-absolute. */
export async function submitInChunks(
  rows: unknown[],
  send: (chunkRows: unknown[], requestId: string) => Promise<ImportResult>,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const total: ImportResult = { created: 0, skipped: 0, errors: [] };
  let offset = 0;
  for (const part of chunk(rows)) {
    const res = await send(part, crypto.randomUUID());
    total.created += res.created ?? 0;
    total.skipped += res.skipped ?? 0;
    for (const e of res.errors ?? []) total.errors.push({ row: e.row + offset, message: e.message });
    offset += part.length;
    onProgress?.(Math.min(offset, rows.length), rows.length);
  }
  return total;
}

export const templateWorkbook = (spec: ImportSpec): ExcelWorkbookArg => ({
  fileName: `قالب-${spec.fileName}`,
  sheets: [{
    name: spec.title,
    columns: spec.fields.map((f) => ({ header: f.header, key: f.key, width: Math.max(14, f.header.length + 4) })),
    rows: [Object.fromEntries(spec.fields.map((f) => [f.key, f.sample]))],
  }],
});

export const errorsWorkbook = (result: ImportResult): ExcelWorkbookArg => ({
  fileName: 'أخطاء-الاستيراد',
  sheets: [{
    name: 'الأخطاء',
    columns: [{ header: 'رقم الصف', key: 'row', width: 12 }, { header: 'الرسالة', key: 'message', width: 70 }],
    rows: result.errors.map((e) => ({ row: e.row, message: e.message })),
  }],
});

/** Builds a one-sheet workbook; column widths default from the header length. */
export function sheetWorkbook(fileName: string, sheetName: string, columns: ExcelColumn[], rows: ExcelSheet['rows']): ExcelWorkbookArg {
  return { fileName, sheets: [{ name: sheetName.slice(0, 31), columns: columns.map((c) => ({ width: Math.max(14, c.header.length + 4), ...c })), rows }] };
}

const f = (key: string, header: string, sample: string | number, required = false): ImportField => ({ key, header, sample, required });

export const SOLDIER_IMPORT: ImportSpec = {
  path: '/api/soldiers/import', title: 'العسكريون', fileName: 'العسكريون',
  fields: [
    f('name', 'الاسم', 'أحمد محمود علي حسن', true), f('militaryNo', 'الرقم العسكري', '123456789', true), f('nationalId', 'الرقم القومي', '29901011234567'),
    f('rank', 'الرتبة', 'جندي'), f('company', 'السرية', 'السرية الأولى'), f('unit', 'الوحدة', 'الوحدة التجريبية'), f('phone', 'الهاتف', '01000000000'),
    f('address', 'العنوان', 'القاهرة'), f('cardNo', 'رقم الكارنيه', '5521'), f('originalUnit', 'الوحدة الأصلية', ''), f('specialty', 'التخصص', 'مشاة'),
    f('enlistDate', 'تاريخ التجنيد', '2024-01-01'), f('dischargeDate', 'تاريخ التسريح', '2025-01-01'), f('weaponNo', 'رقم السلاح', ''),
    f('unitJoinDate', 'تاريخ الالتحاق بالوحدة', '2024-02-01'), f('birthDate', 'تاريخ الميلاد', '2000-01-01'), f('height', 'الطول', 175),
    f('weight', 'الوزن', 70), f('age', 'السن', 24), f('offDutyJob', 'الوظيفة المدنية', ''),
  ],
};
export const VISITOR_IMPORT: ImportSpec = {
  path: '/api/visitors/import', title: 'الزوار', fileName: 'الزوار',
  fields: [
    f('name', 'الاسم', 'زائر تجريبي', true), f('categoryName', 'الفئة', 'زائر عادي', true), f('badgeNo', 'رقم البطاقة', 'V-0001'), f('phone', 'الهاتف', '01000000000'),
    f('nationalId', 'الرقم القومي', ''), f('organization', 'الجهة', 'شركة'), f('notes', 'ملاحظات', ''),
  ],
};
export const FITNESS_IMPORT: ImportSpec = {
  path: '/api/fitness/import', title: 'اللياقة', fileName: 'اللياقة',
  fields: [
    f('militaryNo', 'الرقم العسكري', '123456789', true), f('type', 'الاختبار', 'جري 3 كم', true), f('value', 'النتيجة', 900, true),
    f('date', 'التاريخ', '2026-01-01'), f('notes', 'ملاحظات', ''),
  ],
};
export const CANTEEN_IMPORT: ImportSpec = {
  path: '/api/canteen/import', title: 'مشتريات', fileName: 'مشتريات',
  fields: [
    f('militaryNo', 'الرقم العسكري', '123456789', true), f('outletName', 'نقطة البيع', 'الكانتين الرئيسي', true), f('amount', 'المبلغ', 25.5, true),
    f('notes', 'ملاحظات', ''), f('date', 'التاريخ', '2026-01-01'),
  ],
};
