import { handle, param } from '@/common/http/route';
import { cairoDate } from '@/common/utils/time';
import { date } from '@/common/utils/validation';
import { buildDailyReport, type ReportPeriod } from './daily-report.service';
import { reportsGuard } from './reports.service';

export const reportsHandler = handle('clerkOrAdmin', reportsGuard);

export const dailyReportHandler = handle('admin', (ctx) =>
  buildDailyReport(
    ctx.store,
    date(param(ctx, 'date') || cairoDate(new Date(ctx.clock()))),
    (param(ctx, 'period') || 'day') as ReportPeriod,
  ),
);
