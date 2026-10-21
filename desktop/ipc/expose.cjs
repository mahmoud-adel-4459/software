'use strict';
/**
 * `expose(channel, handler)` registers an IPC channel that only the app's own main window
 * (top frame, loaded from renderer/index.html) may call. Handlers return data or throw;
 * the renderer always receives { ok, data } or { ok:false, error, status }.
 */
function createExpose({ ipcMain, getWindow, entryUrl }) {
  return function expose(channel, handler) {
    ipcMain.handle(channel, async (event, arg) => {
      const win = getWindow();
      const fromMainWindow =
        win &&
        event.sender === win.webContents &&
        event.senderFrame === win.webContents.mainFrame &&
        event.senderFrame.url.split('#')[0] === entryUrl;
      if (!fromMainWindow) throw new Error('مصدر الطلب غير مسموح');
      try {
        return { ok: true, data: await handler(arg) };
      } catch (error) {
        return { ok: false, error: error.message, status: error.status || 0 };
      }
    });
  };
}

module.exports = { createExpose };
