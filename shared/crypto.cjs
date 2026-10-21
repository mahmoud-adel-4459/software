'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(crypto.scrypt);

function keyPair() {
  return crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sign(privateKey, value) { return crypto.sign(null, Buffer.from(value), privateKey).toString('base64'); }
function verify(publicKey, value, signature) {
  try { return crypto.verify(null, Buffer.from(value), publicKey, Buffer.from(signature, 'base64')); }
  catch { return false; }
}
function fingerprint(publicKey) {
  return digest(crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' }));
}
function requestMessage({ deviceId, timestamp, nonce, method, path, body }) {
  return JSON.stringify([deviceId, timestamp, nonce, method, path, digest(body)]);
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
async function checkPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  const actual = await derive(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
module.exports = { keyPair, digest, sign, verify, fingerprint, requestMessage, hashPassword, checkPassword };
