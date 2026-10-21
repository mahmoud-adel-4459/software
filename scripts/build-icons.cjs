'use strict';
/**
 * Builds the app icons from assets/logo.jpg (run: `npm run icons`, uses Electron offscreen rendering):
 *   assets/logo.png  circle-cropped logo with transparent corners (1024)
 *   assets/logo-128.png  small version for print letterheads
 *   build/icon.png   512x512
 *   build/icon.ico   multi-size 16..256
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const SOURCE = path.join(root, 'assets', 'logo.jpg');
const RADIUS = 0.485;
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const PAGE = (jpg) => `<!doctype html><body><script>
window.render = async (sizes) => {
  const img = new Image();
  img.src = 'data:image/jpeg;base64,${jpg}';
  await img.decode();
  const big = document.createElement('canvas');
  big.width = big.height = 1024;
  const g = big.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.save();
  g.beginPath();
  g.arc(512, 512, 1024 * ${RADIUS}, 0, Math.PI * 2);
  g.clip();
  g.drawImage(img, 0, 0, 1024, 1024);
  g.restore();
  const out = {};
  for (const size of sizes) {
    let src = big;
    let current = 1024;
    while (current / 2 >= size) {
      current /= 2;
      const step = document.createElement('canvas');
      step.width = step.height = current;
      const c = step.getContext('2d');
      c.imageSmoothingQuality = 'high';
      c.drawImage(src, 0, 0, current, current);
      src = step;
    }
    const dst = document.createElement('canvas');
    dst.width = dst.height = size;
    const d = dst.getContext('2d');
    d.imageSmoothingQuality = 'high';
    d.drawImage(src, 0, 0, size, size);
    out[size] = dst.toDataURL('image/png').split(',')[1];
  }
  return out;
};
</script></body>`;

async function main() {
  const { app, BrowserWindow } = require('electron');
  await app.whenReady();
  const jpg = fs.readFileSync(SOURCE).toString('base64');
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE(jpg))}`);
  const sizes = [1024, 512, 128, ...ICO_SIZES];
  const png = await win.webContents.executeJavaScript(`window.render(${JSON.stringify(sizes)})`);
  const write = (file, size) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(png[size], 'base64'));
  };
  write(path.join(root, 'assets', 'logo.png'), 1024);
  write(path.join(root, 'assets', 'logo-128.png'), 128);
  write(path.join(root, 'build', 'icon.png'), 512);
  const pngToIco = require('png-to-ico');
  const ico = await (pngToIco.default || pngToIco)(ICO_SIZES.map((s) => Buffer.from(png[s], 'base64')));
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico);
  const publicDir = path.join(root, 'renderer-app', 'public');
  if (fs.existsSync(publicDir))
    fs.copyFileSync(path.join(root, 'assets', 'logo.png'), path.join(publicDir, 'logo.png'));
  console.log('icons written: assets/logo.png, build/icon.png, build/icon.ico');
  app.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
