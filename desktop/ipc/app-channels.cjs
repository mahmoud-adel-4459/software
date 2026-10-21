'use strict';
/** IPC channels about the app itself: info, clipboard, server address, trusted CA, device request. */
const fs = require('node:fs');
const { fingerprint } = require('../../shared/crypto.cjs');
const { getMachineIdentity } = require('../../shared/machine-id.cjs');
const { readBundledCa, isCaCertificate } = require('../bundled-files.cjs');
const mode = require('../runtime-mode.cjs');

const MAX_CLIPBOARD_CHARS = 4096;

function registerAppChannels({ expose, app, dialog, clipboard, connection, getWindow, getEmbeddedServer }) {
  expose('app:info', () => {
    const machine = getMachineIdentity(app.getPath('userData'));
    const { identity, config } = connection;
    return {
      deviceId: identity.id,
      fingerprint: fingerprint(identity.publicKey),
      machineId: machine.machineId,
      machineGuid: machine.machineGuid,
      serverUrl: config.serverUrl,
      caImported: Boolean(config.ca),
      version: app.getVersion(),
      labMode: mode.isLabMode(),
      standaloneMode: mode.isStandaloneMode(),
      playMode: mode.isPlayMode(),
      loginHintPath: mode.isPlayMode() ? mode.playLoginHintPath(app) : getEmbeddedServer()?.loginPath || null,
    };
  });

  expose('app:copy-text', (text) => {
    if (typeof text !== 'string' || text.length > MAX_CLIPBOARD_CHARS) throw new Error('نص غير صالح للنسخ');
    clipboard.writeText(text);
    return true;
  });

  expose('app:configure', (value) => connection.setServerUrl(value));

  expose('app:import-ca', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'اختيار شهادة الجهة الداخلية الموثوقة',
      filters: [{ name: 'CA certificate', extensions: ['pem', 'crt'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return false;
    const pem = fs.readFileSync(result.filePaths[0], 'utf8');
    if (!isCaCertificate(pem)) throw new Error('اختر شهادة CA داخلية صالحة، وليس مفتاحًا خاصًا');
    connection.setCa(pem);
    return true;
  });

  expose('app:import-bundled-ca', () => {
    const pem = readBundledCa();
    if (!pem) {
      throw new Error(
        'لا توجد شهادة تجربة محلية مدمجة. للتجربة استخدم مجلد Demo-Lab على سطح المكتب، أو اختر ملف ca-cert.pem يدويًا.',
      );
    }
    connection.setCa(pem);
    return true;
  });

  /** Saves the request an administrator sends to the owner to license this device. */
  expose('app:export-device', async () => {
    const result = await dialog.showSaveDialog(getWindow(), {
      title: 'حفظ طلب اعتماد الجهاز',
      defaultPath: 'device-request.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled) return false;
    const { id, publicKey } = connection.identity;
    fs.writeFileSync(result.filePath, JSON.stringify({ id, publicKey, fingerprint: fingerprint(publicKey) }, null, 2));
    return true;
  });
}

module.exports = { registerAppChannels };
