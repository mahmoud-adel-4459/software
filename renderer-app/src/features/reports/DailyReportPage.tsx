import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '@/api/endpoints';
import { EmptyState, KpiCard, PageHeader, SectionCard } from '@/components/basic';
import { DocButtons } from '@/components/DocButtons';
import { addDays, cash, dayOnly, formatDateTime, formatNumber, todayCairo } from '@/lib/format';
import { tokens } from '@/theme/tokens';

function MiniTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <EmptyState title="لا سجلات في هذا اليوم" />;
  return (
    <Table size="small">
      <TableHead><TableRow>{head.map((h) => <TableCell key={h} sx={{ fontWeight: 700, color: tokens.textSecondary, bgcolor: tokens.ice100 }}>{h}</TableCell>)}</TableRow></TableHead>
      <TableBody>{rows.map((r, i) => <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>)}</TableBody>
    </Table>
  );
}

const bars = (data: { label: string; value: number }[], color: string) => (
  <BarChart height={240} xAxis={[{ scaleType: 'band', data: data.map((d) => d.label) }]} series={[{ data: data.map((d) => d.value), color }]} margin={{ left: 30, right: 10, top: 10, bottom: 30 }} hideLegend />
);

/** Daily report dashboard: KPIs, charts and activity tables for a Cairo calendar day. */
export function DailyReportPage() {
  const [date, setDate] = useState(todayCairo());
  const q = useQuery({ queryKey: ['daily-report', date], queryFn: () => api.dailyReport(date) });
  const r = q.data;
  const s = r?.snapshot.soldiers;
  const g = r?.activity.gate;
  const hours = (g?.byHour ?? []).filter((h) => h.entries || h.exits);
  return (
    <>
      <PageHeader title="التقرير اليومي الشامل" description="لقطة الأفراد + كل نشاط اليوم (بوابة، زوار، كانتين، بوفيه، لياقة) برسوم وجداول."
        actions={<DocButtons doc={{ type: 'daily-report', date }} size="medium" />} />
      <Paper variant="outlined" sx={{ p: 2, mb: 2.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <TextField label="تاريخ التقرير" type="date" value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 190 }} />
          <Button variant="tonal" onClick={() => setDate(todayCairo())}>اليوم</Button>
          <Button variant="tonal" onClick={() => setDate(addDays(todayCairo(), -1))}>أمس</Button>
          {r && <Typography variant="caption" sx={{ marginInlineStart: 'auto' }}>{r.unit.name} · توليد: {formatDateTime(r.generatedAt)}</Typography>}
        </Stack>
      </Paper>
      {q.isError && <EmptyState title="تعذر تحميل التقرير" hint={q.error.message} />}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {[
          ['أفراد نشطون', s?.total, 'primary'], ['داخل', s?.inside, 'green'], ['خارج', s?.outside, 'amber'],
          ['تصاريح نشطة', r?.snapshot.permits.activeOutside, 'blue'], ['متأخرون', r?.snapshot.permits.late, 'red'], ['حركات بوابة', g?.total, 'primary'],
          ['زوار اليوم', r?.activity.visitors.checkIns, 'purple'], ['زوار بالداخل', r?.activity.visitors.stillInside, 'amber'],
        ].map(([label, v, tone]) => (
          <Grid key={String(label)} size={{ xs: 6, md: 3, xl: 1.5 }}><KpiCard label={String(label)} value={formatNumber(v as number | undefined)} tone={tone as 'primary'} loading={q.isPending} /></Grid>
        ))}
      </Grid>
      {r && s && g && (
        <>
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 4 }}>
              <SectionCard title="توزيع الأفراد">
                <PieChart height={220} hideLegend={false} series={[{ innerRadius: 50, data: [
                  { id: 0, value: s.inside, label: 'داخل الوحدة', color: tokens.green },
                  { id: 1, value: s.outside, label: 'خارج الوحدة', color: tokens.red },
                  { id: 2, value: s.archived, label: 'مؤرشف', color: tokens.navy200 },
                ].filter((x) => x.value > 0) }]} />
              </SectionCard>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}><SectionCard title="الأفراد حسب السرية">{bars(s.byCompany.map((c) => ({ label: c.company, value: c.count })), tokens.primary)}</SectionCard></Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <SectionCard title="حركات البوابة بالساعة" subtitle="دخول وخروج">
                <BarChart height={240} xAxis={[{ scaleType: 'band', data: hours.map((h) => String(h.hour)) }]} series={[{ data: hours.map((h) => h.entries), label: 'دخول', color: tokens.green }, { data: hours.map((h) => h.exits), label: 'خروج', color: tokens.red }]} margin={{ left: 30, right: 10, top: 10, bottom: 30 }} />
              </SectionCard>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}><SectionCard title="أسباب الخروج">{bars(g.byReason.map((x) => ({ label: x.reason, value: x.count })), tokens.secondary)}</SectionCard></Grid>
            <Grid size={{ xs: 12, md: 6 }}><SectionCard title="زوار حسب الفئة">{bars(r.activity.visitors.byCategory.map((c) => ({ label: c.category, value: c.count })), tokens.purple)}</SectionCard></Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <SectionCard title="الكانتين والبوفيه (جنيه)">
                {bars([...r.activity.canteen.outlets.map((o) => ({ label: `ك ${o.name}`, value: Math.round(o.totalCents / 100) })), ...r.activity.buffet.outlets.map((o) => ({ label: `ب ${o.name}`, value: Math.round(o.totalCents / 100) }))], tokens.blue)}
              </SectionCard>
            </Grid>
          </Grid>
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, lg: 6 }}><SectionCard title="آخر حركات البوابة" noPadding><MiniTable head={['الوقت', 'العسكري', 'الحركة', 'السبب']} rows={g.recent.map((x) => [formatDateTime(x.at), x.name, x.kind === 'entry' ? 'دخول' : 'خروج', x.reason])} /></SectionCard></Grid>
            <Grid size={{ xs: 12, lg: 6 }}><SectionCard title="زوار اليوم" noPadding><MiniTable head={['الدخول', 'الزائر', 'الفئة', 'الغرض']} rows={r.activity.visitors.recent.map((x) => [formatDateTime(x.at), x.name, x.category_name, x.purpose])} /></SectionCard></Grid>
            <Grid size={{ xs: 12, lg: 6 }}><SectionCard title="كانتين" badge={<Typography variant="caption">{r.activity.canteen.transactions} عملية · {cash(r.activity.canteen.totalCents)}</Typography>} noPadding><MiniTable head={['الوقت', 'العسكري', 'المبلغ']} rows={r.activity.canteen.recent.map((x) => [formatDateTime(x.at), x.name, cash(x.amount_cents)])} /></SectionCard></Grid>
            <Grid size={{ xs: 12, lg: 6 }}><SectionCard title="بوفيه" badge={<Typography variant="caption">{r.activity.buffet.transactions} عملية · {cash(r.activity.buffet.totalCents)}</Typography>} noPadding><MiniTable head={['الوقت', 'العسكري', 'المبلغ']} rows={r.activity.buffet.recent.map((x) => [formatDateTime(x.at), x.name, cash(x.amount_cents)])} /></SectionCard></Grid>
            <Grid size={{ xs: 12, lg: 6 }}><SectionCard title="لياقة" noPadding><MiniTable head={['التاريخ', 'العسكري', 'الاختبار', 'النتيجة']} rows={r.activity.fitness.recent.map((x) => [dayOnly(x.date), x.name, x.type, `${x.value} ${x.unit || ''}`])} /></SectionCard></Grid>
            <Grid size={{ xs: 12, lg: 6 }}><SectionCard title="سجل إداري (آخر 15)" noPadding><MiniTable head={['الوقت', 'المستخدم', 'الإجراء']} rows={r.audit.map((x) => [formatDateTime(x.at), x.username, x.action])} /></SectionCard></Grid>
          </Grid>
          <Typography variant="caption">نقاط البيع: {r.snapshot.outlets.canteen} كانتين · {r.snapshot.outlets.buffet} بوفيه. التقرير يجمع لقطة الأفراد + نشاط اليوم بتوقيت القاهرة.</Typography>
        </>
      )}
    </>
  );
}
