import { requireValue } from '@/common/errors/AppError';
import type { Input } from '@/common/http/types';
import { exitReasonsOf } from './exit-reasons';
import { attachmentBytes, text } from '@/common/utils/validation';
import type { Tx } from '@/config/prisma';
import { parseBackupPolicyFields } from '@/modules/backup/backup.policy';
import { parsePrintFields } from './print.settings';
import { parseMemoFields } from './memo.settings';
import { parseSoldierLists } from './soldier-lists';
import { parseUnitPolicy } from './unit-policy';

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
  const previous = current.data as { exitReasons?: unknown; extraReasons?: unknown };
  const submitted = data.exitReasons === undefined
    ? exitReasonsOf(previous.exitReasons === undefined && data.extraReasons !== undefined ? { extraReasons: data.extraReasons } : previous)
    : data.exitReasons;
  requireValue(Array.isArray(submitted), 'أسباب الخروج يجب أن تكون قائمة');
  const reasons = submitted.map((reason: unknown) => text(reason, 100, true));
  requireValue(new Set(reasons).size === reasons.length, 'سبب خروج مكرر');
  requireValue(
    ['A4', 'A5'].includes(data.paper as string) && ['normal', 'narrow'].includes(data.margins as string),
    'إعدادات طباعة غير صالحة',
  );
  const settings = {
    unitName: text(data.unitName, 100, true),
    parentFormation: text(data.parentFormation || '', 100),
    exitReasons: reasons,
    extraReasons: [],
    paper: data.paper,
    margins: data.margins,
    ...parsePrintFields(data),
    ...parseMemoFields(data, previous),
    ...parseSoldierLists(data, previous as Input),
    ...parseUnitPolicy(data, previous as Input),
    memoLogo: validateLogo(data.memoLogo === undefined ? (previous as Input).memoLogo : data.memoLogo),
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
