'use strict';
/** Builds what the desktop app loads when it is missing: backend/dist, renderer-app/dist, native/electron. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const steps = [
  { file: 'backend/dist/index.cjs', command: 'npm run backend:build', cwd: root },
  { file: 'renderer-app/dist/index.html', command: 'npm run build', cwd: path.join(root, 'renderer-app') },
  { file: 'native/electron/better_sqlite3.node', command: 'node scripts/build-native-electron.cjs', cwd: root },
];

for (const step of steps) {
  if (fs.existsSync(path.join(root, step.file))) continue;
  console.log(`Building ${step.file} ...`);
  const result = spawnSync(step.command, { cwd: step.cwd, shell: true, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
