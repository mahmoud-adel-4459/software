'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerOutput } = require('../desktop/output.cjs');

for (const kind of ['label', 'receipt', 'office'])
  for (const action of ['print', 'preview', 'failed-print']) {
    test(`${kind} ${action}: only preview opens a document window`, async (t) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-action-'));
      t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
      const channels = {};
      const jobs = [];
      let shown = 0;
      let windowsCreated = 0;
      const session = { kind: 'internal', user: { role: 'admin', username: 'admin' } };
      class PrintWindow {
        constructor() {
          windowsCreated++;
          this.webContents = {
            setWindowOpenHandler() {},
            on() {},
            executeJavaScript: async () => true,
            getPrintersAsync: async () => [{ name: 'Label printer' }],
            print(options, callback) {
              jobs.push(options);
              callback(action !== 'failed-print', 'Print job failed');
            },
          };
        }
        on() {}
        async loadFile() {}
        show() {
          shown++;
        }
        close() {}
      }
      registerOutput({
        expose: (name, handler) => {
          channels[name] = handler;
        },
        app: { getPath: () => dir },
        BrowserWindow: PrintWindow,
        dialog: {},
        window: () => ({ webContents: { getPrintersAsync: async () => [{ name: 'Label printer', isDefault: true }] } }),
        getSession: () => session,
        api: async () => ({ settings: { labelPrinter: 'Label printer', silentPrint: false } }),
      });
      const request = channels['app:test-print']({ kind, mode: action === 'preview' ? 'preview' : 'print' });
      if (action === 'failed-print') await assert.rejects(request, /Print job failed/);
      else assert.equal(await request, true);
      assert.equal(shown, action === 'preview' ? 1 : 0);
      assert.equal(jobs.length, action === 'preview' ? 0 : 1);
      if (jobs.length) assert.equal(jobs[0].silent, true);
      if (jobs.length) assert.equal(jobs[0].deviceName, 'Label printer');
      if (action === 'print') {
        const next = channels['app:test-print']({ kind, mode: 'print' });
        assert.equal(await next, true);
        assert.equal(windowsCreated, 1);
        assert.equal(jobs.length, 2);
      }
    });
  }

test('purchase receipts reserve a number per physical copy, but previews and PDF never reserve', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-copy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const channels = {};
  const printed = [];
  const reserved = [];
  let failed = false;
  let cancellations = 0;
  const session = { kind: 'internal', user: { role: 'clerk', username: 'cashier' } };
  class PrintWindow {
    constructor() {
      this.webContents = {
        setWindowOpenHandler() {},
        on() {},
        executeJavaScript: async () => 100,
        print: (_options, callback) => {
          printed.push(this.html);
          callback(!failed, 'Print job failed');
        },
      };
    }
    on() {}
    async loadFile(file) {
      this.html = fs.readFileSync(file, 'utf8');
    }
    show() {}
    close() {}
  }
  registerOutput({
    expose: (name, handler) => {
      channels[name] = handler;
    },
    app: { getPath: () => dir },
    BrowserWindow: PrintWindow,
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
    window: () => ({ webContents: { getPrintersAsync: async () => [{ name: 'Receipt', isDefault: true }] } }),
    getSession: () => session,
    api: async (method, route) => {
      if (route === '/api/catalog') return { settings: { receiptPrinter: 'Receipt', receiptCopies: 2 } };
      if (route.startsWith('/api/canteen/transaction'))
        return { id: 'purchase', name: 'Test', amount_cents: 1250, at: new Date().toISOString() };
      if (route === '/api/canteen/receipt-print/failed') {
        cancellations++;
        return {};
      }
      assert.equal(method, 'POST');
      assert.equal(route, '/api/canteen/receipt-print');
      const printNumber = reserved.length + 1;
      reserved.push(printNumber);
      return { id: 'purchase', reservationId: `reservation-${printNumber}`, printNumber };
    },
  });
  const document = (mode) => channels['app:document']({ type: 'canteen', id: 'purchase', mode });
  await document('preview');
  await document('pdf');
  assert.equal(reserved.length, 0);
  await document('print');
  assert.deepEqual(reserved, [1, 2]);
  assert.match(printed[0], /أصل الإيصال/);
  assert.match(printed[1], /نسخة رقم 1/);
  await document('print');
  assert.match(printed[2], /نسخة رقم 2/);
  assert.match(printed[3], /نسخة رقم 3/);
  failed = true;
  await assert.rejects(document('print'), /Print job failed/);
  assert.equal(cancellations, 1);
  assert.equal(reserved.length, 5);
});
