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
