import { requireValue } from '@/common/errors/AppError';
import type { Input } from '@/common/http/types';
import { EXIT_REASONS } from '@/common/utils/catalog';
import { attachmentBytes, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';
import { parseBackupPolicyFields } from '@/modules/backup/backup.policy';
import { parsePrintFields } from './print.settings';

function validateLogo(logo: unknown): string | null {
  if (!logo) return null;
  requireValue(typeof logo === 'string' && /^data:image\/(png|jpeg);base64,/.test(logo), 'شعار غير صالح');
  const [header = '', content] = logo.split(',');
  attachmentBytes(content, header.slice(5, header.indexOf(';')));
  return logo;
}

/** Validates and stores the unit settings (optimistic `version` check). */
export async function saveSettings(tx: Tx, data: Input) {
  const current = await tx.settings.findUnique({ where: { id: 1 } });
  requireValue(current, 'الإعدادات غير موجودة', 500);
  requireValue(current.version === data.version, 'الإعدادات تغيرت؛ حدّث الصفحة', 409);
  requireValue(Array.isArray(data.extraReasons) && data.extraReasons.length <= 2, 'يسمح بسببين إضافيين فقط');
  const reasons = (data.extraReasons as unknown[]).map((reason) => text(reason, 40, true));
  requireValue(new Set([...EXIT_REASONS, ...reasons]).size === EXIT_REASONS.length + reasons.length, 'سبب خروج مكرر');
  requireValue(
    ['A4', 'A5'].includes(data.paper as string) && ['normal', 'narrow'].includes(data.margins as string),
    'إعدادات طباعة غير صالحة',
  );
  const settings = {
    unitName: text(data.unitName, 100, true),
    parentFormation: text(data.parentFormation || '', 100),
    extraReasons: reasons,
    paper: data.paper,
    margins: data.margins,
    ...parsePrintFields(data),
    showLogo: Boolean(data.showLogo),
    logo: validateLogo(data.logo),
    ...parseBackupPolicyFields(data),
  };
  return tx.settings.update({
    where: { id: 1 },
    data: { data: settings as object, version: { increment: 1 } },
    select: { id: true, version: true },
  });
}
