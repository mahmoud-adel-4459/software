import { Router } from 'express';
import { handle, write } from '@/common/http/route';
import { deletePersonnelRecord, listPersonnelRecords, savePersonnelRecord } from './personnel.service';
import {
  archiveSoldierHandler,
  createSoldierHandler,
  getSoldierHandler,
  importSoldiersHandler,
  listSoldiersHandler,
  updateSoldierHandler,
} from './soldiers.controller';
import { attachmentRoutes } from './attachments.routes';
import { soldierEvaluation } from './evaluation.service';

export const soldiersRoutes = Router({ caseSensitive: true, strict: true });
soldiersRoutes.get('/api/soldier/records', handle('admin', listPersonnelRecords));
soldiersRoutes.get('/api/soldier/evaluation', handle('admin', soldierEvaluation));
soldiersRoutes.post('/api/soldier/records', write({
  path: '/api/soldier/records', access: 'admin', audit: false,
  execute: (tx, _input, ctx) => savePersonnelRecord(tx, ctx, ctx.data),
}));
soldiersRoutes.post('/api/soldier/records/delete', write({
  path: '/api/soldier/records/delete', access: 'admin', audit: false,
  execute: (tx, _input, ctx) => deletePersonnelRecord(tx, ctx, ctx.data),
}));
soldiersRoutes.get('/api/soldiers', listSoldiersHandler);
soldiersRoutes.get('/api/soldier', getSoldierHandler);
soldiersRoutes.post('/api/soldiers', createSoldierHandler);
soldiersRoutes.post('/api/soldiers/import', importSoldiersHandler);
soldiersRoutes.post('/api/soldier/update', updateSoldierHandler);
soldiersRoutes.post('/api/soldier/archive', archiveSoldierHandler);
soldiersRoutes.use(attachmentRoutes);
