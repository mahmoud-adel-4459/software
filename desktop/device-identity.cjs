'use strict';
/** The device's signing identity { id, privateKey, publicKey } for the current run mode. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { keyPair } = require('../shared/crypto.cjs');
const { labDevicesFile } = require('./bundled-files.cjs');
const mode = require('./runtime-mode.cjs');

const pickInternal = (devicesFile) => {
  const { id, privateKey, publicKey } = JSON.parse(fs.readFileSync(devicesFile, 'utf8')).internal;
  return { id, privateKey, publicKey };
};

/** Normal mode: key pair created once and stored encrypted by the OS (Windows DPAPI). */
function loadProtectedIdentity(userDataDir, safeStorage) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('حماية مفاتيح الجهاز غير متاحة على نظام التشغيل');
  const file = path.join(userDataDir, 'device.enc');
  if (fs.existsSync(file)) return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
  const identity = { id: randomUUID(), ...keyPair() };
  fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(identity)), { flag: 'wx' });
  return identity;
}

function loadIdentity({ userDataDir, safeStorage }) {
  if (mode.isStandaloneMode()) {
    const devices = path.join(userDataDir, 'standalone', 'devices.json');
    if (!fs.existsSync(devices)) throw new Error('جاري تهيئة الخادم المحلي…');
    return pickInternal(devices);
  }
  if (mode.isLabMode()) {
    const lab = labDevicesFile();
    if (!lab) throw new Error('شغّل npm.cmd run lab:setup ثم أعد بناء النسخة المحمولة (npm.cmd run pack:portable)');
    return pickInternal(lab);
  }
  return loadProtectedIdentity(userDataDir, safeStorage);
}

module.exports = { loadIdentity };
