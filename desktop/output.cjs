'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const QRCode = require('qrcode');
const { buildQrPayload, buildVisitorQrPayload, buildVisitorPassQrPayload } = require('../shared/soldier-profile.cjs');
const geometry = require('./documents/geometry.cjs');
const { createPrinterHealthCache, validatePrinter, sendPrintJob } = require('./print-job.cjs');
const {
  csv,
  reportTable,
  dailyReportHtml,
  documentHtml,
  cards,
  visitorLabels,
  testLabel,
  testReceipt,
  testOffice,
  voucher,
  visitorPass,
  canteenReceipt,
  canteenStatement,
  soldierFile,
  analyticReportHtml,
} = require('./documents.cjs');
function registerOutput({ expose, app, BrowserWindow, dialog, window: windowProvider, getSession, api }) {
  const previews = new Set();
  let printWindow = null;
  let printWindowReady = Promise.resolve();
  let printQueue = Promise.resolve();
  const printerList = createPrinterHealthCache(() => windowProvider().webContents.getPrintersAsync());
  let closing = false;
  function createDocumentWindow(worker = false) {
    const documentWindow = new BrowserWindow({
      show: false,
      width: 1000,
      height: 850,
      parent: worker ? undefined : windowProvider(),
      skipTaskbar: worker,
      focusable: !worker,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    previews.add(documentWindow);
    documentWindow.on('closed', () => {
      previews.delete(documentWindow);
      if (printWindow === documentWindow) printWindow = null;
      if (!worker && !closing) {
        const main = windowProvider();
        if (main && !main.isDestroyed?.()) {
          main.show?.();
          main.focus?.();
        }
      }
    });
    documentWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    documentWindow.webContents.on('will-navigate', (event) => event.preventDefault());
    return documentWindow;
  }
  function warmup() {
    void printerList().catch(() => {});
    if (!printWindow) {
      printWindow = createDocumentWindow(true);
      // Start Chromium while the user is signing in, before a label is requested.
      printWindowReady = printWindow.loadURL ? printWindow.loadURL('about:blank').catch(() => {}) : Promise.resolve();
    }
  }
  const printerHealth = createPrinterHealthCache();
  // Warm the status check during app startup, outside the user's first print request.
  void printerHealth().catch(() => {});
  const owner = () => {
    const s = getSession();
    if (!s) throw new Error('سجل الدخول أولًا');
    if (s.kind !== 'internal' || s.user.role !== 'admin') throw new Error('هذه الوظيفة متاحة للمسؤول فقط');
    return s;
  };
  const canteenPrinter = () => {
    const s = getSession();
    if (!s) throw new Error('سجل الدخول أولًا');
    if (s.kind !== 'internal' || !['admin', 'clerk'].includes(s.user.role))
      throw new Error('الطباعة متاحة للجهاز الداخلي (مسؤول أو كاشير)');
    return s;
  };
  const reportPath = (filter) => {
    const query = new URLSearchParams();
    for (const key of ['type', 'from', 'to', 'q', 'company', 'outletId'])
      if (filter?.[key]) query.set(key, String(filter[key]));
    return '/api/reports?' + query;
  };
  expose('app:printers', async () => {
    owner();
    const list = await windowProvider().webContents.getPrintersAsync();
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: Boolean(p.isDefault) }));
  });
  const QR_OPTIONS = { errorCorrectionLevel: 'L', width: 1200, margin: 2 };

  /** Renders `body` in a hidden window and previews / saves as PDF / prints it with the mode's page geometry. */
  function runJob(job) {
    if (job.action !== 'print') return renderJob(job);
    // A shared renderer must finish one native print callback before loading the next label.
    const pending = printQueue.then(async () => {
      if (!job.receipt) return renderJob(job);
      const copies = geometry.receiptConfig(job.settings).copies;
      for (let i = 0; i < copies; i++) {
        if (getSession() !== job.session) throw new Error('تغيرت الجلسة');
        const reservation = await api('POST', '/api/canteen/receipt-print', { id: job.receipt.id });
        try {
          await renderJob({
            ...job,
            settings: { ...job.settings, receiptCopies: 1 },
            body: canteenReceipt(job.receipt, job.printedBy, reservation.printNumber),
          });
        } catch (error) {
          try {
            await api('POST', '/api/canteen/receipt-print/failed', {
              id: job.receipt.id,
              reservationId: reservation.reservationId,
            });
          } catch (failure) {
            console.error('Receipt print reservation cleanup failed:', failure.message);
          }
          throw error;
        }
      }
      return true;
    });
    printQueue = pending.catch(() => {});
    return pending;
  }
  async function renderJob({
    body,
    settings,
    mode,
    action,
    session,
    calibration = false,
    title = 'شؤون العسكريين',
    requestedAt = performance.now(),
    sheetCopies,
  }) {
    if (getSession() !== session) throw new Error('تغيرت الجلسة');
    const timing = { action, mode, prepareMs: Math.round(performance.now() - requestedAt) };
    const started = performance.now();
    const folder = path.join(app.getPath('userData'), 'print');
    fs.mkdirSync(folder, { recursive: true });
    // Run device discovery while Chromium lays out the document, rather than afterwards.
    const healthReady =
      action === 'print'
        ? printerHealth().catch((error) => {
            fs.appendFileSync(
              path.join(folder, 'print-errors.log'),
              `${new Date().toISOString()} printer status: ${error.message}\n`,
            );
            return [];
          })
        : undefined;
    const source = path.join(folder, `${require('node:crypto').randomUUID()}.html`);
    fs.writeFileSync(
      source,
      documentHtml({
        title: action === 'preview' ? `معاينة — ${title}` : title,
        body,
        settings,
        mode,
        calibration,
        fontUrl: pathToFileURL(path.join(__dirname, '../fonts/plex-arabic-arabic-400.woff2')).href,
      }),
    );
    if (action === 'print') warmup();
    const preview = action === 'print' ? printWindow : createDocumentWindow();
    const cleanup = () => {
      try {
        fs.unlinkSync(source);
      } catch {
        // Temp file already gone: nothing to clean.
      }
    };
    if (action !== 'print') preview.on('closed', cleanup);
    let shown = false;
    try {
      if (action === 'print') await printWindowReady;
      const printersReady = action === 'print' ? printerList() : undefined;
      // Attach rejection handlers immediately while rendering proceeds in parallel.
      const devicesReady = printersReady
        ? Promise.all([printersReady, healthReady]).then(
            ([printers, health]) => ({ printers, health }),
            (error) => ({ error }),
          )
        : undefined;
      await preview.loadFile(source);
      await preview.webContents.executeJavaScript(
        `${mode === 'label' ? 'Promise.resolve()' : 'document.fonts.ready'}.then(() => Promise.all(Array.from(document.images, img => img.decode().catch(() => {})))).then(() => true)`,
      );
      if (mode === 'memo')
        await preview.webContents.executeJavaScript(require('./documents/memo-pagination.cjs').MEMO_PAGINATION_SCRIPT);
      timing.renderMs = Math.round(performance.now() - started);
      if (action === 'preview') {
        preview.show();
        shown = true;
        return true;
      }
      const spec = geometry.pageSpec(
        mode,
        settings,
        mode === 'receipt' ? await geometry.measureReceiptHeight(preview.webContents, settings) : undefined,
      );
      if (action === 'pdf') {
        const result = await dialog.showSaveDialog(windowProvider(), {
          title: 'حفظ PDF',
          defaultPath: 'document.pdf',
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (result.canceled) return false;
        const pdf = await preview.webContents.printToPDF(geometry.pdfOptions(spec));
        if (getSession() !== session) throw new Error('تغيرت الجلسة');
        fs.writeFileSync(result.filePath, pdf);
        return true;
      }
      const options = geometry.printOptions(spec, settings);
      if (sheetCopies > 1 && (spec.mode === 'office' || spec.mode === 'memo')) options.copies = sheetCopies;
      const devicesStarted = performance.now();
      const devices = await devicesReady;
      timing.deviceWaitMs = Math.round(performance.now() - devicesStarted);
      if (devices.error) throw devices.error;
      // The print action always sends directly; only the preview action opens a window.
      if (!options.deviceName)
        options.deviceName =
          devices.printers.find((printer) => printer.isDefault)?.name ||
          devices.health.find(
            (printer) => printer.Default && devices.printers.some((installed) => installed.name === printer.Name),
          )?.Name ||
          '';
      if (!options.deviceName) throw new Error('اختَر طابعة من الإعدادات أو عيّن طابعة افتراضية في Windows');
      options.silent = true;
      validatePrinter(options, devices.printers, devices.health);
      const sendToPrinter = async (printOptions) => {
        if (getSession() !== session) throw new Error('تغيرت الجلسة');
        try {
          return await sendPrintJob(preview.webContents, printOptions);
        } catch (error) {
          fs.appendFileSync(
            path.join(folder, 'print-errors.log'),
            `${new Date().toISOString()} ${JSON.stringify({ mode, deviceName: printOptions.deviceName, pageSize: printOptions.pageSize, error: error.message })}\n`,
          );
          throw error;
        }
      };
      // Receipts: one job per copy (each its own page); everything else prints once.
      const copies = mode === 'receipt' && !calibration ? geometry.receiptConfig(settings).copies : 1;
      const nativeStarted = performance.now();
      for (let i = 0; i < copies; i++) {
        await sendToPrinter(options);
      }
      timing.nativePrintMs = Math.round(performance.now() - nativeStarted);
      return true;
    } finally {
      if (action === 'print')
        fs.appendFileSync(
          path.join(folder, 'print-timings.jsonl'),
          JSON.stringify({
            at: new Date().toISOString(),
            ...timing,
            totalMs: Math.round(performance.now() - requestedAt),
          }) + '\n',
        );
      if (action === 'print') cleanup();
      else if (!shown) preview.close();
    }
  }

  expose('app:test-print', async (arg) => {
    const requestedAt = performance.now();
    const session = getSession();
    if (!session) throw new Error('سجل الدخول أولًا');
    if (session.kind !== 'internal') throw new Error('الطباعة متاحة للجهاز الداخلي');
    const kind = arg?.kind;
    if (!['label', 'receipt', 'office'].includes(kind)) throw new Error('نوع الطباعة الاختبارية غير صالح');
    const { settings } = await api('GET', '/api/catalog');
    const body =
      kind === 'label'
        ? testLabel(await QRCode.toDataURL('TEST-PRINT', QR_OPTIONS))
        : kind === 'receipt'
          ? testReceipt(settings, await QRCode.toDataURL('CALIBRATION', { ...QR_OPTIONS, width: 400 }))
          : testOffice();
    return runJob({
      requestedAt,
      body,
      settings,
      mode: kind,
      calibration: kind === 'receipt',
      action: arg.mode === 'preview' ? 'preview' : 'print',
      session,
    });
  });
  expose('app:export-report', async (filter) => {
    owner();
    const report = await api('GET', reportPath(filter));
    const result = await dialog.showSaveDialog(windowProvider(), {
      title: 'حفظ تقرير CSV',
      defaultPath: `${report.type}-${report.from}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled) return false;
    owner();
    fs.writeFileSync(result.filePath, csv(report), 'utf8');
    return true;
  });
  expose('app:document', async (arg) => {
    const requestedAt = performance.now();
    const session = getSession();
    if (!session) throw new Error('سجل الدخول أولًا');
    const KINDS = [
      'visitor-cards',
      'card',
      'qr',
      'visitor-qr',
      'voucher',
      'visitor-pass',
      'report',
      'daily-report',
      'canteen',
      'canteen-statement',
      'soldier-file',
      'analytic-report',
    ];
    if (!arg || !KINDS.includes(arg.type) || !['print', 'pdf', 'preview'].includes(arg.mode))
      throw new Error('طلب طباعة غير صالح');
    if (arg.type === 'canteen' || arg.type === 'canteen-statement') canteenPrinter();
    else if (arg.type !== 'voucher' && arg.type !== 'visitor-qr') owner();
    const catalog = await api('GET', '/api/catalog');
    // Sheet documents may be sent to another (external) printer chosen on the reports page.
    const sheet = ['office', 'memo'].includes(geometry.modeOf(arg.type));
    if (arg.printer !== undefined && (!sheet || typeof arg.printer !== 'string' || arg.printer.length > 200))
      throw new Error('الطابعة المختارة غير صالحة لهذا المستند');
    if (
      arg.printCopies !== undefined &&
      (!sheet || !Number.isInteger(arg.printCopies) || arg.printCopies < 1 || arg.printCopies > 20)
    )
      throw new Error('عدد النسخ من 1 إلى 20');
    const settings = arg.printer ? { ...catalog.settings, printer: arg.printer } : catalog.settings;
    let body;
    let receipt;
    const printedBy = session.user.username || session.user.name;
    if (arg.type === 'report') body = reportTable(await api('GET', reportPath(arg.filter)));
    else if (arg.type === 'daily-report') {
      const params = new URLSearchParams();
      if (arg.date) params.set('date', String(arg.date));
      if (['day', 'month', 'year'].includes(arg.period)) params.set('period', arg.period);
      const q = params.size ? `?${params}` : '';
      body = dailyReportHtml(await api('GET', `/api/reports/daily${q}`));
    } else if (arg.type === 'voucher')
      body = voucher(await api('GET', `/api/permit?id=${encodeURIComponent(arg.id)}`), printedBy);
    else if (arg.type === 'visitor-pass') {
      const pass = await api('GET', `/api/visitor-pass?id=${encodeURIComponent(arg.id)}`);
      if (pass.status !== 'approved') throw new Error('يُطبع التصريح بعد اعتماده فقط');
      body = visitorPass(pass, await QRCode.toDataURL(buildVisitorPassQrPayload(pass), QR_OPTIONS), printedBy);
    } else if (arg.type === 'canteen') {
      if (!arg.id) throw new Error('معرف العملية مطلوب');
      receipt = await api('GET', `/api/canteen/transaction?id=${encodeURIComponent(arg.id)}`);
      body = canteenReceipt(receipt, printedBy);
    } else if (arg.type === 'canteen-statement') {
      if (!arg.soldierId || !arg.month) throw new Error('اختر العسكري والشهر');
      const outletQ = arg.outletId ? `&outletId=${encodeURIComponent(arg.outletId)}` : '';
      const ledger = await api(
        'GET',
        `/api/canteen?soldierId=${encodeURIComponent(arg.soldierId)}&month=${encodeURIComponent(arg.month)}${outletQ}`,
      );
      const soldier = (await api('GET', `/api/soldier?id=${encodeURIComponent(arg.soldierId)}`)).soldier;
      body = canteenStatement({ soldier, ...ledger }, printedBy);
    } else if (arg.type === 'soldier-file') {
      if (!arg.soldierId) throw new Error('اختر العسكري');
      const CATEGORIES = [
        'grant',
        'leave',
        'penalty',
        'reward',
        'medical',
        'medical_affairs',
        'security_report',
        'security_scan',
        'evaluation',
      ];
      if (arg.category !== undefined && !CATEGORIES.includes(arg.category)) throw new Error('قسم غير صالح');
      const id = encodeURIComponent(arg.soldierId);
      const [{ soldier }, { records }, evaluation] = await Promise.all([
        api('GET', `/api/soldier?id=${id}`),
        api('GET', `/api/soldier/records?soldierId=${id}`),
        api('GET', `/api/soldier/evaluation?soldierId=${id}`),
      ]);
      body = soldierFile({ soldier, records, evaluation, category: arg.category, printedBy });
    } else if (arg.type === 'analytic-report') {
      const params = new URLSearchParams();
      for (const key of ['subject', 'soldierId', 'company', 'from', 'to', 'topics', 'compare']) {
        const value = arg.query?.[key];
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value).slice(0, 500));
      }
      body = analyticReportHtml(await api('GET', `/api/reports/build?${params}`));
    } else if (arg.type === 'visitor-cards') {
      const numbers = arg.cardNos;
      if (
        !Array.isArray(numbers) ||
        numbers.length < 1 ||
        numbers.length > 24 ||
        numbers.some((no) => !Number.isInteger(no) || no < 1 || no > 24) ||
        new Set(numbers).size !== numbers.length
      )
        throw new Error('اختر بطاقات من 1 إلى 24');
      const qr = await Promise.all(numbers.map((no) => QRCode.toDataURL(String(no), QR_OPTIONS)));
      body = visitorLabels(numbers, qr, 1);
    } else {
      if (
        !Array.isArray(arg.ids) ||
        arg.ids.length < 1 ||
        arg.ids.length > 100 ||
        !Number.isInteger(arg.copies) ||
        arg.copies < 1 ||
        arg.copies > 8
      )
        throw new Error(
          arg.type === 'visitor-qr'
            ? 'اختر من 1 إلى 100 زائر ومن 1 إلى 8 نسخ'
            : 'اختر من 1 إلى 100 عسكري ومن 1 إلى 8 نسخ',
        );
      if (arg.type === 'visitor-qr') {
        const visitors = await Promise.all(
          arg.ids.map(async (id) => (await api('GET', `/api/gate/visitor?id=${encodeURIComponent(id)}`)).visitor),
        );
        const qr = await Promise.all(visitors.map((v) => QRCode.toDataURL(buildVisitorQrPayload(v), QR_OPTIONS)));
        body = visitorLabels(visitors, qr, arg.copies);
      } else {
        const soldiers = await Promise.all(
          arg.ids.map(async (id) => (await api('GET', `/api/soldier?id=${encodeURIComponent(id)}`)).soldier),
        );
        const qr = await Promise.all(soldiers.map((s) => QRCode.toDataURL(buildQrPayload(s), QR_OPTIONS)));
        body = cards(soldiers, qr, arg.copies, arg.type === 'qr');
      }
    }
    if (getSession() !== session) throw new Error('تغيرت الجلسة');
    return runJob({
      body,
      settings,
      mode: geometry.modeOf(arg.type),
      action: arg.mode,
      session,
      requestedAt,
      receipt,
      printedBy,
      sheetCopies: arg.printCopies,
      title: arg.type === 'analytic-report' ? 'تقرير مفصل' : undefined,
    });
  });
  expose('app:pick-attachment', async () => {
    owner();
    const result = await dialog.showOpenDialog(windowProvider(), {
      title: 'اختيار صورة أو مستند',
      filters: [{ name: 'Images / PDF', extensions: ['png', 'jpg', 'jpeg', 'pdf'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if (fs.statSync(file).size > 5 * 1024 * 1024) throw new Error('الحد الأقصى 5 ميجابايت');
    const ext = path.extname(file).toLowerCase();
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf' }[ext];
    if (!mime) throw new Error('نوع غير مسموح');
    return { name: path.basename(file), mime, content: fs.readFileSync(file).toString('base64') };
  });
  expose('app:save-attachment', async (id) => {
    const s = getSession();
    if (!s) throw new Error('سجل الدخول أولًا');
    const attachment = await api('GET', `/api/attachment?id=${encodeURIComponent(id)}`);
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' }[attachment.mime];
    if (!ext) throw new Error('نوع ملف غير صالح');
    const result = await dialog.showSaveDialog(windowProvider(), {
      title: 'حفظ المرفق',
      defaultPath: attachment.name.replace(/[\\/:*?"<>|]/g, '_'),
      filters: [{ name: 'Attachment', extensions: [ext] }],
    });
    if (result.canceled) return false;
    if (getSession() !== s) throw new Error('تغيرت الجلسة');
    fs.writeFileSync(result.filePath, Buffer.from(attachment.content, 'base64'));
    return true;
  });
  expose('app:backup-save', async (id) => {
    owner();
    const envelope = await api('GET', `/api/backup/download?id=${encodeURIComponent(id)}`);
    const result = await dialog.showSaveDialog(windowProvider(), {
      title: 'حفظ النسخة الاحتياطية المشفرة',
      defaultPath: id,
      filters: [{ name: 'Encrypted backup', extensions: ['mab'] }],
    });
    if (result.canceled) return false;
    owner();
    fs.writeFileSync(result.filePath, JSON.stringify(envelope));
    return true;
  });
  expose('app:backup-import', async () => {
    owner();
    const result = await dialog.showOpenDialog(windowProvider(), {
      title: 'استيراد نسخة احتياطية مشفرة',
      filters: [{ name: 'Encrypted backup', extensions: ['mab'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    if (fs.statSync(result.filePaths[0]).size > 48 * 1024 * 1024) throw new Error('النسخة أكبر من المسموح');
    return api('POST', '/api/backup/import', JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')));
  });
  let legacySource, legacyRequest;
  expose('app:legacy-preview', async () => {
    owner();
    const result = await dialog.showOpenDialog(windowProvider(), {
      title: 'اختيار ملف بيانات النسخة القديمة',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    if (fs.statSync(result.filePaths[0]).size > 32 * 1024 * 1024)
      throw new Error('الحد الأقصى لملف الاستيراد 32 ميجابايت');
    legacySource = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    legacyRequest = require('node:crypto').randomUUID();
    return api('POST', '/api/import/preview', legacySource);
  });
  expose('app:legacy-apply', async (confirmation) => {
    owner();
    if (!legacySource || confirmation !== 'IMPORT') throw new Error('راجع الملف أولًا واكتب IMPORT');
    const result = await api('POST', '/api/import/apply', { confirm: 'IMPORT', source: legacySource }, legacyRequest);
    legacySource = null;
    return result;
  });
  return {
    warmup,
    close: () => {
      closing = true;
      for (const preview of previews) preview.close();
      closing = false;
      printWindow = null;
      legacySource = null;
    },
  };
}
module.exports = { registerOutput };
