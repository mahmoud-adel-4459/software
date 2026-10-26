'use strict';
/**
 * Electron main process entry. This file only wires things together:
 *   runtime-mode      how the app was started (play / standalone / lab / normal)
 *   connection        server address, device identity and the signed-in session
 *   ipc/*             the only functions the renderer may call (see preload.cjs)
 *   output.cjs        printing, PDF, CSV, attachments, backups files
 *   main-window       the locked-down window
 */
const { app, BrowserWindow, ipcMain, dialog, safeStorage, Menu, session, clipboard } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Connection } = require('./connection.cjs');
const { loadIdentity } = require('./device-identity.cjs');
const { createMainWindow, runSmokeTest } = require('./main-window.cjs');
const { registerOutput } = require('./output.cjs');
const mode = require('./runtime-mode.cjs');
const { createExpose } = require('./ipc/expose.cjs');
const { registerAppChannels } = require('./ipc/app-channels.cjs');
const { registerExcelChannels } = require('./ipc/excel-channels.cjs');
const { registerSessionChannels } = require('./ipc/session-channels.cjs');

// The React UI built by `npm run build` inside renderer-app.
const entryPath = path.join(__dirname, '../renderer-app/dist/index.html');
const APP_NAME = 'منظومة شؤون الوحدة الداخلية';
const entryUrl = pathToFileURL(entryPath).href;

/** Each run mode keeps its data in its own folder. */
function selectUserDataFolder() {
  if (mode.isSmokeTest()) app.setPath('userData', path.join(__dirname, '../artifacts/smoke-profile'));
  if (mode.isPlayMode()) {
    const local = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    app.setPath('userData', path.join(local, 'Military Affairs Play'));
  } else if (mode.isLabMode()) {
    app.setPath('userData', path.join(__dirname, '../lab-user-data'));
  }
  // Lets automated tests run against a throw-away profile instead of the real data folder.
  if (process.env.MILITARY_AFFAIRS_USER_DATA) app.setPath('userData', process.env.MILITARY_AFFAIRS_USER_DATA);
}

/** Standalone/play: start the embedded server on this PC and point the connection at it. */
async function startStandaloneServer(connection, userDataDir) {
  const { startEmbeddedServer } = require('./embedded-server.cjs');
  const server = await startEmbeddedServer({
    userDataDir,
    host: '127.0.0.1',
    port: 8443,
    playMode: mode.isPlayMode(),
    lan: mode.networkRoleInEffect() === 'host',
  });
  connection.useEmbeddedServer(server);
  fs.writeFileSync(path.join(userDataDir, 'standalone.enabled'), '1', 'utf8');
  if (mode.isPlayMode() && server.loginPath && fs.existsSync(server.loginPath)) {
    fs.copyFileSync(server.loginPath, mode.playLoginHintPath(app));
  }
  return server;
}

function loadConnectionSettings(connection) {
  connection.loadSaved();
  if (mode.isLabMode()) connection.useLabDefaults();
  else connection.applyBundledCaIfLocal();
}

async function main() {
  mode.applyPackagedDefaults(app);
  selectUserDataFolder();
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  const dataDir = app.getPath('userData'); // keep the existing data folder when the display name changes
  app.setName(APP_NAME);
  app.setPath('userData', dataDir);
  await app.whenReady();
  const userDataDir = app.getPath('userData');
  fs.mkdirSync(userDataDir, { recursive: true });

  let win = null;
  let outputs = null;
  const connection = new Connection({ userDataDir, onSignedOut: () => outputs?.close() });

  let embeddedServer = null;
  if (mode.isStandaloneMode()) embeddedServer = await startStandaloneServer(connection, userDataDir);
  else loadConnectionSettings(connection);
  connection.identity = loadIdentity({ userDataDir, safeStorage });

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  const getWindow = () => win;
  const expose = createExpose({ ipcMain, getWindow, entryUrl });
  registerAppChannels({
    expose,
    app,
    dialog,
    clipboard,
    connection,
    getWindow,
    getEmbeddedServer: () => embeddedServer,
  });
  registerExcelChannels({ expose, dialog, getWindow });
  const { api } = registerSessionChannels({ expose, connection, onSignedIn: () => outputs?.warmup() });
  outputs = registerOutput({
    expose,
    app,
    BrowserWindow,
    dialog,
    window: getWindow,
    getSession: () => connection.session,
    api,
  });

  Menu.setApplicationMenu(null);
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    outputs.close();
    try {
      if (embeddedServer) await embeddedServer.shutdown();
    } catch (error) {
      console.error('Shutdown failed:', error.message);
    } finally {
      app.quit();
    }
  };
  app.on('before-quit', (event) => {
    if (!shuttingDown) { event.preventDefault(); void shutdown(); }
  });
  app.on('window-all-closed', () => { void shutdown(); });
  win = createMainWindow();
  win.on('closed', () => { win = null; void shutdown(); });
  await win.loadFile(entryPath);
  if (mode.isSmokeTest()) await runSmokeTest(app, win);

  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

main().catch((error) => {
  console.error(error.message);
  dialog.showErrorBox(APP_NAME, `تعذر تشغيل البرنامج:\n${error.message}`);
  app.exit(1);
});
