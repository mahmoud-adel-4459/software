'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { digest } = require('./crypto.cjs');

/** Stable Windows MachineGuid (empty string if unavailable). */
function readWindowsMachineGuid() {
  if (process.platform !== 'win32') return '';
  try {
    const reg = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'reg.exe');
    const output = execFileSync(reg, ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const match = /MachineGuid\s+REG_SZ\s+([0-9a-f-]{36})/i.exec(output);
    return match ? match[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * Public machine id for licensing portal (64-char hex, stable per Windows install).
 * @param {{ fallbackFile?: string }} [opts] — persisted UUID when not on Windows
 */
function getMachineId(opts = {}) {
  const guid = readWindowsMachineGuid();
  if (guid) return digest(`military-machine-v1:${guid}`);
  if (opts.fallbackFile && fs.existsSync(opts.fallbackFile)) {
    return fs.readFileSync(opts.fallbackFile, 'utf8').trim();
  }
  if (opts.fallbackFile) {
    const { randomUUID } = require('node:crypto');
    const id = digest(`military-machine-fallback:${randomUUID()}`);
    fs.mkdirSync(path.dirname(opts.fallbackFile), { recursive: true });
    fs.writeFileSync(opts.fallbackFile, id, 'utf8');
    return id;
  }
  return digest('military-machine-unknown');
}

function getMachineIdentity(userDataDir) {
  const machineGuid = readWindowsMachineGuid();
  const fallbackFile = userDataDir ? path.join(userDataDir, 'machine-id.fallback') : undefined;
  const machineId = getMachineId({ fallbackFile });
  return {
    machineGuid: machineGuid || null,
    machineId,
    platform: process.platform,
  };
}

module.exports = { readWindowsMachineGuid, getMachineId, getMachineIdentity };
