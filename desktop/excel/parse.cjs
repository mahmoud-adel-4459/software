'use strict';
/** Pure .xlsx parsing: Buffer -> { headers, rows } from the first worksheet. */
const ExcelJS = require('exceljs');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Cell -> string | number | null (dates become YYYY-MM-DD, rich text/formulas their text/result). */
function plain(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return plain(value.richText.map((p) => p.text).join(''));
    if ('formula' in value || 'sharedFormula' in value || 'result' in value) return plain(value.result ?? null);
    if ('text' in value) return plain(value.text); // hyperlink
    if ('error' in value) return null;
  }
  return plain(String(value));
}

async function parseWorkbook(buffer) {
  if (!buffer || buffer.length === 0) throw new Error('الملف فارغ');
  if (buffer.length > MAX_BYTES) throw new Error('حجم الملف أكبر من 5 ميجابايت');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error('ملف Excel غير صالح (المسموح .xlsx فقط)');
  }
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error('الملف لا يحتوي على أوراق');
  const width = ws.columnCount;
  const headers = [];
  for (let c = 1; c <= width; c++) headers.push(String(plain(ws.getRow(1).getCell(c).value) ?? '').trim());
  if (headers.every((h) => !h)) throw new Error('الصف الأول يجب أن يحتوي أسماء الأعمدة');
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const record = {};
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const v = plain(row.getCell(i + 1).value);
      record[h] = v;
      if (v !== null) any = true;
    });
    if (!any) continue;
    if (rows.length >= MAX_ROWS) throw new Error(`الحد الأقصى ${MAX_ROWS} صف في الملف الواحد`);
    rows.push(record);
  }
  return { headers: headers.filter(Boolean), rows };
}

module.exports = { parseWorkbook, MAX_BYTES, MAX_ROWS };
