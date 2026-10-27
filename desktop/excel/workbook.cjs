'use strict';
/** Pure .xlsx building: sheets of columns + rows -> Buffer (RTL, styled header, frozen, filtered, auto widths). */
const ExcelJS = require('exceljs');

const MAX_ROWS = 100000;
const HEADER_FILL = 'FF244B46';
const MAX_SHEETS = 20;

function checkSheets(sheets) {
  const bad = () => new Error('بيانات التصدير غير صالحة');
  if (!Array.isArray(sheets) || sheets.length === 0 || sheets.length > MAX_SHEETS) throw bad();
  for (const sheet of sheets) {
    if (
      !sheet ||
      typeof sheet.name !== 'string' ||
      !Array.isArray(sheet.columns) ||
      sheet.columns.length === 0 ||
      sheet.columns.some((c) => !c || typeof c.header !== 'string' || typeof c.key !== 'string') ||
      !Array.isArray(sheet.rows ?? [])
    ) {
      throw bad();
    }
    if ((sheet.rows ?? []).length > MAX_ROWS) throw new Error(`الحد الأقصى ${MAX_ROWS} صف في الملف الواحد`);
  }
}

function uniqueSheetName(name, used) {
  const base =
    name
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 28)} ${i}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function cellValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

const NUMBER_FORMATS = { money: '#,##0.00 "ج.م"', percent: '0.0"%"', number: '#,##0.##' };
const columnLetter = (n) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/**
 * Optional per sheet: `title` lines above the table; per column: `format` (money | percent | number)
 * and `total: 'sum'` for a SUM formula in a final «الإجمالي» row.
 */
async function buildWorkbook(sheets) {
  checkSheets(sheets);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'منظومة شؤون الوحدة الداخلية';
  const used = new Set();
  for (const sheet of sheets) {
    const titles = Array.isArray(sheet.title) ? sheet.title.filter((t) => typeof t === 'string').slice(0, 5) : [];
    const headerRow = titles.length ? titles.length + 2 : 1;
    const ws = workbook.addWorksheet(uniqueSheetName(sheet.name, used), {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: headerRow }],
    });
    titles.forEach((text, i) => {
      const cell = ws.getCell(i + 1, 1);
      cell.value = text;
      cell.font = { bold: true, size: i === 0 ? 14 : 11 };
      ws.mergeCells(i + 1, 1, i + 1, Math.max(1, sheet.columns.length));
    });
    ws.getRow(headerRow).values = sheet.columns.map((c) => c.header);
    const widths = sheet.columns.map((c) => c.header.length);
    const rows = sheet.rows ?? [];
    for (const row of rows) {
      ws.addRow(sheet.columns.map((c) => cellValue(row[c.key])));
      sheet.columns.forEach((c, i) => {
        const v = row[c.key];
        if (v !== null && v !== undefined) widths[i] = Math.max(widths[i], String(v).length);
      });
    }
    const first = headerRow + 1;
    const last = headerRow + rows.length;
    if (rows.length && sheet.columns.some((c) => c.total === 'sum')) {
      const totals = ws.addRow(
        sheet.columns.map((c, i) =>
          c.total === 'sum' ? { formula: `SUM(${columnLetter(i + 1)}${first}:${columnLetter(i + 1)}${last})` } : i === 0 ? 'الإجمالي' : null,
        ),
      );
      totals.font = { bold: true };
      totals.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF5F2' } };
        cell.border = { top: { style: 'thin' } };
      });
    }
    sheet.columns.forEach((c, i) => {
      const column = ws.getColumn(i + 1);
      column.width = c.width ?? Math.min(60, Math.max(10, widths[i] + 4));
      if (NUMBER_FORMATS[c.format]) column.numFmt = NUMBER_FORMATS[c.format];
    });
    const header = ws.getRow(headerRow);
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: sheet.columns.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Import-template workbook: header row plus (optionally) one sample row. */
function buildTemplate(sheets) {
  if (!Array.isArray(sheets)) return buildWorkbook(sheets);
  return buildWorkbook(sheets.map((s) => ({ ...s, rows: (s?.rows ?? []).slice(0, 1) })));
}

module.exports = { buildWorkbook, buildTemplate, MAX_ROWS };
