'use strict';
/** IPC channels about the app itself: info, clipboard, server address, trusted CA, device request. */
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const tls = require('node:tls');
const { X509Certificate } = require('node:crypto');
const { fingerprint } = require('../../shared/crypto.cjs');
const { getMachineIdentity } = require('../../shared/machine-id.cjs');
const { readBundledCa, isCaCertificate } = require('../bundled-files.cjs');
const mode = require('../runtime-mode.cjs');
const networkRole = require('../network-role.cjs');

const MAX_CLIPBOARD_CHARS = 4096;
const DEFAULT_PORT = 8443;

/** "192.168.1.9" or "unit-pc" → "https://192.168.1.9:8443". */
function normalizeAddress(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 200) throw new Error('أدخل عنوان جهاز الوحدة');
  const url = new URL(/^https?:\/\//i.test(text) ? text.replace(/^http:/i, 'https:') : `https://${text}`);
  if (!url.port) url.port = String(DEFAULT_PORT);
  return url.origin;
}

/** Downloads the CA the unit PC presents (chain: server certificate + CA) without trusting it yet. */
function fetchPresentedCa(serverUrl) {
  const url = new URL(serverUrl);
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port || DEFAULT_PORT),
      servername: net.isIP(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: false,
      timeout: 8000,
    });
    socket.once('secureConnect', () => {
      const chain = [];
      for (let cert = socket.getPeerCertificate(true); cert?.raw; cert = cert.issuerCertificate) {
        if (chain.some((c) => c.fingerprint256 === cert.fingerprint256)) break;
        chain.push(cert);
      }
      socket.end();
      const root = chain.map((c) => new X509Certificate(c.raw)).find((c) => c.ca && c.checkIssued(c));
      if (!root)
        return reject(new Error('جهاز الوحدة لا يرسل شهادة الربط؛ فعّل «مشاركة على الشبكة» عليه ثم أعد تشغيله.'));
      resolve(root.toString());
    });
    socket.once('timeout', () => socket.destroy(new Error('timeout')));
    socket.once('error', (error) => {
      const hint =
        error.code === 'ECONNREFUSED' || error.message === 'timeout'
          ? 'تأكد أن برنامج جهاز الوحدة مفتوح و«مشاركة على الشبكة» مفعّلة، وأن جدار الحماية يسمح بالبرنامج.'
          : 'تحقق من العنوان والشبكة.';
      reject(new Error(`تعذر الوصول إلى جهاز الوحدة (${url.host}). ${hint}`));
    });
  });
}

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
      networkRole: mode.networkRoleInEffect(),
      loginHintPath: mode.isPlayMode() ? mode.playLoginHintPath(app) : getEmbeddedServer()?.loginPath || null,
    };
  });

  /** Unit PC: the addresses and pairing code to enter on a gate PC. */
  expose('app:network', () => {
    const server = getEmbeddedServer();
    const sharing = Boolean(server?.lan);
    const origin = (host) => `https://${host}:${server?.port || DEFAULT_PORT}`;
    return {
      role: mode.networkRoleInEffect(),
      sharing,
      addresses: sharing ? networkRole.lanAddresses().map(origin) : [],
      hostname: sharing ? origin(os.hostname()) : null,
      pairingCode: sharing ? networkRole.pairingCode(server.ca) : null,
    };
  });

  /** Switches this PC's network role and restarts the app in that mode. */
  expose('app:set-network-role', (role) => {
    if (!networkRole.ROLES.includes(role)) throw new Error('دور الجهاز غير صالح');
    const s = connection.session;
    if (role === 'host' && !(s && s.kind === 'internal' && s.user.role === 'admin')) {
      throw new Error('تفعيل المشاركة على الشبكة متاح للمسؤول فقط');
    }
    networkRole.writeRole(role);
    setTimeout(() => networkRole.relaunchAs(app, role), 300);
    return true;
  });

  /** Gate PC: saves the unit PC address and trusts its CA after checking the pairing code. */
  expose('app:pair', async (arg) => {
    if (mode.networkRoleInEffect() !== 'client') throw new Error('الربط متاح على جهاز البوابة فقط');
    const code = networkRole.normalizeCode(arg?.code);
    if (code.length !== 16) throw new Error('أدخل رمز الربط كما يظهر على جهاز الوحدة (16 حرفًا ورقمًا)');
    const serverUrl = normalizeAddress(arg?.address);
    const ca = await fetchPresentedCa(serverUrl);
    if (networkRole.normalizeCode(networkRole.pairingCode(ca)) !== code) {
      throw new Error('رمز الربط غير مطابق لجهاز الوحدة على هذا العنوان. راجع الرمز والعنوان.');
    }
    connection.setServerUrl(serverUrl);
    connection.setCa(ca);
    return { serverUrl };
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
