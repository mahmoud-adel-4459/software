'use strict';
const { EXPORT_FIELDS } = require('../../shared/reports.cjs');
const { LABELS, cell } = require('./format.cjs');

const UTF8_BOM = '\uFEFF';
const NUMERIC_FIELDS = ['amount_cents', 'value'];
// Cells starting with these are treated as formulas by spreadsheet programs.
const FORMULA_START = /^[\s]*[=+\-@\t\r]/;

/** One quoted CSV cell; text that looks like a formula is prefixed with ' (CSV injection guard). */
function quote(text, numeric = false) {
  const guard = !numeric && FORMULA_START.test(text) ? "'" : '';
  return `"${guard + text.replaceAll('"', '""')}"`;
}

/** Report -> CSV text (UTF-8 BOM so Excel shows Arabic correctly). */
function csv(report) {
  const fields = EXPORT_FIELDS[report.type];
  if (!fields) throw new Error('نوع التقرير غير صالح');
  const header = fields.map((key) => quote(LABELS[key] || key));
  const rows = report.rows.map((row) => fields.map((key) => quote(cell(key, row[key]), NUMERIC_FIELDS.includes(key))));
  return UTF8_BOM + [header, ...rows].map((line) => line.join(',')).join('\r\n');
}

module.exports = { csv };
