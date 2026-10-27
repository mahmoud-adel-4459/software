import { Router } from 'express';
import { analyticReportHandler, dailyReportHandler, reportsHandler } from './reports.controller';

export const reportsRoutes = Router({ caseSensitive: true, strict: true });
reportsRoutes.get('/api/reports', reportsHandler);
reportsRoutes.get('/api/reports/daily', dailyReportHandler);
reportsRoutes.get('/api/reports/build', analyticReportHandler);
