'use strict';
const path = require('node:path');
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('node:child_process').spawnSync(require('electron'), [__filename], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow } = require('electron');
const { documentHtml } = require('../desktop/documents.cjs');
const { pageSpec, pdfOptions } = require('../desktop/documents/geometry.cjs');
const { MEMO_PAGINATION_SCRIPT } = require('../desktop/documents/memo-pagination.cjs');
const folder = path.join(__dirname, '../artifacts/memo');
const fontUrl = pathToFileURL(path.join(__dirname, '../fonts/plex-arabic-arabic-400.woff2')).href;

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let win;
  try {
    fs.mkdirSync(folder, { recursive: true });
    win = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true, backgroundThrottling: false } });
    const deadline = setTimeout(() => { console.error('Memo layout check timed out'); app.exit(1); }, 90000);
    deadline.unref();
    for (const count of [12, 100, 0]) {
      const rows = Array.from({ length: count }, (_, i) => `<tr><td>${i + 1}</td><td>عسكري تجريبي ${i + 1}</td><td>جندي</td><td>السرية الأولى</td><td>داخل الوحدة</td></tr>`).join('');
      const body = count ? `<h2>تقرير الأفراد</h2><p>إجمالي السجلات: ${count}</p><table><thead><tr><th>م</th><th>الاسم</th><th>الرتبة</th><th>السرية</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<h1>التقرير اليومي الشامل</h1><p>ملخص حركة الوحدة خلال اليوم</p>' + ['السرية — أفراد نشطون', 'أسباب الخروج', 'حركات البوابة', 'زوار', 'كانتين', 'بوفيه', 'لياقة'].map((name) => `<h2>${name}</h2><table><thead><tr><th>البيان</th><th>الحالة</th></tr></thead><tbody>${Array.from({ length: 3 }, (_, i) => `<tr><td>بيان ${i + 1}</td><td>حركة مسجلة</td></tr>`).join('')}</tbody></table>`).join('');
      const file = path.join(folder, `memo-${count || 'daily'}.html`);
      fs.writeFileSync(file, documentHtml({ title: 'مذكرة تفصيلية — تقرير الأفراد', body, settings: {}, fontUrl, mode: 'memo' }));
      await win.loadFile(file);
      await win.webContents.executeJavaScript('document.fonts.ready.then(()=>Promise.all(Array.from(document.images,img=>img.decode()))).then(()=>true)');
      await win.webContents.executeJavaScript(MEMO_PAGINATION_SCRIPT);
      const layout = await win.webContents.executeJavaScript(`(() => {
        const pages = Array.from(document.querySelectorAll('.memo-page'));
        return { pages: pages.length, rows: document.querySelectorAll('.memo-content tbody tr').length,
          signatures: document.querySelectorAll('.memo-footer').length,
          lastSigned: Boolean(pages.at(-1).querySelector('.memo-footer')),
          safe: pages.every(page => {
            const rect = page.getBoundingClientRect();
            const header = page.querySelector('.memo-header').getBoundingClientRect();
            const content = page.querySelector('.memo-content');
            const box = content.getBoundingClientRect();
            const footer = page.querySelector('.memo-footer')?.getBoundingClientRect();
            return header.top >= rect.top && header.bottom <= box.top && content.scrollHeight <= content.clientHeight + 1 && (!footer || box.bottom < footer.top);
          }) };
      })()`);
      assert.equal(layout.rows, count || 21);
      assert.equal(layout.signatures, 1);
      assert.equal(layout.lastSigned, true);
      assert.equal(layout.safe, true);
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'print' });
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: '' });
      win.webContents.debugger.detach();
      const pdf = await win.webContents.printToPDF(pdfOptions(pageSpec('memo')));
      fs.writeFileSync(path.join(folder, `memo-${count || 'daily'}.pdf`), pdf);
      const source = pdf.toString('latin1');
      const pages = (source.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
      assert.equal(pages, layout.pages);
      const box = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(source);
      assert.ok(box);
      assert.ok(Math.abs(Number(box[3]) * 25.4 / 72 - 210) < 1);
      assert.ok(Math.abs(Number(box[4]) * 25.4 / 72 - 297) < 1);
      if (count === 12 || count === 0) {
        const bounds = await win.webContents.executeJavaScript('JSON.stringify(document.querySelector(".memo-page").getBoundingClientRect().toJSON())');
        const r = JSON.parse(bounds);
        win.setContentSize(900, 1250);
        fs.writeFileSync(path.join(folder, count ? 'memo-preview.png' : 'memo-daily-preview.png'), (await win.webContents.capturePage({ x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) })).toPNG());
        if (count === 12) assert.equal(pages, 1);
      } else assert.ok(pages > 1);
      console.log(`A4 memo: ${count} rows, ${pages} pages`);
    }
    win.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (win) win.destroy();
    app.exit(1);
  }
});
