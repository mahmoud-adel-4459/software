'use strict';
/**
 * The PC's role on the unit network, chosen from inside the app:
 *   local   data on this PC only (default)
 *   host    the unit PC: same local data, shared with gate PCs over the LAN
 *   client  a gate PC: no local data, connects to the unit PC
 * Kept outside the per-mode data folders so it can decide which folder to open.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash, X509Certificate } = require('node:crypto');

const ROLES = ['local', 'host', 'client'];
const MODE_FLAGS = ['--play', '--standalone', '--remote'];
const roleFile = () =>
  path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Military Affairs', 'network.json');

function readRole() {
  try {
    const { role } = JSON.parse(fs.readFileSync(roleFile(), 'utf8'));
    return ROLES.includes(role) ? role : 'local';
  } catch {
    return 'local';
  }
}

function writeRole(role) {
  if (!ROLES.includes(role)) throw new Error('دور الجهاز غير صالح');
  fs.mkdirSync(path.dirname(roleFile()), { recursive: true });
  fs.writeFileSync(roleFile(), JSON.stringify({ role }, null, 2));
}

/** Command-line flags that start the app in the mode of `role`. */
const flagFor = (role) => (role === 'client' ? '--remote' : '--play');

/** Restarts the app in the mode of `role`, keeping the other arguments (e.g. the dev entry path). */
function relaunchAs(app, role) {
  const args = process.argv.slice(1).filter((arg) => !MODE_FLAGS.includes(arg));
  app.relaunch({ args: [...args, flagFor(role)] });
  app.exit(0);
}

/** This PC's IPv4 LAN addresses (no loopback / link-local). */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map((a) => a.address);
}

/** Short code shown on the unit PC; the gate PC checks the downloaded CA against it. */
function pairingCode(caPem) {
  const der = new X509Certificate(caPem).raw;
  const hex = createHash('sha256').update(der).digest('hex').slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g).join('-');
}

const normalizeCode = (code) => String(code || '').replace(/[^0-9a-f]/gi, '').toUpperCase();

module.exports = { ROLES, readRole, writeRole, flagFor, relaunchAs, lanAddresses, pairingCode, normalizeCode };
