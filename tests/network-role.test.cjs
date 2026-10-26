'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { X509Certificate } = require('node:crypto');
const { createLocalTls, ensureLanCertificate } = require('../desktop/local-tls.cjs');
const { pairingCode, normalizeCode } = require('../desktop/network-role.cjs');

const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');

test('unit PC certificate covers its LAN name/addresses and keeps the CA when the address changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-tls-'));
  createLocalTls(dir);
  const firstCa = read(dir, 'ca-cert.pem');
  assert.equal(ensureLanCertificate(dir, { hostname: 'unit-pc', ips: ['192.168.1.9'] }), false, 'CA kept');
  let san = new X509Certificate(read(dir, 'server-cert.pem')).subjectAltName;
  assert.match(san, /DNS:unit-pc/);
  assert.match(san, /IP Address:192\.168\.1\.9/);
  assert.match(san, /IP Address:127\.0\.0\.1/);

  ensureLanCertificate(dir, { hostname: 'unit-pc', ips: ['10.0.0.5'] });
  san = new X509Certificate(read(dir, 'server-cert.pem')).subjectAltName;
  assert.match(san, /IP Address:10\.0\.0\.5/);
  assert.equal(read(dir, 'ca-cert.pem'), firstCa, 'gate PCs stay paired after an address change');
  assert.ok(new X509Certificate(read(dir, 'server-cert.pem')).checkIssued(new X509Certificate(firstCa)));
});

test('older installs without a saved CA key get a fresh CA once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-tls-'));
  createLocalTls(dir);
  fs.unlinkSync(path.join(dir, 'ca-key.pem'));
  const oldCa = read(dir, 'ca-cert.pem');
  assert.equal(ensureLanCertificate(dir, { hostname: 'unit-pc', ips: ['192.168.1.9'] }), true);
  assert.notEqual(read(dir, 'ca-cert.pem'), oldCa);
  assert.ok(fs.existsSync(path.join(dir, 'ca-key.pem')));
});

test('pairing code is a stable 16-character fingerprint of the CA', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-tls-'));
  createLocalTls(dir);
  const code = pairingCode(read(dir, 'ca-cert.pem'));
  assert.match(code, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  assert.equal(normalizeCode(code.toLowerCase().replace(/-/g, ' ')), code.replace(/-/g, ''));
});
