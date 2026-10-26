'use strict';
/** After packaging: proves build/icon.ico is really embedded in the built exe (not Electron's default icon). */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ico = fs.readFileSync(path.join(root, 'build', 'icon.ico'));
const count = ico.readUInt16LE(4);
let largest = null;
for (let i = 0; i < count; i++) {
  const at = 6 + i * 16;
  const size = ico.readUInt32LE(at + 8);
  const offset = ico.readUInt32LE(at + 12);
  if (!largest || size > largest.size) largest = { size, offset };
}
const image = ico.subarray(largest.offset, largest.offset + largest.size);
const unpacked = path.resolve(root, process.argv[2] || 'artifacts/win-unpacked');
const exe = fs.existsSync(unpacked)
  ? fs.readdirSync(unpacked).find((f) => f.endsWith('.exe') && !/uninstall/i.test(f))
  : null;
if (!exe) {
  console.error('verify-icon: no packaged exe found in artifacts/win-unpacked');
  process.exit(1);
}
if (!fs.readFileSync(path.join(unpacked, exe)).includes(image)) {
  console.error(`verify-icon: ${exe} does not contain build/icon.ico (default Electron icon?)`);
  process.exit(1);
}
console.log(`verify-icon: ${exe} embeds the official icon`);
