import { Router } from 'express';
import { dailyReportHandler, reportsHandler } from './reports.controller';

export const reportsRoutes = Router({ caseSensitive: true, strict: true });
reportsRoutes.get('/api/reports', reportsHandler);
reportsRoutes.get('/api/reports/daily', dailyReportHandler);
