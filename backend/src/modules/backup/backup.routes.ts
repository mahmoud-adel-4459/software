import { Router } from 'express';
import {
  createBackupHandler,
  downloadBackupHandler,
  importBackupHandler,
  listBackupsHandler,
  previewBackupHandler,
  restoreBackupHandler,
} from './backup.controller';

export const backupRoutes = Router({ caseSensitive: true, strict: true });
backupRoutes.get('/api/backups', listBackupsHandler);
backupRoutes.get('/api/backup/download', downloadBackupHandler);
backupRoutes.get('/api/backup/preview', previewBackupHandler);
backupRoutes.post('/api/backup/create', createBackupHandler);
backupRoutes.post('/api/backup/import', importBackupHandler);
backupRoutes.post('/api/backup/restore', restoreBackupHandler);
