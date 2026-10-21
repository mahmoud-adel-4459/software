import { Router } from 'express';
import { auditRoutes } from '@/modules/audit/audit.routes';
import { authRoutes } from '@/modules/auth/auth.routes';
import { backupRoutes } from '@/modules/backup/backup.routes';
import { canteenRoutes } from '@/modules/canteen/canteen.routes';
import { catalogRoutes } from '@/modules/catalog/catalog.routes';
import { dashboardRoutes } from '@/modules/dashboard/dashboard.routes';
import { fitnessRoutes } from '@/modules/fitness/fitness.routes';
import { gateRoutes } from '@/modules/gate/gate.routes';
import { importRoutes } from '@/modules/import/import.routes';
import { reportsRoutes } from '@/modules/reports/reports.routes';
import { settingsRoutes } from '@/modules/settings/settings.routes';
import { soldiersRoutes } from '@/modules/soldiers/soldiers.routes';
import { usersRoutes } from '@/modules/users/users.routes';
import { visitorsRoutes } from '@/modules/visitors/visitors.routes';

/** Every API route of the server, grouped by module. */
export const apiRoutes = Router({ caseSensitive: true, strict: true });
for (const router of [
  authRoutes,
  catalogRoutes,
  soldiersRoutes,
  gateRoutes,
  visitorsRoutes,
  canteenRoutes,
  reportsRoutes,
  dashboardRoutes,
  fitnessRoutes,
  settingsRoutes,
  usersRoutes,
  auditRoutes,
  backupRoutes,
  importRoutes,
]) {
  apiRoutes.use(router);
}
