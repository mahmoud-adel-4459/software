import { Router } from 'express';
import { listAuditHandler } from './audit.controller';

export const auditRoutes = Router({ caseSensitive: true, strict: true });
auditRoutes.get('/api/audit', listAuditHandler);
