'use strict';
/** Applies the requested gate list through the running local app's signed settings API. */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { callServer } = require('../desktop/transport.cjs');
const { EXIT_REASONS } = require('../shared/catalog.cjs');

async function main() {
  const root = path.join(process.env.LOCALAPPDATA, 'Military Affairs Play', 'standalone');
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'meta.json'), 'utf8'));
  const identity = JSON.parse(fs.readFileSync(path.join(root, 'devices.json'), 'utf8')).internal;
  const config = { serverUrl: 'https://127.0.0.1:8443', ca: fs.readFileSync(path.join(root, 'tls', 'ca-cert.pem'), 'utf8') };
  const login = await callServer(config, identity, null, 'POST', '/api/login', {
    username: meta.adminUsername, password: meta.adminPassword,
  });
  const call = (method, route, data) => callServer(config, identity, login.token, method, route, data, method === 'POST' ? randomUUID() : undefined);
  try {
    const catalog = await call('GET', '/api/catalog');
    const archive = path.join(__dirname, '..', 'artifacts', `gate-reasons-before-${Date.now()}.json`);
    fs.writeFileSync(archive, JSON.stringify({ version: catalog.settings.version, exitReasons: catalog.exitReasons }, null, 2));
    await call('POST', '/api/settings', { ...catalog.settings, exitReasons: EXIT_REASONS });
    const updated = await call('GET', '/api/catalog');
    if (JSON.stringify(updated.exitReasons) !== JSON.stringify(EXIT_REASONS)) throw new Error('Gate reasons did not match');
    console.log(`Saved and verified ${updated.exitReasons.length} gate reasons.`);
  } finally {
    await call('POST', '/api/logout', {}).catch(() => {});
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
