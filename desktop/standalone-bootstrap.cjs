'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { keyPair, fingerprint, hashPassword } = require('../shared/crypto.cjs');

function standaloneRoot(userDataDir) {
  return path.join(userDataDir, 'standalone');
}

function copyTlsFromBundle(tlsDir) {
  const candidates = [
    path.join(__dirname, '../private'),
    path.join(path.dirname(process.execPath), 'private'),
    path.join(process.resourcesPath, 'private'),
    path.join(process.resourcesPath, 'lab-demo'),
  ];
  for (const dir of candidates) {
    const ca = path.join(dir, 'ca-cert.pem');
    const cert = path.join(dir, 'server-cert.pem');
    const key = path.join(dir, 'server-key.pem');
    if (fs.existsSync(ca) && fs.existsSync(cert) && fs.existsSync(key)) {
      fs.mkdirSync(tlsDir, { recursive: true });
      fs.copyFileSync(ca, path.join(tlsDir, 'ca-cert.pem'));
      fs.copyFileSync(cert, path.join(tlsDir, 'server-cert.pem'));
      fs.copyFileSync(key, path.join(tlsDir, 'server-key.pem'));
      return;
    }
  }
  throw new Error('شهادات TLS غير موجودة. شغّل npm.cmd run lab:setup مرة واحدة على جهاز التطوير، أو استخدم Demo-Lab.');
}

function ensureStandalone(userDataDir, opts = {}) {
  const playMode = Boolean(opts.playMode);
  const root = standaloneRoot(userDataDir);
  const tlsDir = path.join(root, 'tls');
  const devicesPath = path.join(root, 'devices.json');
  const metaPath = path.join(root, 'meta.json');
  const loginPath = path.join(root, 'login.txt');
  fs.mkdirSync(root, { recursive: true });

  if (!fs.existsSync(path.join(tlsDir, 'ca-cert.pem'))) copyTlsFromBundle(tlsDir);

  let devices;
  if (fs.existsSync(devicesPath)) {
    devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
  } else {
    const internal = { id: randomUUID(), kind: 'internal', ...keyPair() };
    const gate = { id: randomUUID(), kind: 'gate', ...keyPair() };
    devices = {
      internal: { id: internal.id, kind: 'internal', publicKey: internal.publicKey, privateKey: internal.privateKey, fingerprint: fingerprint(internal.publicKey) },
      gate: { id: gate.id, kind: 'gate', publicKey: gate.publicKey, privateKey: gate.privateKey, fingerprint: fingerprint(gate.publicKey) },
    };
    fs.writeFileSync(devicesPath, JSON.stringify(devices, null, 2));
  }

  let meta;
  if (fs.existsSync(metaPath)) {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } else {
    const adminPassword = playMode ? 'PlayLocal-Admin12!' : `Local-${randomBytes(9).toString('base64url')}!`;
    meta = {
      serverId: randomUUID(),
      adminUsername: 'admin',
      adminName: 'مسؤول الوحدة',
      adminPassword,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    fs.writeFileSync(loginPath, `خادم محلي (offline)\r\nUsername: admin\r\nPassword: ${adminPassword}\r\n`, 'utf8');
  }

  const ca = fs.readFileSync(path.join(tlsDir, 'ca-cert.pem'), 'utf8');
  return {
    root,
    tlsDir,
    devices,
    meta,
    ca,
    certPath: path.join(tlsDir, 'server-cert.pem'),
    keyPath: path.join(tlsDir, 'server-key.pem'),
    dbDir: path.join(root, 'database'),
    loginPath,
  };
}

async function ensureAdminUser(pool, meta) {
  const existing = await pool.query("SELECT id FROM users WHERE role='admin' AND disabled=false LIMIT 1");
  if (existing.rows.length) return;
  await pool.query('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), meta.adminUsername, meta.adminName, await hashPassword(meta.adminPassword), 'admin']);
}

function ensureBackupKey(root) {
  const keyPath = path.join(root, 'backup-key.hex');
  if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8').trim();
  const key = randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

module.exports = { ensureStandalone, ensureAdminUser, standaloneRoot, ensureBackupKey };
