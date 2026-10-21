'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { copyDependencies } = require('./package-dependency.cjs');
const workspace = path.resolve(__dirname, '..');
const target = path.join(workspace, 'artifacts', 'server-bundle');
fs.mkdirSync(target, { recursive: true });
for (const name of ['server', 'shared']) fs.cpSync(path.join(workspace, name), path.join(target, name), { recursive: true });
for (const name of ['.env.example', 'README.md']) fs.copyFileSync(path.join(workspace, name), path.join(target, name));
const { version } = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'military-affairs-server', version, private: true,
  scripts: { server: 'node --env-file=.env server/start.cjs', 'server:init': 'node --env-file=.env server/setup.cjs','server:activation':'node --env-file=.env server/request-activation.cjs' } }, null, 2));
copyDependencies(['pg'], target, workspace);
for (const forbidden of ['tools', 'private', '.env']) if (fs.existsSync(path.join(target, forbidden))) throw new Error(`Do not distribute ${forbidden}`);
console.log(`Server bundle created (requires Node.js 24 and PostgreSQL): ${target}`);
