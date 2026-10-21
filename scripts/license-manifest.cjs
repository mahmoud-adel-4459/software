'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const privateDir = path.join(root, 'private');

function readJson(name) {
  const p = path.join(privateDir, name);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const server = readJson('server-request.json');
const internal = readJson('device-internal-request.json');
const gate = readJson('device-gate-request.json');

const manifest = {
  serverId: server.serverId,
  serverFingerprint: server.serverFingerprint,
  installation: process.argv[2] || 'وحدة عسكرية',
  devices: [
    { id: internal.id, kind: 'internal', publicKey: internal.publicKey },
    { id: gate.id, kind: 'gate', publicKey: gate.publicKey },
  ],
};

fs.writeFileSync(path.join(privateDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Wrote private/manifest.json — run: npm.cmd run license -- issue private/issuer-private.pem private/manifest.json private/license.json');
