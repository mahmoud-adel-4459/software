'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync, randomBytes } = require('node:crypto');
const forge = require('node-forge');

/** Creates a private CA and localhost certificate unique to this installation. */
function createLocalTls(tlsDir) {
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
  const caKeys = keys();
  const ca = certificate(caKeys.publicKey, 'Military Affairs Local CA');
  ca.setIssuer(ca.subject.attributes);
  ca.setExtensions([{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', keyCertSign: true, cRLSign: true }]);
  ca.sign(caKeys.privateKey, forge.md.sha256.create());
  const serverKeys = keys();
  const server = certificate(serverKeys.publicKey, 'localhost');
  server.setIssuer(ca.subject.attributes);
  server.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] },
  ]);
  server.sign(caKeys.privateKey, forge.md.sha256.create());
  fs.mkdirSync(tlsDir, { recursive: true });
  fs.writeFileSync(path.join(tlsDir, 'server-key.pem'), forge.pki.privateKeyToPem(serverKeys.privateKey), { mode: 0o600 });
  fs.writeFileSync(path.join(tlsDir, 'server-cert.pem'), forge.pki.certificateToPem(server));
  // Write the CA last: its presence marks completed initialization. The CA private key is never saved.
  fs.writeFileSync(path.join(tlsDir, 'ca-cert.pem'), forge.pki.certificateToPem(ca));
}

module.exports = { createLocalTls };
