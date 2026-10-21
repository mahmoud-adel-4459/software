import { requireValue } from '@/common/errors/AppError';
import { handle, param } from '@/common/http/route';
import type { Ctx } from '@/common/http/types';
import { checkPassword } from '@/common/utils/crypto';
import type { Envelope } from './backup.format';
import { mergeBackupPolicy } from './backup.policy';

/** The backup manager exists only when BACKUP_KEY_HEX / BACKUP_DIRECTORY are configured. */
function manager({ backupManager }: Ctx) {
  requireValue(backupManager, 'النسخ الاحتياطي غير مهيأ؛ اضبط مفتاح النسخ ومساره على الخادم', 503);
  return backupManager;
}

async function listBackups(ctx: Ctx) {
  const backups = manager(ctx);
  const row = await ctx.store.prisma.settings.findUnique({ where: { id: 1 } });
  return { backups: backups.list(), schedule: backups.scheduleStatus(mergeBackupPolicy(row?.data)) };
}

/** Restore needs the admin's password and an explicit RESTORE confirmation; everybody signs in again afterwards. */
async function restoreBackup(ctx: Ctx) {
  const backups = manager(ctx);
  const { data, actor } = ctx;
  requireValue(
    data.confirm === 'RESTORE' &&
      typeof data.password === 'string' &&
      data.password.length <= 256 &&
      (await checkPassword(data.password, actor.user.password_hash)),
    'أدخل كلمة مرور المسؤول وأكد الاستعادة',
  );
  const result = await ctx.runExclusive(() => backups.restore(data.id));
  ctx.sessions.clear(); // Restored users/passwords may differ.
  return result;
}

export const listBackupsHandler = handle('admin', listBackups);
export const downloadBackupHandler = handle('admin', (ctx) => manager(ctx).read(param(ctx, 'id')));
export const previewBackupHandler = handle('admin', (ctx) => manager(ctx).preview(param(ctx, 'id')));
export const createBackupHandler = handle('admin', (ctx) => manager(ctx).create(), 201);
export const importBackupHandler = handle('admin', (ctx) => manager(ctx).import(ctx.data as unknown as Envelope), 201);
export const restoreBackupHandler = handle('admin', restoreBackup);
