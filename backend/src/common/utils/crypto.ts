import crypto from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(crypto.scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export function keyPair(): { publicKey: string; privateKey: string } {
  return crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

export function digest(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sign(privateKey: string, value: string): string {
  return crypto.sign(null, Buffer.from(value), privateKey).toString('base64');
}

export function verify(publicKey: string, value: string, signature: string): boolean {
  try {
    return crypto.verify(null, Buffer.from(value), publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export function fingerprint(publicKey: string): string {
  return digest(crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' }));
}

export interface SignedRequest {
  deviceId: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: string;
}

/** Canonical text signed by a device: [deviceId, timestamp, nonce, method, path, sha256(body)]. */
export function requestMessage({ deviceId, timestamp, nonce, method, path, body }: SignedRequest): string {
  return JSON.stringify([deviceId, timestamp, nonce, method, path, digest(body)]);
}

/** scrypt hash stored as `salt:hash` (hex). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function checkPassword(password: string, encoded: string): Promise<boolean> {
  const [salt = '', hash = ''] = encoded.split(':');
  const actual = await derive(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}
