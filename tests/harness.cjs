'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID, randomBytes } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { newDb } = require('pg-mem');
const QRCode = require('qrcode');
const { keyPair, hashPassword, sign, requestMessage } = require('../shared/crypto.cjs');
const { Store } = require('../server/store.cjs');
const { createHandler } = require('../server/api.cjs');
const { BackupManager } = require('../server/backup.cjs');

function registerPgMem(db) {
  db.public.registerFunction({ name: 'hashtext', args: ['text'], returns: 'integer', implementation: () => 1 });
  db.public.registerFunction({ name: 'pg_advisory_xact_lock', args: ['integer'], returns: 'integer', implementation: () => 1 });
  db.public.registerFunction({ name: 'pg_advisory_xact_lock_shared', args: ['integer'], returns: 'integer', implementation: () => 1 });
}

async function createTestApp(t, { withBackups = false } = {}) {
  const db = newDb();
  registerPgMem(db);
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const store = new Store(pool);
  await store.migrate();
  await pool.query('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), 'admin', 'مسؤول اختبار', await hashPassword('long-test-password'), 'admin']);
  const internal = { id: randomUUID(), kind: 'internal', ...keyPair() };
  const gate = { id: randomUUID(), kind: 'gate', ...keyPair() };
  let backupManager;
  if (withBackups) {
    const directory = path.join(__dirname, '../artifacts/test-backups', randomUUID());
    backupManager = new BackupManager({ store, key: randomBytes(32).toString('hex'), serverId: 'e2e-installation', directory });
  }
  const server = http.createServer(createHandler({
    store,
    licenseProvider: () => ({ installation: 'وحدة اختبار E2E', devices: [internal, gate] }),
    backupManager,
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let token;
  let device = internal;
  const hooks = {
    configure: [],
    exportDevice: 0,
    importCA: 0,
    document: [],
    exportReport: 0,
    previewLegacy: 0,
    applyLegacy: 0,
    pickAttachment: 0,
    importBackup: 0,
    saveBackup: 0,
    legacyPreviewPayload: null,
  };
  async function ipcCall(method, apiPath, values = {}, requestId) {
    const body = method === 'GET' ? '' : JSON.stringify(values);
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const headers = {
      'Content-Type': 'application/json',
      'X-Device-Id': device.id,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': sign(device.privateKey, requestMessage({ deviceId: device.id, timestamp, nonce, method, path: apiPath, body })),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (requestId) headers['X-Request-Id'] = requestId;
    const response = await fetch(origin + apiPath, { method, headers, body: method === 'GET' ? undefined : body });
    const data = await response.json();
    return response.ok ? { ok: true, data } : { ok: false, error: data.error, status: response.status };
  }
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../renderer/index.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://desktop.invalid' });
  const win = dom.window;
  t.after(async () => { win.close(); await new Promise(resolve => server.close(resolve)); await pool.end(); });
  Object.defineProperty(win.crypto, 'randomUUID', { value: randomUUID });
  let caImported = false;
  win.desktop = {
    info: async () => ({ ok: true, data: { serverUrl: 'https://server.local:8443', deviceId: device.id, fingerprint: 'test-fingerprint', version: '0.2.0', caImported: caImported || true, labMode: false } }),
    login: async values => {
      const result = await ipcCall('POST', '/api/login', values);
      if (result.ok) { token = result.data.token; delete result.data.token; }
      return result;
    },
    logout: async () => { const result = await ipcCall('POST', '/api/logout'); token = null; return result; },
    request: ipcCall,
    qr: async number => ({ ok: true, data: await QRCode.toDataURL(number) }),
    exportDevice: async () => { hooks.exportDevice++; return { ok: true, data: true }; },
    importCA: async () => { hooks.importCA++; caImported = true; return { ok: true, data: true }; },
    configure: async url => { hooks.configure.push(url); return { ok: true, data: true }; },
    printers: async () => ({ ok: true, data: [{ name: 'Test Printer', displayName: 'طابعة اختبار' }] }),
    document: async args => { hooks.document.push(args); return { ok: true, data: true }; },
    exportReport: async () => { hooks.exportReport++; return { ok: true, data: true }; },
    previewLegacy: async () => {
      hooks.previewLegacy++;
      return { ok: true, data: hooks.legacyPreviewPayload };
    },
    applyLegacy: async () => { hooks.applyLegacy++; return { ok: true, data: true }; },
    pickAttachment: async () => { hooks.pickAttachment++; return { ok: true, data: null }; },
    saveAttachment: async () => ({ ok: true, data: true }),
    importBackup: async () => { hooks.importBackup++; return { ok: true, data: null }; },
    saveBackup: async () => { hooks.saveBackup++; return { ok: true, data: true }; },
  };
  win.eval(fs.readFileSync(path.join(__dirname, '../renderer/soldier-profile.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../renderer/daily-report.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../renderer/icons.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../renderer/setup-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../renderer/modules.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8'));
  const document = win.document;
  async function until(predicate, label, ms = 10000) {
    const expires = Date.now() + ms;
    while (!(await Promise.resolve(predicate()))) {
      if (Date.now() > expires) throw new Error(`Timeout: ${label}; UI: ${document.body.textContent.slice(0, 500)}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  function fill(form, values) {
    for (const [key, value] of Object.entries(values)) {
      const el = document.querySelector(`${form} [name="${key}"]`);
      if (!el) throw new Error(`Missing field ${key} in ${form}`);
      el.value = value;
    }
  }
  function submit(form) {
    document.querySelector(form).dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  }
  async function settle(ms = 300) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
  async function clickNav(page) {
    const link = document.querySelector(`[data-page="${page}"]`);
    if (!link) throw new Error(`Navigation missing: ${page}`);
    link.click();
    await until(() => document.querySelector(`[data-page="${page}"]`)?.classList.contains('active'), `الانتقال إلى ${page}`);
  }
  function setDevice(next) {
    device = next;
    token = null;
  }
  return { win, document, pool, ipcCall, internal, gate, hooks, until, fill, submit, settle, clickNav, setDevice, origin, backupManager };
}

module.exports = { createTestApp, registerPgMem };
