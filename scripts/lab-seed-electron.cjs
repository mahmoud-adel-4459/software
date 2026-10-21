'use strict';
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const profile = path.join(root, 'artifacts', 'lab-electron-profile');
const devicesPath = path.join(root, 'private', 'lab-devices.json');
const caPath = path.join(root, 'private', 'ca-cert.pem');

app.whenReady().then(() => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('DPAPI unavailable — run on Windows logged-in user session');
  if (!fs.existsSync(devicesPath)) throw new Error('Run npm.cmd run lab:setup first');
  app.setPath('userData', profile);
  fs.mkdirSync(profile, { recursive: true });
  const internal = JSON.parse(fs.readFileSync(devicesPath, 'utf8')).internal;
  const identity = { id: internal.id, privateKey: internal.privateKey, publicKey: internal.publicKey };
  const deviceFile = path.join(profile, 'device.enc');
  if (fs.existsSync(deviceFile)) fs.unlinkSync(deviceFile);
  fs.writeFileSync(deviceFile, safeStorage.encryptString(JSON.stringify(identity)), { flag: 'wx' });
  fs.writeFileSync(path.join(profile, 'connection.json'), JSON.stringify({
    serverUrl: 'https://127.0.0.1:8443',
    ca: fs.readFileSync(caPath, 'utf8'),
  }, null, 2));
  console.log('Electron lab profile ready:', profile);
  app.quit();
});
app.on('window-all-closed', () => {});
