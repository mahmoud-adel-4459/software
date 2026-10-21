'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('design system files define desktop shell and feature layout classes', () => {
  const styles = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  const desktop = fs.readFileSync(path.join(root, 'renderer/desktop.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
  assert.match(styles, /--primary:\s*#244b46/);
  assert.match(desktop, /\.page-eyebrow/);
  assert.match(desktop, /\.feature-stats/);
  assert.match(desktop, /\.search-panel/);
  assert.match(fs.readFileSync(path.join(root, 'renderer/gate-pos.css'), 'utf8'), /\.gate-pos-shell/);
  assert.match(fs.readFileSync(path.join(root, 'renderer/shell.css'), 'utf8'), /\.table-pro/);
  assert.match(html, /desktop\.css/);
  assert.match(html, /styles\.css/);
  assert.match(html, /lang="ar"/);
});

test('renderer modules expose shared page header helper', () => {
  const source = fs.readFileSync(path.join(root, 'renderer/modules.js'), 'utf8');
  assert.match(source, /function pageHeader\(/);
  for (const page of ['foodLedgerPage', 'fitnessPage', 'reportsPage', 'dailyReportPage', 'settingsPage', 'printingPage', 'backupsPage', 'importPage']) {
    assert.match(source, new RegExp(`function ${page}`));
    assert.match(source, /pageHeader\(/);
  }
});
