'use strict';
const fs = require('node:fs');
const path = require('node:path');
function copyDependencies(names, targetRoot, workspace) {
  const seen = new Set();
  function copy(name, parentDirectory, targetParent) {
    let source = path.dirname(require.resolve(name, { paths: [parentDirectory] }));
    while (!fs.existsSync(path.join(source, 'package.json')) || JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).name !== name) {
      const next = path.dirname(source); if (next === source) throw new Error(`Cannot resolve dependency ${name}`); source = next;
    }
    const target = path.join(targetParent, 'node_modules', name);
    const identity = `${source}:${target}`;
    if (seen.has(identity)) return; seen.add(identity);
    fs.cpSync(source, target, { recursive: true });
    const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    for (const dependency of Object.keys(metadata.dependencies || {})) {
      // Resolve from its original parent; place siblings at the same level.
      // The two bundles have a single production dependency tree with compatible versions.
      copy(dependency, source, targetParent);
    }
  }
  for (const name of names) copy(name, workspace, targetRoot);
}
module.exports = { copyDependencies };
