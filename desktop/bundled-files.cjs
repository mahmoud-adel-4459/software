'use strict';
/** Files shipped next to the app for demo/lab use: lab device keys and the demo CA certificate. */
const fs = require('node:fs');
const path = require('node:path');
const { X509Certificate } = require('node:crypto');

const MAX_CERT_BYTES = 65536;

/** Path of private/lab-devices.json (inside the app or beside the .exe), or null. */
function labDevicesFile() {
  const bundled = path.join(__dirname, '../private/lab-devices.json');
  if (fs.existsSync(bundled)) return bundled;
  const besideExe = path.join(path.dirname(process.execPath), 'private', 'lab-devices.json');
  return fs.existsSync(besideExe) ? besideExe : null;
}

function bundledCaPaths() {
  return [
    path.join(__dirname, '../private/ca-cert.pem'),
    path.join(path.dirname(process.execPath), 'private', 'ca-cert.pem'),
    path.join(process.resourcesPath, 'lab-demo', 'ca-cert.pem'),
  ];
}

/** True when `pem` is a CA certificate (never a private key) of sane size. */
function isCaCertificate(pem) {
  return pem.length <= MAX_CERT_BYTES && new X509Certificate(pem).ca;
}

/** First valid bundled CA certificate (PEM text), or null. */
function readBundledCa() {
  for (const caPath of bundledCaPaths()) {
    if (!fs.existsSync(caPath)) continue;
    const pem = fs.readFileSync(caPath, 'utf8');
    if (isCaCertificate(pem)) return pem;
  }
  return null;
}

module.exports = { labDevicesFile, readBundledCa, isCaCertificate };
