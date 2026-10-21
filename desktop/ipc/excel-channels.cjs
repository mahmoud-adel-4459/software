'use strict';
/** IPC channels for Excel: export / import template (save dialog) and import (open dialog). */
const fs = require('node:fs');
const path = require('node:path');
const { buildWorkbook, buildTemplate } = require('../excel/workbook.cjs');
const { parseWorkbook, MAX_BYTES } = require('../excel/parse.cjs');

const safeName = (name) =>
  (typeof name === 'string' ? name : 'export')
    .replace(/\.xlsx$/i, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 100) || 'export';

function registerExcelChannels({ expose, dialog, getWindow }) {
  const save = (title, build) => async (arg) => {
    if (!arg || typeof arg !== 'object') throw new Error('بيانات التصدير غير صالحة');
    const buffer = await build(arg.sheets);
    const result = await dialog.showSaveDialog(getWindow(), {
      title,
      defaultPath: `${safeName(arg.fileName)}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, buffer);
    return true;
  };
  expose('app:excel-export', save('تصدير إلى Excel', buildWorkbook));
  expose('app:excel-template', save('حفظ نموذج Excel', buildTemplate));
  expose('app:excel-import', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'اختيار ملف Excel',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const file = result.filePaths[0];
    if (fs.statSync(file).size > MAX_BYTES) throw new Error('حجم الملف أكبر من 5 ميجابايت');
    const parsed = await parseWorkbook(fs.readFileSync(file));
    return { fileName: path.basename(file), ...parsed };
  });
}

module.exports = { registerExcelChannels };
