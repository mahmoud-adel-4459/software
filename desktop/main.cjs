'use strict';
const { app, BrowserWindow, ipcMain, dialog, safeStorage, Menu, session, clipboard } = require('electron');
const { getMachineIdentity } = require('../shared/machine-id.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID, X509Certificate } = require('node:crypto');
const QRCode = require('qrcode');
const { keyPair, fingerprint } = require('../shared/crypto.cjs');
const { buildQrPayload, buildVisitorQrPayload } = require('../shared/soldier-profile.cjs');
const { validateServer, callServer } = require('./transport.cjs');
const {registerOutput}=require('./output.cjs');
let win, identity, config, token = null, currentUser = null, outputs, embeddedServer = null;
const entryPath = path.join(__dirname, '../renderer/index.html');
const entryUrl = pathToFileURL(entryPath).href;
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
function readBundledCa() {
  for (const caPath of bundledCaPaths()) {
    if (!fs.existsSync(caPath)) continue;
    const cert = fs.readFileSync(caPath, 'utf8');
    if (cert.length > 65536 || !new X509Certificate(cert).ca) continue;
    return cert;
  }
  return null;
}
function applyBundledCaIfLocal() {
  const url = config.serverUrl || '';
  if (!/^https:\/\/127\.0\.0\.1:8443\/?$/i.test(url) && !/^https:\/\/localhost:8443\/?$/i.test(url)) return false;
  if (config.ca) return true;
  const cert = readBundledCa();
  if (!cert) return false;
  config.ca = cert;
  saveConfig();
  return true;
}
function isPlayMode() {
  return process.argv.includes('--play') || process.env.MILITARY_AFFAIRS_PLAY === '1';
}
function isLabMode() {
  if (isStandaloneMode()) return false;
  return process.argv.includes('--lab') || process.env.MILITARY_AFFAIRS_LAB === '1' || Boolean(labDevicesFile());
}
function isStandaloneMode() {
  return isPlayMode() || process.argv.includes('--standalone') || process.env.MILITARY_AFFAIRS_STANDALONE === '1';
}
function standaloneDevicesPath() {
  return file('standalone/devices.json');
}
function file(name) { return path.join(app.getPath('userData'), name); }
function saveConfig() { fs.writeFileSync(file('connection.json'), JSON.stringify(config, null, 2)); }
function loadIdentity() {
  if (isStandaloneMode()) {
    const p = standaloneDevicesPath();
    if (!fs.existsSync(p)) throw new Error('جاري تهيئة الخادم المحلي…');
    const internal = JSON.parse(fs.readFileSync(p, 'utf8')).internal;
    return { id: internal.id, privateKey: internal.privateKey, publicKey: internal.publicKey };
  }
  if (isLabMode()) {
    const lab = labDevicesFile();
    if (!lab) throw new Error('شغّل npm.cmd run lab:setup ثم أعد بناء النسخة المحمولة (npm.cmd run pack:portable)');
    const internal = JSON.parse(fs.readFileSync(lab, 'utf8')).internal;
    return { id: internal.id, privateKey: internal.privateKey, publicKey: internal.publicKey };
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('حماية مفاتيح الجهاز غير متاحة على نظام التشغيل');
  if (fs.existsSync(file('device.enc'))) {
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(file('device.enc'))));
  }
  const value = { id: randomUUID(), ...keyPair() };
  fs.writeFileSync(file('device.enc'), safeStorage.encryptString(JSON.stringify(value)), { flag: 'wx' });
  return value;
}
function expose(channel, handler) {
  ipcMain.handle(channel, async (event, arg) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== entryUrl) {
      throw new Error('مصدر الطلب غير مسموح');
    }
    try { return { ok: true, data: await handler(arg) }; }
    catch (error) { return { ok: false, error: error.message, status: error.status || 0 }; }
  });
}
function connected() { if (!config.serverUrl) throw new Error('اضبط عنوان الخادم أولًا'); }
function applyPackagedDefaults() {
  if (!app.isPackaged) return;
  const explicit = ['--lab', '--standalone', '--play', '--remote', '--smoke'].some(a => process.argv.includes(a));
  if (explicit || process.env.MILITARY_AFFAIRS_REMOTE === '1') return;
  process.argv.push('--play');
  process.env.MILITARY_AFFAIRS_PLAY = '1';
}
async function main() {
  applyPackagedDefaults();
  if (process.argv.includes('--smoke')) app.setPath('userData', path.join(__dirname, '../artifacts/smoke-profile'));
  if (isPlayMode()) {
    const local = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    app.setPath('userData', path.join(local, 'Military Affairs Play'));
  }
  else if (isLabMode()) app.setPath('userData', path.join(__dirname, '../lab-user-data'));
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.setName('Military Affairs');
  await app.whenReady();
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  if (isStandaloneMode()) {
    const { startEmbeddedServer } = require('./embedded-server.cjs');
    embeddedServer = await startEmbeddedServer({
      userDataDir: app.getPath('userData'), host: '127.0.0.1', port: 8443, playMode: isPlayMode(),
    });
    config = { serverUrl: embeddedServer.origin, ca: embeddedServer.ca };
    saveConfig();
    fs.writeFileSync(file('standalone.enabled'), '1', 'utf8');
    if (isPlayMode() && embeddedServer.loginPath && fs.existsSync(embeddedServer.loginPath)) {
      const hint = path.join(__dirname, '../play-login.txt');
      fs.copyFileSync(embeddedServer.loginPath, hint);
    }
  } else {
    config = fs.existsSync(file('connection.json')) ? JSON.parse(fs.readFileSync(file('connection.json'), 'utf8')) : { serverUrl: '' };
    if (isLabMode()) {
      config.ca = config.ca || readBundledCa();
      if (!config.serverUrl) config.serverUrl = 'https://127.0.0.1:8443';
      saveConfig();
    } else {
      applyBundledCaIfLocal();
    }
  }
  identity = loadIdentity();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  expose('app:info', () => {
    const machine = getMachineIdentity(app.getPath('userData'));
    return {
      deviceId: identity.id, fingerprint: fingerprint(identity.publicKey),
      machineId: machine.machineId, machineGuid: machine.machineGuid,
      serverUrl: config.serverUrl, caImported: Boolean(config.ca), version: app.getVersion(),
      labMode: isLabMode(), standaloneMode: isStandaloneMode(), playMode: isPlayMode(),
      loginHintPath: isPlayMode() ? path.join(__dirname, '../play-login.txt') : (embeddedServer?.loginPath || null),
    };
  });
  expose('app:copy-text', text => {
    if (typeof text !== 'string' || text.length > 4096) throw new Error('نص غير صالح للنسخ');
    clipboard.writeText(text);
    return true;
  });
  expose('app:configure', value => { config.serverUrl = validateServer(value); token = null; currentUser = null;outputs?.close(); saveConfig(); return config.serverUrl; });
  expose('app:import-ca', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'اختيار شهادة الجهة الداخلية الموثوقة', filters: [{ name: 'CA certificate', extensions: ['pem', 'crt'] }], properties: ['openFile'] });
    if (result.canceled) return false;
    const cert = fs.readFileSync(result.filePaths[0], 'utf8');
    if (cert.length > 65536 || !new X509Certificate(cert).ca) throw new Error('اختر شهادة CA داخلية صالحة، وليس مفتاحًا خاصًا');
    config.ca = cert; saveConfig(); return true;
  });
  expose('app:import-bundled-ca', () => {
    const cert = readBundledCa();
    if (!cert) throw new Error('لا توجد شهادة تجربة محلية مدمجة. للتجربة استخدم مجلد Demo-Lab على سطح المكتب، أو اختر ملف ca-cert.pem يدويًا.');
    config.ca = cert;
    saveConfig();
    return true;
  });
  expose('app:export-device', async () => {
    const result = await dialog.showSaveDialog(win, { title: 'حفظ طلب اعتماد الجهاز', defaultPath: 'device-request.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled) return false;
    fs.writeFileSync(result.filePath, JSON.stringify({ id: identity.id, publicKey: identity.publicKey, fingerprint: fingerprint(identity.publicKey) }, null, 2));
    return true;
  });
  expose('app:login', async data => {
    connected();
    if (!config.ca && /^https:\/\/(127\.0\.0\.1|localhost):8443\/?$/i.test(config.serverUrl || '')) {
      applyBundledCaIfLocal();
    }
    token = null; currentUser = null;outputs?.close();
    const result = await callServer(config, identity, null, 'POST', '/api/login', data);
    token = result.token; currentUser = { user: result.user, kind: result.kind, installation: result.installation };
    return currentUser; // Session token never enters the renderer.
  });
  expose('app:logout', async () => {
    const previous = token; token = null; currentUser = null;outputs?.close();
    if (previous) await callServer(config, identity, previous, 'POST', '/api/logout', {});
    return true;
  });
  expose('app:request', async arg => {
    connected();
    if (!token || !currentUser) throw new Error('سجل الدخول أولًا');
    const allowed = arg && ((arg.method === 'GET' && /^\/api\/(soldiers|soldier|gate\/soldier|gate\/visitor|visitors|permits|permit|summary|admin\/users|catalog|photos|attachment|canteen(?:\/transaction)?|fitness|audit|reports(?:\/daily)?|backups|backup\/preview)(?:\?[^#]*)?$/.test(arg.path)) ||
      (arg.method === 'POST' && ['/api/soldiers','/api/soldier/update','/api/soldier/archive','/api/attachments','/api/canteen','/api/canteen/reverse','/api/outlets','/api/outlets/update','/api/fitness','/api/settings','/api/users/update','/api/gate/correct','/api/backup/create','/api/backup/restore','/api/gate','/api/gate/visitor','/api/visitors','/api/visitors/update','/api/visitor-categories','/api/visitor-categories/update', '/api/admin/users'].includes(arg.path)));
    if (!allowed) throw new Error('الوظيفة غير مسموحة');
    try { return await callServer(config, identity, token, arg.method, arg.path, arg.data, arg.requestId); }
    catch (error) { if (error.status === 401) { token = null; currentUser = null;outputs?.close(); } throw error; }
  });
  expose('app:qr', async soldierId => {
    if (!token || !/^[0-9a-f-]{36}$/i.test(soldierId)) throw new Error('معرف العسكري غير صالح أو الجلسة مغلقة');
    const { soldier } = await callServer(config, identity, token, 'GET', `/api/soldier?id=${encodeURIComponent(soldierId)}`);
    const payload = buildQrPayload(soldier);
    return QRCode.toDataURL(payload, { errorCorrectionLevel: 'L', margin: 2, width: 420 });
  });
  expose('app:qrVisitor', async visitorId => {
    if (!token || !/^[0-9a-f-]{36}$/i.test(visitorId)) throw new Error('معرف الزائر غير صالح أو الجلسة مغلقة');
    const { visitor } = await callServer(config, identity, token, 'GET', `/api/gate/visitor?id=${encodeURIComponent(visitorId)}`);
    const payload = buildVisitorQrPayload(visitor);
    return QRCode.toDataURL(payload, { errorCorrectionLevel: 'L', margin: 2, width: 420 });
  });
  outputs=registerOutput({expose,app,BrowserWindow,dialog,window:()=>win,getSession:()=>currentUser,
    api:async(method,route,data,requestId)=>{
      if(!token||!currentUser)throw new Error('سجل الدخول أولًا');
      try{return await callServer(config,identity,token,method,route,data,method==='POST'?requestId||randomUUID():undefined);}
      catch(error){if(error.status===401){token=null;currentUser=null;outputs?.close();}throw error;}
    }});
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1440, height: 950, minWidth: 950, minHeight: 700, show: false, title: 'نظام شؤون العسكريين',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.once('ready-to-show', () => { if (!process.argv.includes('--smoke')) win.show(); });
  await win.loadFile(entryPath);
  if (process.argv.includes('--smoke')) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const state = await win.webContents.executeJavaScript("({ title: document.title, text: document.body.innerText, api: typeof window.desktop.login, node: typeof require })");
    const valid = state.api === 'function' && state.node === 'undefined' && state.text.includes('تسجيل الدخول');
    console.log('DESKTOP_SMOKE', JSON.stringify({ valid, ...state }));
    fs.writeFileSync(path.join(__dirname, '../artifacts/smoke.png'), (await win.webContents.capturePage()).toPNG());
    app.exit(valid ? 0 : 1);
  }
  app.on('second-instance', () => { if (win.isMinimized()) win.restore(); win.focus(); });
  app.on('window-all-closed', async () => {
    if (embeddedServer) await embeddedServer.shutdown();
    app.quit();
  });
}
main().catch(error => { console.error(error.message); app.exit(1); });
