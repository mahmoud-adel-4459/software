import { handle } from '@/common/http/route';
import { listAudit } from './audit.service';

export const listAuditHandler = handle('admin', listAudit);
