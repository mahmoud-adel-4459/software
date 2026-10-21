import fs from 'node:fs';
import { AppError, fail, requireValue } from '@/common/errors/AppError';
import { fingerprint, verify } from '@/common/utils/crypto';
import type { Device, License, LicenseProvider } from './types';

interface Envelope {
  payload: string;
  signature: string;
}

/** Verifies the signed license (issuer signature, installation, exactly one gate + one internal device). */
export function loadLicense(
  publicKey: string,
  envelope: Envelope,
  serverId: string,
  serverFingerprint?: string,
): License & { serverFingerprint?: string } {
  requireValue(
    envelope && typeof envelope.payload === 'string' && envelope.payload.length < 65536,
    'ملف الترخيص غير صالح',
    403,
  );
  requireValue(verify(publicKey, envelope.payload, envelope.signature), 'توقيع الترخيص غير صالح', 403);
  let license: License & { version?: number; serverFingerprint?: string };
  try {
    license = JSON.parse(envelope.payload);
  } catch {
    return fail('بيانات الترخيص غير صالحة', 403);
  }
  requireValue(
    license.version === 1 && license.serverId === serverId && typeof license.installation === 'string',
    'الترخيص لا يخص هذا الخادم',
    403,
  );
  if (serverFingerprint) {
    requireValue(
      license.serverFingerprint === serverFingerprint,
      'الترخيص لا يخص تثبيت Windows Server الحالي؛ اطلب إعادة اعتماده',
      403,
    );
  }
  requireValue(
    Array.isArray(license.devices) &&
      license.devices.length === 2 &&
      license.devices.filter((d) => d.kind === 'gate').length === 1 &&
      license.devices.filter((d) => d.kind === 'internal').length === 1,
    'الترخيص يجب أن يعتمد جهاز بوابة وجهازًا داخليًا',
    403,
  );
  const ids = new Set<string>();
  for (const device of license.devices as Device[]) {
    requireValue(
      typeof device.id === 'string' && device.id.length <= 100 && !ids.has(device.id),
      'هوية جهاز غير صالحة',
      403,
    );
    ids.add(device.id);
    try {
      requireValue(fingerprint(device.publicKey) === device.fingerprint, 'بصمة الجهاز غير صحيحة', 403);
    } catch {
      requireValue(false, 'مفتاح الجهاز غير صالح', 403);
    }
  }
  return license;
}

/** License provider that re-reads the signed license file on every request (so renewals apply live). */
export function fileLicenseProvider(
  publicKeyPath: string,
  licensePath: string,
  serverId: string,
  serverFingerprint?: string,
): LicenseProvider {
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  return () => {
    try {
      return loadLicense(publicKey, JSON.parse(fs.readFileSync(licensePath, 'utf8')), serverId, serverFingerprint);
    } catch (error) {
      if (error instanceof AppError) throw error;
      return fail('البرنامج يحتاج إلى ترخيص صحيح من الجهة المالكة', 403);
    }
  };
}
