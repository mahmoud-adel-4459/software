import { Router } from 'express';
import { handle } from '@/common/http/route';
import { dashboard } from './dashboard.service';

export const dashboardRoutes = Router({ caseSensitive: true, strict: true });
dashboardRoutes.get('/api/dashboard', handle('admin', dashboard));
