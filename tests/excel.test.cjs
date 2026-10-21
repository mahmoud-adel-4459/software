'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildWorkbook, buildTemplate } = require('../desktop/excel/workbook.cjs');
const { parseWorkbook } = require('../desktop/excel/parse.cjs');
const { isAllowedRequest } = require('../desktop/ipc/allowed-requests.cjs');

const sheets = [
  {
    name: 'جنود',
    columns: [
      { header: 'الاسم', key: 'name' },
      { header: 'الرقم العسكري', key: 'no' },
      { header: 'ملاحظات', key: 'notes' },
    ],
    rows: [
      { name: 'أحمد', no: 123456, notes: null },
      { name: 'محمد', no: '000123', notes: 'ok' },
    ],
  },
];

test('excel export -> import round trip keeps numbers, text and empty cells', async () => {
  const parsed = await parseWorkbook(await buildWorkbook(sheets));
  assert.deepEqual(parsed.headers, ['الاسم', 'الرقم العسكري', 'ملاحظات']);
  assert.deepEqual(parsed.rows, [
    { الاسم: 'أحمد', 'الرقم العسكري': 123456, ملاحظات: null },
    { الاسم: 'محمد', 'الرقم العسكري': '000123', ملاحظات: 'ok' },
  ]);
});

test('workbook is RTL with frozen styled header and autofilter', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildWorkbook(sheets));
  const ws = wb.worksheets[0];
  assert.equal(ws.views[0].rightToLeft, true);
  assert.equal(ws.views[0].state, 'frozen');
  assert.equal(ws.getRow(1).getCell(1).font.bold, true);
  assert.equal(ws.getRow(1).getCell(1).fill.fgColor.argb, 'FF244B46');
  assert.ok(ws.autoFilter);
});

test('template keeps one sample row; parsing handles dates, rich text, formulas', async () => {
  const parsed = await parseWorkbook(await buildTemplate(sheets));
  assert.equal(parsed.rows.length, 1);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('x');
  ws.addRow(['d', 'r', 'f']);
  ws.addRow([
    new Date(Date.UTC(2026, 0, 5)),
    { richText: [{ text: 'a' }, { text: 'b' }] },
    { formula: '1+1', result: 2 },
  ]);
  const out = await parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
  assert.deepEqual(out.rows, [{ d: '2026-01-05', r: 'ab', f: 2 }]);
});

test('excel limits and bad input are rejected with Arabic errors', async () => {
  await assert.rejects(parseWorkbook(Buffer.from('not a zip')), /غير صالح/);
  await assert.rejects(parseWorkbook(Buffer.alloc(6 * 1024 * 1024)), /5 ميجابايت/);
  await assert.rejects(buildWorkbook([]), /غير صالحة/);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('x');
  ws.addRow(['a']);
  for (let i = 0; i < 5001; i++) ws.addRow([i + 1]);
  await assert.rejects(parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer())), /5000/);
});

test('new API paths are allow-listed', () => {
  assert.ok(isAllowedRequest({ method: 'GET', path: '/api/dashboard?days=30' }));
  for (const p of ['outlets/delete', 'soldiers/import', 'visitors/import', 'fitness/import', 'canteen/import']) {
    assert.ok(isAllowedRequest({ method: 'POST', path: `/api/${p}` }), p);
  }
});
