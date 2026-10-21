'use strict';
/** The single application window (locked down: no node, no popups, no navigation) and the --smoke check. */
const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow } = require('electron');
const { isSmokeTest } = require('./runtime-mode.cjs');

const SMOKE_PROBE =
  '({ title: document.title, text: document.body.innerText, api: typeof window.desktop.login, node: typeof require })';

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 950,
    minWidth: 950,
    minHeight: 700,
    show: false,
    title: 'منظومة شؤون الوحدة الداخلية',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.once('ready-to-show', () => {
    if (!isSmokeTest()) win.show();
  });
  return win;
}

/** `electron . -- --smoke`: loads the login screen, prints DESKTOP_SMOKE and exits (0 = healthy). */
async function runSmokeTest(app, win) {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const state = await win.webContents.executeJavaScript(SMOKE_PROBE);
  const valid = state.api === 'function' && state.node === 'undefined' && state.text.includes('تسجيل الدخول');
  console.log('DESKTOP_SMOKE', JSON.stringify({ valid, ...state }));
  fs.writeFileSync(path.join(__dirname, '../artifacts/smoke.png'), (await win.webContents.capturePage()).toPNG());
  app.exit(valid ? 0 : 1);
}

module.exports = { createMainWindow, runSmokeTest };
