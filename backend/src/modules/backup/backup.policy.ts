import { requireValue } from '@/common/errors/AppError';

export const BACKUP_INTERVAL_HOURS = [6, 12, 24, 48];
export const BACKUP_POLICY_DEFAULTS = { autoBackup: true, autoBackupIntervalHours: 24, backupRetentionDays: 30 };

export interface BackupPolicy {
  autoBackup: boolean;
  autoBackupIntervalHours: number;
  backupRetentionDays: number;
}

/** Backup settings with defaults applied (settings.data may predate these keys). */
export function mergeBackupPolicy(data?: unknown): BackupPolicy {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  let hours = Number(d.autoBackupIntervalHours);
  if (!BACKUP_INTERVAL_HOURS.includes(hours)) hours = BACKUP_POLICY_DEFAULTS.autoBackupIntervalHours;
  let retention = Number(d.backupRetentionDays);
  if (!Number.isInteger(retention) || retention < 7 || retention > 365) {
    retention = BACKUP_POLICY_DEFAULTS.backupRetentionDays;
  }
  return { autoBackup: d.autoBackup !== false, autoBackupIntervalHours: hours, backupRetentionDays: retention };
}

/** Validates the backup keys of a settings update. */
export function parseBackupPolicyFields(data: Record<string, unknown>): BackupPolicy {
  requireValue(typeof data.autoBackup === 'boolean', 'خيار النسخ التلقائي غير صالح');
  const hours = Number(data.autoBackupIntervalHours);
  requireValue(BACKUP_INTERVAL_HOURS.includes(hours), 'فترة النسخ التلقائي: 6 أو 12 أو 24 أو 48 ساعة');
  const retention = Number(data.backupRetentionDays);
  requireValue(Number.isInteger(retention) && retention >= 7 && retention <= 365, 'احتفاظ النسخ من 7 إلى 365 يومًا');
  return { autoBackup: data.autoBackup, autoBackupIntervalHours: hours, backupRetentionDays: retention };
}
