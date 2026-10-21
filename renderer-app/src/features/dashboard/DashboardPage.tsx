import ActivityIcon from '@mui/icons-material/SwapHorizOutlined';
import CartIcon from '@mui/icons-material/ShoppingCartOutlined';
import GroupsIcon from '@mui/icons-material/GroupsOutlined';
import InsideIcon from '@mui/icons-material/HowToRegOutlined';
import LoginIcon from '@mui/icons-material/LoginOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import BadgeIcon from '@mui/icons-material/BadgeOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/endpoints';
import type { DashboardData } from '@/api/types';
import { EmptyState, KpiCard, PageHeader, SectionCard, SegmentedTabs } from '@/components/basic';
import { ExcelButtons } from '@/components/ExcelButtons';
import { cash, dayOnly, formatNumber, fromNow, percentChange } from '@/lib/format';
import { type ExcelWorkbookArg } from '@/api/types';
import { tokens } from '@/theme/tokens';

type Range = '7' | '30' | '90';
const PIE_COLORS = [tokens.primary, tokens.gold, tokens.blue, tokens.amber, tokens.purple, tokens.green, tokens.red, tokens.silver];
const shortDay = (iso: string) => dayOnly(iso).slice(5);

/** Inside% per day, rebuilt backwards from today's inside count and the daily entries/exits. */
export function insideSeries(d: DashboardData): number[] {
  const total = d.soldiers.total || 1;
  let inside = d.soldiers.inside;
  const out: number[] = [];
  for (let i = d.gate.byDay.length - 1; i >= 0; i--) {
    out.unshift(Math.round((Math.max(0, Math.min(total, inside)) / total) * 100));
    inside = inside - d.gate.byDay[i].entries + d.gate.byDay[i].exits;
  }
  return out;
}

export const dashboardWorkbook = (d: DashboardData): ExcelWorkbookArg => ({
  fileName: `ملخص-لوحة-المتابعة-${d.range.to}`,
  sheets: [
    {
      name: 'ملخص', columns: [{ header: 'المؤشر', key: 'k', width: 34 }, { header: 'القيمة', key: 'v', width: 18 }],
      rows: [
        { k: 'إجمالي العسكريين', v: d.soldiers.total }, { k: 'داخل الوحدة', v: d.soldiers.inside }, { k: 'خارج الوحدة', v: d.soldiers.outside },
        { k: 'متأخرون عن العودة', v: d.soldiers.late }, { k: 'مؤرشفون', v: d.soldiers.archived },
        { k: `حركات البوابة (${d.range.days} يوم)`, v: d.gate.total }, { k: 'حركات الفترة السابقة', v: d.gate.previousTotal },
        { k: `الزوار (${d.range.days} يوم)`, v: d.visitors.total }, { k: 'زوار بالداخل الآن', v: d.visitors.inside },
        { k: 'مبيعات الكانتين (ج.م)', v: d.food.canteen.rangeCents / 100 }, { k: 'مبيعات البوفيه (ج.م)', v: d.food.buffet.rangeCents / 100 },
        { k: 'اختبارات اللياقة', v: d.fitness.records },
      ],
    },
    {
      name: 'حركة البوابة', columns: [{ header: 'التاريخ', key: 'date', width: 14 }, { header: 'خروج', key: 'exits' }, { header: 'دخول', key: 'entries' }],
      rows: d.gate.byDay.map((r) => ({ date: dayOnly(r.date), exits: r.exits, entries: r.entries })),
    },
    {
      name: 'المبيعات', columns: [{ header: 'التاريخ', key: 'date', width: 14 }, { header: 'الكانتين (ج.م)', key: 'canteen', width: 16 }, { header: 'البوفيه (ج.م)', key: 'buffet', width: 16 }],
      rows: d.food.canteen.byDay.map((r, i) => ({ date: dayOnly(r.date), canteen: r.cents / 100, buffet: (d.food.buffet.byDay[i]?.cents ?? 0) / 100 })),
    },
  ],
});

