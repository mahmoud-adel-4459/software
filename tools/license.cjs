'use strict';
// Owner-only tool. Never ship this file or its private keys inside a client/server installation.
const fs = require('node:fs');
const path = require('node:path');
const { keyPair, sign, fingerprint } = require('../shared/crypto.cjs');
const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'keygen') {
    const dir = path.resolve(args[0] || 'private/issuer');
    fs.mkdirSync(dir, { recursive: true });
    const keys = keyPair();
    fs.writeFileSync(path.join(dir, 'issuer-private.pem'), keys.privateKey, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'issuer-public.pem'), keys.publicKey, { flag: 'wx' });
    console.log('Issuer keys created. Keep the private key with the software owner only.');
  } else if (command === 'issue') {
    const [privatePath, manifestPath, outputPath] = args;
    if (!privatePath || !manifestPath || !outputPath)
      throw new Error('issue <private-key> <manifest.json> <output.json>');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (
      !manifest.serverId ||
      !/^[a-f0-9]{64}$/i.test(manifest.serverFingerprint || '') ||
      !manifest.installation ||
      !Array.isArray(manifest.devices) ||
      manifest.devices.length !== 2 ||
      manifest.devices.filter((d) => d.kind === 'gate').length !== 1 ||
      manifest.devices.filter((d) => d.kind === 'internal').length !== 1
    ) {
      throw new Error('Manifest must have serverId, serverFingerprint, installation, one gate and one internal device');
    }
    const payload = JSON.stringify({
      version: 1,
      serverId: manifest.serverId,
      serverFingerprint: manifest.serverFingerprint,
      installation: manifest.installation,
      devices: manifest.devices.map((d) => ({
        id: d.id,
        kind: d.kind,
        publicKey: d.publicKey,
        fingerprint: fingerprint(d.publicKey),
      })),
    });
    const privateKey = fs.readFileSync(privatePath, 'utf8');
    const envelope = { payload, signature: sign(privateKey, payload) };
    require('../shared/licensing.cjs').loadLicense(
      require('node:crypto').createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }),
      envelope,
      manifest.serverId,
      manifest.serverFingerprint,
    );
    fs.writeFileSync(outputPath, JSON.stringify(envelope, null, 2), { flag: 'wx' });
    console.log('Signed license created.');
  } else
    throw new Error('Usage: npm run license -- keygen <directory> | issue <private-key> <manifest.json> <output.json>');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
