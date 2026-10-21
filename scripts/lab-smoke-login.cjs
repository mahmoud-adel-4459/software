'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { randomUUID } = require('node:crypto');
const { sign, requestMessage } = require('../shared/crypto.cjs');

const root = path.join(__dirname, '..');
const devices = JSON.parse(fs.readFileSync(path.join(root, 'private', 'lab-devices.json'), 'utf8')).internal;
const login = fs.readFileSync(path.join(root, 'private', 'lab-login.txt'), 'utf8');
const password = login.match(/Password: (.+)/)[1].trim();
const ca = fs.readFileSync(path.join(root, 'private', 'ca-cert.pem'));

async function call(method, apiPath, data) {
  const body = method === 'GET' ? '' : JSON.stringify(data);
  const deviceId = devices.id;
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Device-Id': deviceId,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': sign(devices.privateKey, requestMessage({ deviceId, timestamp, nonce, method, path: apiPath, body })),
  };
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(apiPath, 'https://127.0.0.1:8443'), { method, headers, ca, rejectUnauthorized: true }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.end(body || undefined);
  });
}

call('POST', '/api/login', { username: 'admin', password }).then(r => {
  if (r.status >= 300) throw new Error(r.body.error || 'login failed');
  console.log('Lab login OK:', r.body.user.name, '·', r.body.kind);
}).catch(e => { console.error('Lab login failed:', e.message); process.exit(1); });
