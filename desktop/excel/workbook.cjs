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

async function buildWorkbook(sheets) {
  checkSheets(sheets);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'منظومة شؤون الوحدة الداخلية';
  const used = new Set();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(uniqueSheetName(sheet.name, used), {
      views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key }));
    const widths = sheet.columns.map((c) => c.header.length);
    for (const row of sheet.rows ?? []) {
      ws.addRow(sheet.columns.map((c) => cellValue(row[c.key])));
      sheet.columns.forEach((c, i) => {
        const v = row[c.key];
        if (v !== null && v !== undefined) widths[i] = Math.max(widths[i], String(v).length);
      });
    }
    sheet.columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width ?? Math.min(60, Math.max(10, widths[i] + 4));
    });
    const header = ws.getRow(1);
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Import-template workbook: header row plus (optionally) one sample row. */
function buildTemplate(sheets) {
  if (!Array.isArray(sheets)) return buildWorkbook(sheets);
  return buildWorkbook(sheets.map((s) => ({ ...s, rows: (s?.rows ?? []).slice(0, 1) })));
}

module.exports = { buildWorkbook, buildTemplate, MAX_ROWS };
