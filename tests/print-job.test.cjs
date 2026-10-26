'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrinterHealthCache, validatePrinter, sendPrintJob } = require('../desktop/print-job.cjs');

test('printer checks share in-flight work, reuse fresh status and refresh after expiry', async () => {
  let now = 0;
  let calls = 0;
  let finish;
  const read = createPrinterHealthCache(() => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  }, { ttlMs: 10, clock: () => now });
  const first = read();
  assert.equal(read(), first);
  await Promise.resolve();
  finish([{ Name: 'XP', WorkOffline: false }]);
  assert.equal((await first)[0].WorkOffline, false);
  now = 9;
  assert.equal((await read())[0].WorkOffline, false);
  assert.equal(calls, 1);
  now = 10;
  const stale = read();
  await Promise.resolve();
  assert.equal((await stale)[0].WorkOffline, false);
  finish([{ Name: 'XP', WorkOffline: true }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await read())[0].WorkOffline, true);
  assert.equal(calls, 2);
});

test('failed printer checks are retried rather than cached', async () => {
  let calls = 0;
  const read = createPrinterHealthCache(async () => {
    if (++calls === 1) throw new Error('status unavailable');
    return [];
  });
  await assert.rejects(read(), /status unavailable/);
  assert.deepEqual(await read(), []);
  assert.equal(calls, 2);
});

const printers = [{ name: 'Xprinter XP-246B', isDefault: true }, { name: 'XP-90 (copy 2)', isDefault: false }];

test('printing rejects missing printers and stale names copied from a different PC', () => {
  assert.throws(() => validatePrinter({ silent: false }, []), /لا توجد طابعات/);
  assert.throws(() => validatePrinter({ deviceName: 'Old printer', silent: true }, printers), /غير موجودة/);
  assert.doesNotThrow(() => validatePrinter({ deviceName: 'XP-90 (copy 2)', silent: true }, printers));
});

test('Windows offline queues never report print success', () => {
  assert.throws(() => validatePrinter({ deviceName: 'Xprinter XP-246B' }, printers, [{ Name: 'Xprinter XP-246B', WorkOffline: true, PrinterStatus: 3 }]), /غير متصلة/);
  assert.throws(() => validatePrinter({ silent: true }, printers, [{ Name: 'Xprinter XP-246B', WorkOffline: false, PrinterStatus: 7 }]), /غير متصلة/);
  assert.doesNotThrow(() => validatePrinter({ silent: false }, printers, [{ Name: 'Xprinter XP-246B', WorkOffline: true }]));
});

test('waits for native print callback, and propagates failure and cancellation', async () => {
  let callback;
  let finished = false;
  const job = sendPrintJob({ print: (_options, cb) => { callback = cb; } }, {}).then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  callback(true);
  await job;
  assert.equal(finished, true);
  await assert.rejects(sendPrintJob({ print: (_options, cb) => cb(false, 'Print job failed') }, {}), /Print job failed/);
  await assert.rejects(sendPrintJob({ print: (_options, cb) => cb(false, 'Print job canceled') }, {}), (error) => error.canceled === true);
});
