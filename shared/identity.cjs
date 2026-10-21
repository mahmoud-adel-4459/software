'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { digest } = require('./crypto.cjs');
function serverFingerprint(serverId) {
  if (process.platform !== 'win32') throw new Error('Production server identity requires Windows Server');
  const reg = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'reg.exe');
  const output = execFileSync(reg, ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
  });
  const match = /MachineGuid\s+REG_SZ\s+([0-9a-f-]{36})/i.exec(output);
  if (!match) throw new Error('Cannot read Windows installation identity');
  return digest(`military-server-v1:${serverId}:${match[1].toLowerCase()}`);
}
module.exports = { serverFingerprint };
