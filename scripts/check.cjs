'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let failures = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(cjs|js)$/.test(entry.name)) {
      try {
        new vm.Script(fs.readFileSync(target, 'utf8'), { filename: target });
      } catch (error) {
        failures++;
        console.error(error.message);
      }
    }
  }
}
for (const dir of ['desktop', 'server', 'renderer', 'shared', 'tools', 'scripts', 'tests'])
  if (fs.existsSync(dir)) walk(dir);
console.log(failures ? `${failures} syntax failures` : 'All JavaScript syntax checks passed');
process.exitCode = failures ? 1 : 0;