function Hero({ d, loading }: { d?: DashboardData; loading: boolean }) {
  const s = d?.soldiers;
  const pct = s && s.total ? Math.round((s.inside / s.total) * 100) : 0;
  return (
    <Card sx={{ mb: 2.5, p: { xs: 2.5, md: 3.5 }, color: tokens.onDark, border: 0, borderTop: `3px solid ${tokens.gold}`, background: `linear-gradient(135deg, ${tokens.navyDeep} 0%, ${tokens.navyMid} 45%, ${tokens.sidebarFrom} 100%)` }}>
      <Grid container spacing={3} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <span className="live-pulse-dot" style={{ background: tokens.goldLight }} />
            <Typography sx={{ color: tokens.goldLight, fontWeight: 700 }}>الموقف الحالي للوحدة</Typography>
          </Stack>
          {loading ? <Skeleton width={160} height={72} sx={{ bgcolor: tokens.glassOnDark }} /> : (
            <Typography component="div" aria-label="داخل الوحدة" sx={{ fontSize: { xs: 52, md: 64 }, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(s?.inside)}<Typography component="span" sx={{ fontSize: 22, color: tokens.textOnDarkMuted, mx: 1 }}>من {formatNumber(s?.total)} داخل الوحدة</Typography>
            </Typography>
          )}
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: tokens.textOnDarkMuted }}>نسبة التواجد</Typography>
              <Typography variant="caption" className="num" sx={{ color: tokens.goldLight, fontWeight: 700 }}>{pct}%</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={pct} aria-label="نسبة التواجد" sx={{ height: 8, borderRadius: 4, bgcolor: tokens.glassOnDark, '& .MuiLinearProgress-bar': { bgcolor: tokens.gold, borderRadius: 4 } }} />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Grid container spacing={1.5}>
            {[
              { label: 'خارج الوحدة', value: s?.outside, icon: LogoutIcon },
              { label: 'متأخرون عن العودة', value: s?.late, icon: ActivityIcon, warn: Boolean(s?.late) },
              { label: 'خروج اليوم', value: d?.gate.today.exits, icon: LogoutIcon },
              { label: 'دخول اليوم', value: d?.gate.today.entries, icon: LoginIcon },
            ].map((x) => (
              <Grid key={x.label} size={{ xs: 6, sm: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: `${tokens.radius}px`, bgcolor: tokens.glassOnDark, height: '100%' }}>
                  <Typography variant="caption" sx={{ color: tokens.textOnDarkMuted }}>{x.label}</Typography>
                  {loading ? <Skeleton width={50} height={36} sx={{ bgcolor: tokens.glassOnDark }} /> : (
                    <Typography component="div" className="num" sx={{ fontSize: 28, fontWeight: 700, color: x.warn ? tokens.goldLight : tokens.onDark }}>{formatNumber(x.value)}</Typography>
                  )}
                </Box>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Card>
  );
}

function ChartSkeleton() {
  return <Skeleton variant="rounded" height={240} />;
}

/** Admin home: presence hero, KPI cards with deltas + sparklines, charts and recent movements. */
export function DashboardPage() {
  const [range, setRange] = useState<Range>('7');
  const q = useQuery({ queryKey: ['dashboard', range], queryFn: () => api.dashboard(Number(range)), refetchInterval: 30_000 });
  const d = q.data;
  const loading = q.isPending;
  const foodTotal = d ? d.food.canteen.rangeCents + d.food.buffet.rangeCents : 0;
  const foodPrev = d ? d.food.canteen.previousCents + d.food.buffet.previousCents : 0;
  const insidePct = d && d.soldiers.total ? Math.round((d.soldiers.inside / d.soldiers.total) * 100) : 0;
  const days = d?.gate.byDay.map((x) => shortDay(x.date)) ?? [];
  const tabs = <SegmentedTabs id="dash-range" value={range} onChange={setRange} options={[{ value: '7', label: '7 أيام' }, { value: '30', label: '30 يومًا' }, { value: '90', label: '90 يومًا' }]} />;
  const reasons = d?.gate.byReason ?? [];
  const sumDay = (a: { cents: number }[]) => a.map((x) => x.cents / 100);

  return (
    <>
      <PageHeader title="الرئيسية" description="نظرة شاملة على الموقف والحركة والمبيعات خلال الفترة المحددة."
        actions={<ExcelButtons disabled={!d} build={() => dashboardWorkbook(d!)} />} />
      <Hero d={d} loading={loading} />
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiCard label="حركات البوابة" value={formatNumber(d?.gate.total)} icon={ActivityIcon} tone="blue" loading={loading} highlight
            delta={d ? { percent: percentChange(d.gate.total, d.gate.previousTotal) } : undefined} spark={d?.gate.byDay.map((x) => x.entries + x.exits)} hint={`آخر ${range} يوم`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiCard label="الزوار" value={formatNumber(d?.visitors.total)} icon={BadgeIcon} tone="purple" loading={loading}
            delta={d ? { percent: percentChange(d.visitors.total, d.visitors.previousTotal) } : undefined} spark={d?.visitors.byDay.map((x) => x.count)} hint={d ? `${d.visitors.inside} بالداخل الآن` : undefined} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiCard label="مبيعات الكانتين والبوفيه" value={cash(foodTotal)} icon={CartIcon} tone="amber" loading={loading}
            delta={d ? { percent: percentChange(foodTotal, foodPrev) } : undefined}
            spark={d ? sumDay(d.food.canteen.byDay).map((v, i) => v + (d.food.buffet.byDay[i]?.cents ?? 0) / 100) : undefined} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <KpiCard label="نسبة التواجد بالوحدة" value={`${insidePct}%`} icon={InsideIcon} tone="green" loading={loading} live spark={d ? insideSeries(d) : undefined} hint={d ? `${d.soldiers.inside} من ${d.soldiers.total}` : undefined} />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <SectionCard title="الخروج مقابل الدخول يوميًا" subtitle="حركات البوابة لكل يوم" action={tabs}>
            {loading ? <ChartSkeleton /> : !d?.gate.byDay.some((x) => x.exits || x.entries) ? <EmptyState title="لا توجد حركات في هذه الفترة" hint="ستظهر الحركات هنا بعد تسجيل خروج أو دخول من البوابة." /> : (
              <BarChart height={280} xAxis={[{ scaleType: 'band', data: days }]}
                series={[{ data: d.gate.byDay.map((x) => x.exits), label: 'خروج', color: tokens.red }, { data: d.gate.byDay.map((x) => x.entries), label: 'دخول', color: tokens.green }]}
                margin={{ left: 36, right: 10, top: 10, bottom: 30 }} />
            )}
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="أسباب الخروج">
            {loading ? <ChartSkeleton /> : !reasons.length ? <EmptyState title="لا توجد بيانات" hint="لم تُسجَّل أسباب خروج بعد." /> : (
              <PieChart height={260} series={[{ innerRadius: 50, paddingAngle: 2, data: reasons.map((r, i) => ({ id: i, label: r.reason, value: r.count, color: PIE_COLORS[i % PIE_COLORS.length] })) }]} margin={{ top: 10, bottom: 60, left: 10, right: 10 }} />
            )}
          </SectionCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="مبيعات الكانتين والبوفيه (جنيه)" subtitle="يوميًا خلال الفترة">
            {loading ? <ChartSkeleton /> : !foodTotal ? <EmptyState title="لا توجد مبيعات في هذه الفترة" hint="سجّل مشتريات من صفحة الكانتين أو البوفيه." /> : (
              <BarChart height={260} xAxis={[{ scaleType: 'band', data: d!.food.canteen.byDay.map((x) => shortDay(x.date)) }]}
                series={[{ data: sumDay(d!.food.canteen.byDay), label: 'الكانتين', color: tokens.primary }, { data: sumDay(d!.food.buffet.byDay), label: 'البوفيه', color: tokens.gold }]}
                margin={{ left: 46, right: 10, top: 10, bottom: 30 }} />
            )}
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="الزوار حسب الفئة" subtitle="خلال الفترة المحددة">
            {loading ? <ChartSkeleton /> : !d?.visitors.byCategory.length ? <EmptyState title="لا يوجد زوار في هذه الفترة" /> : (
              <Stack spacing={1.5}>
                {d.visitors.byCategory.map((c) => {
                  const max = Math.max(...d.visitors.byCategory.map((x) => x.count), 1);
                  return (
                    <Box key={c.category}>
                      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                        <Typography variant="body2">{c.category}</Typography>
                        <Typography variant="body2" className="num" sx={{ fontWeight: 700 }}>{c.count}</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={(c.count / max) * 100} sx={{ height: 6, borderRadius: 3 }} />
                    </Box>
                  );
                })}
              </Stack>
            )}
          </SectionCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <SectionCard title="العسكريون حسب السرية" icon={GroupsIcon}>
            {loading ? <ChartSkeleton /> : !d?.byCompany.length ? <EmptyState title="لا توجد سرايا" /> : (
              <PieChart height={240} series={[{ innerRadius: 40, paddingAngle: 2, data: d.byCompany.map((c, i) => ({ id: i, label: c.company, value: c.count, color: PIE_COLORS[i % PIE_COLORS.length] })) }]} margin={{ top: 10, bottom: 60, left: 10, right: 10 }} />
            )}
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <SectionCard title="آخر الحركات" subtitle="أحدث خروج ودخول على البوابة" noPadding>
            {loading ? <Stack spacing={1} sx={{ p: 2 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={44} />)}</Stack> : !d?.gate.recent.length ? <EmptyState title="لا توجد حركات حديثة" hint="ستظهر آخر الحركات هنا فور تسجيلها." /> : (
              <List disablePadding aria-label="آخر الحركات">
                {d.gate.recent.slice(0, 8).map((m, i) => (
                  <ListItem key={`${m.at}-${i}`} divider={i < Math.min(d.gate.recent.length, 8) - 1} secondaryAction={<Typography variant="caption">{fromNow(m.at)}</Typography>}>
                    <ListItemAvatar>
                      <Avatar sx={{ width: 36, height: 36, bgcolor: m.kind === 'exit' ? tokens.amberSoft : tokens.greenSoft, color: m.kind === 'exit' ? tokens.amberInk : tokens.greenInk, fontSize: 15 }}>{m.name.slice(0, 1)}</Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={m.name} secondary={`${m.kind === 'exit' ? 'خروج' : 'دخول'}${m.reason ? ` · ${m.reason}` : ''} · ${m.military_no}`} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />
                  </ListItem>
                ))}
              </List>
            )}
          </SectionCard>
        </Grid>
      </Grid>
      {q.isError && <Typography color="error" sx={{ mt: 2 }}>{q.error.message}</Typography>}
    </>
  );
}
