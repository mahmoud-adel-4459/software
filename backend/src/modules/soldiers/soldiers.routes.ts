import { Router } from 'express';
import {
  archiveSoldierHandler,
  createSoldierHandler,
  getSoldierHandler,
  importSoldiersHandler,
  listSoldiersHandler,
  updateSoldierHandler,
} from './soldiers.controller';
import { attachmentRoutes } from './attachments.routes';

export const soldiersRoutes = Router({ caseSensitive: true, strict: true });
soldiersRoutes.get('/api/soldiers', listSoldiersHandler);
soldiersRoutes.get('/api/soldier', getSoldierHandler);
soldiersRoutes.post('/api/soldiers', createSoldierHandler);
soldiersRoutes.post('/api/soldiers/import', importSoldiersHandler);
soldiersRoutes.post('/api/soldier/update', updateSoldierHandler);
soldiersRoutes.post('/api/soldier/archive', archiveSoldierHandler);
soldiersRoutes.use(attachmentRoutes);
