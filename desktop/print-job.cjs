'use strict';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

/** Share concurrent checks and reuse a recent result without spawning PowerShell for every label. */
function createPrinterHealthCache(load = windowsPrinterHealth, { ttlMs = 10000, clock = Date.now } = {}) {
  let cached;
  let expires = 0;
  let pending;
  return () => {
    if (cached !== undefined && clock() < expires) return Promise.resolve(cached);
    if (!pending) {
      pending = Promise.resolve()
        .then(load)
        .then((result) => {
          cached = result;
          expires = clock() + ttlMs;
          return result;
        })
        .finally(() => {
          pending = undefined;
        });
    }
    // Status is advisory: refresh in the background while Windows handles the actual job.
    // Never hold an existing printer's next label behind another PowerShell startup.
    if (cached !== undefined) {
      void pending.catch(() => {});
      return Promise.resolve(cached);
    }
    return pending;
  };
}

async function windowsPrinterHealth() {
  if (process.platform !== 'win32') return [];
  const { stdout } = await exec(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Printer -ErrorAction Stop | Select-Object Name,Default,WorkOffline,PrinterStatus | ConvertTo-Json -Compress',
    ],
    { windowsHide: true, timeout: 15000, encoding: 'utf8' },
  );
  const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]');
  return Array.isArray(result) ? result : [result];
}

function validatePrinter(options, printers, health = []) {
  if (!printers.length) throw new Error('لا توجد طابعات مثبتة في Windows. ثبّت تعريف الطابعة أولًا.');
  if (!options.deviceName && !options.silent) return;
  const printer = options.deviceName
    ? printers.find((p) => p.name === options.deviceName)
    : printers.find((p) => p.isDefault);
  if (!printer)
    throw new Error(
      `الطابعة «${options.deviceName || 'الافتراضية'}» غير موجودة على هذا الجهاز. اختَر الطابعة من الإعدادات ثم احفظ.`,
    );
  const state = health.find((p) => p.Name === printer.name);
  if (state && (state.WorkOffline || [6, 7].includes(Number(state.PrinterStatus)))) {
    throw new Error(
      `الطابعة «${printer.name}» غير متصلة أو متوقفة. افتح قائمة الطباعة في Windows وألغِ «استخدام الطابعة دون اتصال» و«إيقاف الطباعة مؤقتًا»، ثم تأكد من توصيل USB.`,
    );
  }
}

function sendPrintJob(webContents, options) {
  return new Promise((resolve, reject) => {
    webContents.print(options, (success, reason) => {
      if (success) return resolve(true);
      const error = new Error(reason || 'تعذرت الطباعة');
      error.canceled = /cancel/i.test(reason || '');
      reject(error);
    });
  });
}

module.exports = { windowsPrinterHealth, createPrinterHealthCache, validatePrinter, sendPrintJob };
