'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const QRCode = require('qrcode');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const { buildQrPayload, parseQrScan, gateProfileRows } = require('../shared/soldier-profile.cjs');

test('QR payload includes military number and gate fields', async () => {
  const soldier = {
    military_no: '000012345',
    name: 'أحمد',
    rank: 'جندي',
    company: 'الأولى',
    unit: 'وحدة',
    phone: '010',
    address: 'القاهرة',
    details: { cardNo: '123', specialty: 'مشاة', enlistDate: '2020-01-01' },
  };
  const payload = buildQrPayload(soldier);
  const data = await QRCode.toBuffer(payload, { errorCorrectionLevel: 'L', margin: 2, width: 420 });
  const png = PNG.sync.read(data);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded.data, '000012345');
  assert.equal(parseQrScan(decoded.data), '000012345');
  assert.equal(gateProfileRows(soldier).length, 18);
});


test('visitor QR survives numeric scanner input and legacy Arabic keyboard layout', async () => {
  const { buildVisitorQrPayload, parseGateScan } = require('../shared/soldier-profile.cjs');
  for (const id of ['0f8fad5b-d9cb-469f-a165-70867728950e', '00000000-0000-0000-0000-000000000001', 'ffffffff-ffff-ffff-ffff-ffffffffffff']) {
    const payload = buildVisitorQrPayload({ id });
    assert.match(payload, /^99[0-9]{39}$/);
    const png = PNG.sync.read(await QRCode.toBuffer(payload, { width: 420, margin: 2 }));
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.ok(decoded);
    assert.deepEqual(parseGateScan(decoded.data), { kind: 'visitor', id });
    assert.deepEqual(parseGateScan(id), { kind: 'visitor', id });
    const keys = { a: 'ش', b: 'لا', c: 'ؤ', d: 'ي', e: 'ث', f: 'ب' };
    assert.deepEqual(parseGateScan(id.replace(/[a-f]/g, c => keys[c])), { kind: 'visitor', id });
  }
  assert.deepEqual(parseGateScan('99' + '9'.repeat(39)), { kind: 'none' });
});
