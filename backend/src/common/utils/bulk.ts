import { AppError, requireValue } from '@/common/errors/AppError';
import type { Ctx } from '@/common/http/types';

export const MAX_IMPORT_ROWS = 5000;

export interface BulkResult {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export type Row = Record<string, unknown>;

/** The `rows` array of a bulk-import body (1..5000 plain objects). */
export function importRows(ctx: Ctx): Row[] {
  const rows = ctx.data.rows;
  requireValue(Array.isArray(rows) && rows.length > 0, 'لا توجد صفوف للاستيراد');
  requireValue(rows.length <= MAX_IMPORT_ROWS, `الحد الأقصى ${MAX_IMPORT_ROWS} صف في المرة الواحدة`);
  requireValue(
    rows.every((r) => r && typeof r === 'object' && !Array.isArray(r)),
    'صفوف غير صالحة',
  );
  return rows as Row[];
}

/** Cell value as trimmed text (numbers arrive from Excel as numbers). */
export function cell(row: Row, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  requireValue(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean', 'قيمة غير صالحة');
  return String(value).trim();
}

/** Runs `handle` per row: an AppError marks the row as skipped, anything else aborts the import. */
export async function eachRow(rows: Row[], handle: (row: Row, index: number) => Promise<void>): Promise<BulkResult> {
  const result: BulkResult = { created: 0, skipped: 0, errors: [] };
  for (const [index, row] of rows.entries()) {
    try {
      await handle(row, index);
      result.created++;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      result.skipped++;
      result.errors.push({ row: index + 1, message: error.message });
    }
  }
  return result;
}
