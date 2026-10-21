'use strict';
const fs = require('node:fs');
const { verify, fingerprint } = require('../shared/crypto.cjs');
const { requireValue } = require('./errors.cjs');

function loadLicense(publicKey, envelope, serverId,serverFingerprint) {
  requireValue(envelope && typeof envelope.payload === 'string' && envelope.payload.length < 65536,
    'ملف الترخيص غير صالح', 403);
  requireValue(verify(publicKey, envelope.payload, envelope.signature), 'توقيع الترخيص غير صالح', 403);
  let license;
  try { license = JSON.parse(envelope.payload); } catch { requireValue(false, 'بيانات الترخيص غير صالحة', 403); }
  requireValue(license.version === 1 && license.serverId === serverId && typeof license.installation === 'string',
    'الترخيص لا يخص هذا الخادم', 403);
  if(serverFingerprint)requireValue(license.serverFingerprint===serverFingerprint,'الترخيص لا يخص تثبيت Windows Server الحالي؛ اطلب إعادة اعتماده',403);
  requireValue(Array.isArray(license.devices) && license.devices.length === 2 &&
    license.devices.filter(d => d.kind === 'gate').length === 1 &&
    license.devices.filter(d => d.kind === 'internal').length === 1, 'الترخيص يجب أن يعتمد جهاز بوابة وجهازًا داخليًا', 403);
  const ids = new Set();
  for (const device of license.devices) {
    requireValue(typeof device.id === 'string' && device.id.length <= 100 && !ids.has(device.id), 'هوية جهاز غير صالحة', 403);
    ids.add(device.id);
    try { requireValue(fingerprint(device.publicKey) === device.fingerprint, 'بصمة الجهاز غير صحيحة', 403); }
    catch { requireValue(false, 'مفتاح الجهاز غير صالح', 403); }
  }
  return license;
}
function fileLicenseProvider(publicKeyPath, licensePath, serverId,serverFingerprint) {
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  return () => {
    try { return loadLicense(publicKey, JSON.parse(fs.readFileSync(licensePath, 'utf8')), serverId,serverFingerprint); }
    catch (error) {
      if (error.status) throw error;
      requireValue(false, 'البرنامج يحتاج إلى ترخيص صحيح من الجهة المالكة', 403);
    }
  };
}
module.exports = { loadLicense, fileLicenseProvider };
