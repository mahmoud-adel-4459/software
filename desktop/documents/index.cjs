'use strict';
/**
 * Everything printed or exported by the desktop app:
 *   format.cjs     escaping, Arabic labels, cell formatting
 *   csv.cjs        CSV export of a report
 *   templates.cjs  HTML body of each document type
 *   page.cjs       full HTML page (CSS + letterhead) around a body
 */
const { EXPORT_FIELDS } = require('../../shared/reports.cjs');
const { LABELS, cell } = require('./format.cjs');
const { csv } = require('./csv.cjs');
const { documentHtml } = require('./page.cjs');
const templates = require('./templates.cjs');

module.exports = { csv, documentHtml, ...templates, cell, LABELS, REPORT_FIELDS: EXPORT_FIELDS };
