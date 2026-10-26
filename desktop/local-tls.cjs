'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync, randomBytes, X509Certificate } = require('node:crypto');
const forge = require('node-forge');

const keys = () => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey: forge.pki.publicKeyFromPem(pair.publicKey), privateKey: forge.pki.privateKeyFromPem(pair.privateKey) };
};

const certificate = (publicKey, name) => {
  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = '01' + randomBytes(16).toString('hex');
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 10);
  cert.setSubject([{ name: 'commonName', value: name }]);
  return cert;
};

/** Server certificate for `names` (DNS) and `ips`, signed by the installation CA. */
function issueServerCertificate(tlsDir, ca, caKey, { names = ['localhost'], ips = ['127.0.0.1'] } = {}) {
  const serverKeys = keys();
  const server = certificate(serverKeys.publicKey, names[0] || 'localhost');
  server.setIssuer(ca.subject.attributes);
  server.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: [...names.map((value) => ({ type: 2, value })), ...ips.map((ip) => ({ type: 7, ip }))],
    },
  ]);
  server.sign(caKey, forge.md.sha256.create());
  fs.writeFileSync(path.join(tlsDir, 'server-key.pem'), forge.pki.privateKeyToPem(serverKeys.privateKey), { mode: 0o600 });
  fs.writeFileSync(path.join(tlsDir, 'server-cert.pem'), forge.pki.certificateToPem(server));
}

/**
 * Creates a private CA and localhost certificate unique to this installation. The CA key stays in
 * `tlsDir` so the unit PC can reissue its server certificate when its LAN address changes.
 */
function createLocalTls(tlsDir, names) {
  const caKeys = keys();
  const ca = certificate(caKeys.publicKey, 'Military Affairs Local CA');
  ca.setIssuer(ca.subject.attributes);
  ca.setExtensions([{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', keyCertSign: true, cRLSign: true }]);
  ca.sign(caKeys.privateKey, forge.md.sha256.create());
  fs.mkdirSync(tlsDir, { recursive: true });
  fs.writeFileSync(path.join(tlsDir, 'ca-key.pem'), forge.pki.privateKeyToPem(caKeys.privateKey), { mode: 0o600 });
  issueServerCertificate(tlsDir, ca, caKeys.privateKey, names);
  // Write the CA last: its presence marks completed initialization.
  fs.writeFileSync(path.join(tlsDir, 'ca-cert.pem'), forge.pki.certificateToPem(ca));
}

/** True when the server certificate already covers every name and address. */
function covers(certPath, { names, ips }) {
  try {
    const san = (new X509Certificate(fs.readFileSync(certPath)).subjectAltName || '').toLowerCase();
    return names.every((n) => san.includes(`dns:${n.toLowerCase()}`)) && ips.every((ip) => san.includes(`ip address:${ip}`));
  } catch {
    return false;
  }
}

/**
 * Unit PC: makes sure the server certificate is valid for this PC's name and LAN addresses.
 * Returns true when the CA itself was replaced (gate PCs must pair again).
 */
function ensureLanCertificate(tlsDir, { hostname, ips }) {
  const wanted = { names: ['localhost', ...(hostname ? [hostname] : [])], ips: ['127.0.0.1', ...ips] };
  const caKeyPath = path.join(tlsDir, 'ca-key.pem');
  if (!fs.existsSync(caKeyPath)) {
    createLocalTls(tlsDir, wanted);
    return true;
  }
  if (covers(path.join(tlsDir, 'server-cert.pem'), wanted)) return false;
  const ca = forge.pki.certificateFromPem(fs.readFileSync(path.join(tlsDir, 'ca-cert.pem'), 'utf8'));
  const caKey = forge.pki.privateKeyFromPem(fs.readFileSync(caKeyPath, 'utf8'));
  issueServerCertificate(tlsDir, ca, caKey, wanted);
  return false;
}

module.exports = { createLocalTls, ensureLanCertificate };
