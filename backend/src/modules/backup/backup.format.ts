import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fail, requireValue } from '@/common/errors/AppError';
import { validateSnapshot, type Snapshot } from './backup.snapshot';

/** Largest sealed backup accepted (the envelope travels as JSON through the API). */
export const MAX_ENVELOPE_BYTES = 96 * 1024 * 1024;
const LEGACY_AAD = 'military-backup-v1';
const SQLITE_AAD = 'military-backup-v2';

export interface Envelope {
  version: 1;
  format?: 'sqlite-1';
  serverId: string;
  createdAt: string;
  iv: string;
  tag: string;
  content: string;
}

export type OpenedBackup = { format: 'sqlite-1'; bytes: Buffer } | { format: 'legacy'; snapshot: Snapshot };

/** gzip + AES-256-GCM envelope (same field layout as the legacy .mab; `format: "sqlite-1"` marks a raw SQLite file). */
export function sealSqlite(bytes: Buffer, key: Buffer, serverId: string): Envelope {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${SQLITE_AAD}:${serverId}`));
  const encrypted = Buffer.concat([cipher.update(zlib.gzipSync(bytes)), cipher.final()]);
  requireValue(encrypted.length < MAX_ENVELOPE_BYTES, 'النسخة تتجاوز الحد المسموح', 413);
  return {
    version: 1,
    format: 'sqlite-1',
    serverId,
    createdAt: new Date().toISOString(),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    content: encrypted.toString('base64'),
  };
}

/** Test helper / legacy writer: seals a schema-3 JSON snapshot like the PostgreSQL build did. */
export function sealLegacy(snapshot: Snapshot, key: Buffer, serverId: string): Envelope {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${LEGACY_AAD}:${serverId}`));
  const encrypted = Buffer.concat([
    cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(snapshot)))),
    cipher.final(),
  ]);
  return {
    version: 1,
    serverId,
    createdAt: new Date().toISOString(),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    content: encrypted.toString('base64'),
  };
}

/** Verifies the envelope (installation, authenticity, integrity) and returns its payload. */
export function openEnvelope(envelope: Envelope, key: Buffer, serverId: string): OpenedBackup {
  requireValue(
    envelope?.version === 1 &&
      envelope.serverId === serverId &&
      typeof envelope.content === 'string' &&
      envelope.content.length < MAX_ENVELOPE_BYTES * 1.4,
    'نسخة غير صالحة أو لا تخص المنشأة',
  );
  const sqlite = envelope.format === 'sqlite-1';
  requireValue(envelope.format === undefined || sqlite, 'نسخة غير صالحة أو لا تخص المنشأة');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(`${sqlite ? SQLITE_AAD : LEGACY_AAD}:${serverId}`));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    const compressed = Buffer.concat([decipher.update(Buffer.from(envelope.content, 'base64')), decipher.final()]);
    const raw = zlib.gunzipSync(compressed, { maxOutputLength: 512 * 1024 * 1024 });
    if (sqlite) {
      requireValue(raw.subarray(0, 16).toString('latin1') === 'SQLite format 3\0', 'ملف القاعدة في النسخة غير صالح');
      return { format: 'sqlite-1', bytes: raw };
    }
    const snapshot = JSON.parse(raw.toString('utf8')) as Snapshot;
    validateSnapshot(snapshot);
    return { format: 'legacy', snapshot };
  } catch (error) {
    if ((error as { status?: number }).status) throw error;
    return fail('تعذر التحقق من النسخة؛ الملف تالف أو مفتاح التشفير مختلف');
  }
}
