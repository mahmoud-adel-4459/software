'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { newDb } = require('pg-mem');
const QRCode = require('qrcode');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const { keyPair, hashPassword, sign, requestMessage } = require('../shared/crypto.cjs');
const { Store } = require('../server/store.cjs');
const { createHandler } = require('../server/api.cjs');


test('renderer → signed API → database: login, individual, QR, gate cycle and restricted login', async t => {
  const db = newDb();
  db.public.registerFunction({ name: 'hashtext', args: ['text'], returns: 'integer', implementation: () => 1 });
  db.public.registerFunction({ name: 'pg_advisory_xact_lock', args: ['integer'], returns: 'integer', implementation: () => 1 });
  db.public.registerFunction({ name: 'pg_advisory_xact_lock_shared', args: ['integer'], returns: 'integer', implementation: () => 1 });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool(); const store = new Store(pool); await store.migrate();
  await pool.query('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), 'admin', 'مسؤول اختبار', await hashPassword('long-test-password'), 'admin']);
  const internal = { id: randomUUID(), kind: 'internal', ...keyPair() };
  const gate = { id: randomUUID(), kind: 'gate', ...keyPair() };
  const server = http.createServer(createHandler({ store, licenseProvider: () => ({ installation: 'وحدة اختبار', devices: [internal, gate] }) }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let token, device = internal;
  const documentCalls=[];
  async function ipcCall(method, apiPath, values = {}, requestId) {
    const body = method === 'GET' ? '' : JSON.stringify(values);
    const timestamp = String(Date.now()); const nonce = randomUUID();
    const headers = { 'Content-Type': 'application/json', 'X-Device-Id': device.id, 'X-Timestamp': timestamp, 'X-Nonce': nonce,
      'X-Signature': sign(device.privateKey, requestMessage({ deviceId: device.id, timestamp, nonce, method, path: apiPath, body })) };
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
  win.desktop = {
    info: async () => ({ ok: true, data: { serverUrl: 'https://server.local:8443', deviceId: device.id, fingerprint: 'test', version: '0.1.0', caImported: true } }),
    login: async values => {
      const result = await ipcCall('POST', '/api/login', values);
      if (result.ok) { token = result.data.token; delete result.data.token; }
      return result;
    },
    logout: async () => { const result = await ipcCall('POST', '/api/logout'); token = null; return result; },
    request: ipcCall,
    qr: async soldierId => {
      const record = await ipcCall('GET', `/api/soldier?id=${soldierId}`);
      const { buildQrPayload } = require('../shared/soldier-profile.cjs');
      return { ok: true, data: await QRCode.toDataURL(buildQrPayload(record.data.soldier), { errorCorrectionLevel: 'L', margin: 2, width: 420 }) };
    },
    exportDevice: async () => ({ ok: true, data: true }),
    importCA: async () => ({ ok: true, data: false }),
    configure: async () => ({ ok: true, data: true }),
    printers:async()=>({ok:true,data:[{name:'Test Printer',displayName:'طابعة اختبار'}]}),
    document:async args=>{documentCalls.push(args);return{ok:true,data:true};},
    exportReport:async()=>({ok:true,data:true}),
  };
  win.eval(fs.readFileSync(path.join(__dirname, '../renderer/soldier-profile.js'), 'utf8')+'\n'+fs.readFileSync(path.join(__dirname, '../renderer/icons.js'), 'utf8')+'\n'+fs.readFileSync(path.join(__dirname, '../renderer/setup-wizard.js'), 'utf8')+'\n'+fs.readFileSync(path.join(__dirname, '../renderer/modules.js'), 'utf8')+'\n'+fs.readFileSync(path.join(__dirname, '../renderer/app.js'), 'utf8'));
  const document = win.document;
  async function until(predicate, label) {
    const expires = Date.now() + 5000;
    while (!predicate()) {
      if (Date.now() > expires) throw new Error(`Timeout: ${label}; UI: ${document.body.textContent}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  function fill(form, values) { for (const [key, value] of Object.entries(values)) document.querySelector(`${form} [name="${key}"]`).value = value; }
  function submit(form) { document.querySelector(form).dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); }
  await until(() => document.querySelector('#login-form'), 'login form');
  fill('#login-form', { username: 'admin', password: 'long-test-password' }); submit('#login-form');
  await until(() => document.querySelector('[data-page="new"]'), 'internal navigation');
  document.querySelector('[data-page="new"]').click();
  await until(()=>document.querySelector('#soldier-form'),'new form');
  fill('#soldier-form', { name: 'أحمد <script> محمد', militaryNo: '000012345', nationalId: '30101010101011', rank: 'جندي', company: 'الأولى', unit: 'اختبار', phone: '01000000000', address: 'عنوان خاص' });
  submit('#soldier-form');
  await until(() => document.querySelector('[data-qr-preview]'), 'persisted individual');
  assert.equal(document.querySelector('.table tbody').textContent.includes('أحمد <script> محمد'), true);
  assert.equal(document.querySelector('.table tbody script'), null, 'names are rendered as escaped text');
  document.querySelector('[data-qr-preview]').click();
  await until(() => document.querySelector('.qr-preview'), 'real QR');
  assert.match(document.querySelector('.qr-preview').src, /^data:image\/png;base64,/);
  document.querySelector('[data-page="gate"]').click();
  await until(()=>document.querySelector('#gate-search'),'gate form');
  fill('#gate-search', { militaryNo: '000012345' }); submit('#gate-search');
  await until(() => document.querySelector('#gate-form[data-kind="exit"]'), 'selected gate individual');
  const future = new Date(Date.now() + 86400000);
  const localDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}T12:00`;
  const choices=document.querySelectorAll('#gate-form input[name="reason"]');
  assert.equal(choices.length,23);choices[0].click();assert.equal(choices[0].checked,true);
  assert.equal(document.querySelector('.gate-id-number').textContent,'000012345');
  fill('#gate-form', { returnDate: localDate.slice(0,10), returnTime: localDate.slice(11,16), notes: 'اختبار' }); submit('#gate-form');
  await until(() => document.querySelector('#gate-form[data-kind="entry"]'), 'exit saved — entry form');
  assert.equal((await pool.query('SELECT status FROM soldiers')).rows[0].status, 'out');
  submit('#gate-form');
  await until(() => document.querySelector('#gate-form[data-kind="exit"]'), 'entry saved — ready for next exit');
  assert.equal((await pool.query('SELECT status FROM soldiers')).rows[0].status, 'in');
  document.querySelector('[data-page="canteen"]').click();
  await until(()=>document.querySelector('#internal-lookup'),'canteen lookup');
  fill('#internal-lookup',{lookupNo:'000012345'});submit('#internal-lookup');
  await until(()=>document.querySelector('#ledger-form'),'canteen form');
  fill('#ledger-form',{amount:'12.35',notes:'شراء'});submit('#ledger-form');
  await until(()=>document.querySelector('[data-reversal]'),'canteen saved');
  assert.equal((await pool.query('SELECT amount_cents FROM canteen_transactions')).rows[0].amount_cents,1235);
  const reversal=document.querySelector('[data-reversal]');reversal.querySelector('input').value='خطأ';reversal.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>!document.querySelector('[data-reversal]'),'canteen reversal');
  assert.equal((await pool.query('SELECT * FROM canteen_transactions')).rows.length,2);
  document.querySelector('[data-page="fitness"]').click();
  await until(()=>document.querySelector('#fitness-form'),'fitness form');
  fill('#fitness-form',{type:'ضغط',value:'35',date:new Date().toISOString().slice(0,10),notes:'اختبار'});submit('#fitness-form');
  await until(()=>document.querySelector('.table tbody')?.textContent.includes('35 مرة'),'fitness saved');
  document.querySelector('[data-page="settings"]').click();
  await until(()=>document.querySelector('#settings-form'),'settings form');
  fill('#settings-form',{unitName:'وحدة من الواجهة',paper:'A5',printer:'Test Printer'});submit('#settings-form');
  await until(()=>document.getElementById('notice').textContent.includes('تم حفظ'),'settings persisted notice');
  await until(()=>document.querySelector('#settings-form [name="unitName"]')?.value==='وحدة من الواجهة'&&!document.querySelector('#settings-form button[type="submit"]').disabled,'settings save completed');
  assert.equal((await pool.query('SELECT data FROM settings')).rows[0].data.paper,'A5');
  document.querySelector('[data-page="reports"]').click();
  await until(()=>document.querySelector('#report-form'),'reports form');
  const docsBeforeReport=documentCalls.length;
  document.querySelector('[data-doc="report"][data-mode="pdf"]').click();
  await until(()=>documentCalls.length===docsBeforeReport+1,'report document sent');
  assert.equal(documentCalls.at(-1).filter.type,'soldiers');
  document.querySelector('[data-page="soldiers"]').click();
  await until(()=>document.querySelector('[data-profile]'),'profiles list');
  document.querySelector('[data-profile]').click();
  await until(()=>document.querySelector('[data-edit]'),'profile loaded');
  document.querySelector('[data-edit]').click();
  await until(()=>document.querySelector('#soldier-form'),'edit form');
  fill('#soldier-form',{phone:'01111111111',height:'178'});submit('#soldier-form');
  await until(()=>document.querySelector('[data-profile]'),'edit saved');
  const edited=(await pool.query('SELECT phone,details FROM soldiers')).rows[0];assert.equal(edited.phone,'01111111111');assert.equal(edited.details.height,'178');
  document.querySelector('#logout').click();
  await until(() => document.querySelector('#login-form'), 'logged out');
  device = gate;
  fill('#login-form', { username: 'admin', password: 'long-test-password' }); submit('#login-form');
  await until(() => document.querySelector('#gate-search'), 'gate-only navigation');
  assert.equal(document.querySelector('[data-page="soldiers"]'), null);
  assert.equal(document.querySelector('[data-page="users"]'), null);
  assert.equal(document.body.textContent.includes('عنوان خاص'), false);
  const stolen = await ipcCall('POST', '/api/soldiers', { name: 'unauthorized' }, randomUUID());
  assert.equal(stolen.status, 403);
});
