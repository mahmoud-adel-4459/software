'use strict';
/**
 * better-sqlite3 is a native addon: tests run it built for Node, the desktop app needs the Electron build.
 * This builds the Electron variant once into native/electron/ (loaded via SQLITE_NATIVE_BINDING) and
 * restores the Node build, so both keep working side by side.
 *
 *   npm run native:electron
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const built = path.join(root, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node');
const outDir = path.join(root, 'native/electron');
const run = (command) => {
  const result = spawnSync(command, { cwd: root, shell: true, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
};

const electronVersion = require('electron/package.json').version;
run(`npx @electron/rebuild -f -w better-sqlite3 -v ${electronVersion}`);
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(built, path.join(outDir, 'better_sqlite3.node'));
run('npm rebuild better-sqlite3');
console.log('Electron native binding ready:', path.join(outDir, 'better_sqlite3.node'));
