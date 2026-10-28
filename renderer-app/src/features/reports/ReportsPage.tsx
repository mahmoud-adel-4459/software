import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import UndoIcon from '@mui/icons-material/UndoOutlined';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExcelButtons } from '@/components/ExcelButtons';
import { sheetWorkbook } from '@/lib/excel';
import { useMemo, useState } from 'react';
import { api } from '@/api/endpoints';
import { bridge, unwrap } from '@/api/client';
import type { ReportFilter, ReportType } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Can } from '@/auth/guards';
import { KpiCard, PageHeader, SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { DocButtons } from '@/components/DocButtons';
import { SelectField } from '@/components/Fields';
import { ConfirmDialog, RowActions, ToneChip } from '@/components/interactive';
import { addDays, cash, formatDateTime, startOfMonth, todayCairo } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';
import { useIdempotentPost } from '@/lib/useIdempotentPost';

type Row = Record<string, unknown> & { id: string };

/** Display value for a report column (money, time, movement kind, status, booleans). */
export function formatReportCell(key: string, value: unknown): string {
  if (value == null || value === '') return key === 'check_out' ? '—' : '';
  if (key === 'at' || key === 'check_out') return formatDateTime(String(value));
  if (key === 'amount_cents') return cash(Number(value));
  if (key === 'kind') return value === 'entry' ? 'دخول' : 'خروج';
  if (key === 'status') return value === 'in' ? 'داخل الوحدة' : 'خارج الوحدة';
  if (key === 'archived') return value ? 'نعم' : 'لا';
  return String(value);
}

const SUMMARY_LABELS: Record<string, [string, 'primary' | 'green' | 'amber' | 'red' | 'blue']> = {
  rows: ['عدد السجلات', 'primary'], inside: ['داخل الوحدة', 'green'], outside: ['خارج الوحدة', 'amber'], archived: ['مؤرشف', 'blue'],
  entries: ['دخول', 'green'], exits: ['خروج', 'amber'], corrected: ['بعد تصحيح', 'red'], openVisits: ['زيارة مفتوحة', 'amber'],
  completed: ['مكتملة', 'green'], reversals: ['تصحيحات', 'red'],
};

/** Detailed reports: 6 types, presets, outlet filter, CSV export, print and gate corrections. */
export function ReportsPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const reports = catalog.data?.reports ?? [];
  const today = todayCairo();
  const [draft, setDraft] = useState<ReportFilter>({ type: 'soldiers', from: startOfMonth(today), to: today, q: '', company: '', outletId: '' });
  const [applied, setApplied] = useState<ReportFilter | null>(null);
  const type = reports.some((r) => r.id === draft.type) ? draft.type : (reports[0]?.id as ReportType | undefined) ?? draft.type;
  const meta = reports.find((r) => r.id === type);
  const filter = applied ?? { ...draft, type };
  const data = useQuery({ queryKey: ['report', filter], queryFn: () => api.report(filter), enabled: Boolean(meta), retry: false, refetchInterval: 30_000, refetchOnWindowFocus: true });
  const [correcting, setCorrecting] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const correct = useIdempotentPost<{ eventId: string; reason: string }>('/api/gate/correct', {
    onSuccess: async () => {
      setCorrecting(null);
      setReason('');
      notify.success('تم عكس الحركة');
      await queryClient.invalidateQueries({ queryKey: ['report'] });
    },
    onError: notify.apiError,
  });
  const set = <K extends keyof ReportFilter>(k: K, v: ReportFilter[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const preset = (p: 'today' | '7d' | 'month' | 'year') => setDraft((d) => ({
    ...d, to: today, from: p === 'today' ? today : p === '7d' ? addDays(today, -6) : p === 'month' ? startOfMonth(today) : `${today.slice(0, 4)}-01-01`,
  }));
  const outlets = meta?.filters.outlet ? catalog.data?.outlets[meta.filters.outletKind ?? 'canteen'] ?? [] : [];

  const columns = useMemo<Column<Row>[]>(() => {
    const cols: Column<Row>[] = (meta?.columns ?? []).map(([key, title]) => ({
      field: key, headerName: title, flex: 1, minWidth: 130,
      valueGetter: (_v, r) => formatReportCell(key, r[key]),
    }));
    if (type === 'gate' && isAdmin) {
      cols.push({ field: '__act', headerName: '', width: 60, sortable: false, renderCell: (c) => c.row.correction_reason ? <ToneChip tone="neutral" label="مصحّحة" icon={false} /> : <RowActions actions={[{ label: 'عكس الحركة', icon: UndoIcon, danger: true, onClick: () => setCorrecting(c.row) }]} /> });
    }
    return cols;
  }, [meta, type, isAdmin]);
  const run = () => setApplied({ ...draft, type });
  const rows = (data.data?.rows ?? []) as Row[];
  const summary = data.data?.summary;

  return (
    <>
      <PageHeader title="التقارير" description="اختر نوع التقرير؛ تظهر الفلاتر المناسبة فقط. حتى 10000 سجل — CSV / PDF للمسؤول." />
      <Paper variant="outlined" sx={{ p: 2, mb: 2.5 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
            <SelectField label="نوع التقرير" value={type} onChange={(v) => set('type', v as ReportType)} options={reports.map((r) => ({ value: r.id, label: r.title }))} />
            {meta?.filters.outlet && outlets.length > 0 && (
              <SelectField label="نقطة بيع محددة (اختياري)" value={draft.outletId} onChange={(v) => set('outletId', v)} options={[{ value: '', label: `الكل (${outlets.length})` }, ...outlets.map((o) => ({ value: o.id, label: o.name }))]} />
            )}
            {meta?.filters.fromTo && (
              <>
                <TextField label="من" type="date" value={draft.from} onChange={(e) => set('from', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 170 }} />
                <TextField label="إلى" type="date" value={draft.to} onChange={(e) => set('to', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 170 }} />
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Button size="small" variant="tonal" onClick={() => preset('today')}>اليوم</Button>
                  <Button size="small" variant="tonal" onClick={() => preset('7d')}>آخر 7 أيام</Button>
                  <Button size="small" variant="tonal" onClick={() => preset('month')}>هذا الشهر</Button>
                  <Button size="small" variant="tonal" onClick={() => preset('year')}>هذه السنة</Button>
                </Stack>
              </>
            )}
            <TextField label="بحث (اسم أو رقم)" value={draft.q} onChange={(e) => set('q', e.target.value)} sx={{ maxWidth: 260 }} />
            {meta?.filters.company && <TextField label="السرية (مطابقة تامة)" value={draft.company} onChange={(e) => set('company', e.target.value)} sx={{ maxWidth: 220 }} />}
            <Button variant="contained" onClick={run} loading={data.isFetching}>عرض التقرير</Button>
          </Stack>
          {meta && <Typography variant="caption">{meta.hint}{!meta.filters.fromTo ? ' — هذا التقرير لا يستخدم «من / إلى».' : ''}</Typography>}
        </Stack>
      </Paper>
      {summary && (
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {Object.entries(summary).filter(([k, v]) => k === 'rows' || (v && SUMMARY_LABELS[k])).map(([k, v]) => k === 'totalCents' ? null : (
            <Grid key={k} size={{ xs: 6, md: 3 }}><KpiCard label={SUMMARY_LABELS[k]?.[0] ?? k} value={v} tone={SUMMARY_LABELS[k]?.[1] ?? 'primary'} /></Grid>
          ))}
          {data.data?.totalCents != null && <Grid size={{ xs: 6, md: 3 }}><KpiCard label="الإجمالي" value={cash(data.data.totalCents)} tone="green" /></Grid>}
        </Grid>
      )}
      <SectionCard title="النتائج" badge={<Typography variant="caption">{rows.length} سجل</Typography>} noPadding
        action={<Can when={isAdmin}><Stack direction="row" spacing={1}>
          <ExcelButtons disabled={!rows.length} build={() => sheetWorkbook(`${meta?.title ?? 'تقرير'}-${filter.from}`, meta?.short ?? 'تقرير', (meta?.columns ?? []).map(([key, title]) => ({ header: key === 'amount_cents' ? `${title} (ج.م)` : title, key })),
            rows.map((r) => Object.fromEntries((meta?.columns ?? []).map(([key]) => [key, key === 'amount_cents' ? Number(r[key] ?? 0) / 100 : formatReportCell(key, r[key])]))))} />
          <Button size="small" variant="tonal" startIcon={<DownloadIcon />} onClick={() => void unwrap(bridge().exportReport(filter)).then((ok) => ok && notify.success('تم حفظ التقرير')).catch(notify.apiError)}>تصدير CSV</Button>
          <DocButtons doc={{ type: 'report', filter }} />
        </Stack></Can>}>
        {data.isError ? <Typography color="error" sx={{ p: 2 }}>{data.error.message}</Typography> : <DataTable rows={rows} columns={columns} loading={data.isFetching} getRowId={(r) => String(r.id)} emptyText="لا توجد نتائج" emptyHint="غيّر الفترة أو معايير البحث." />}
      </SectionCard>
      <ConfirmDialog open={Boolean(correcting)} title="عكس حركة بوابة" tone="danger" confirmLabel="عكس الحركة" loading={correct.isPending} confirmDisabled={!reason.trim()}
        message="يمكن عكس أحدث حركة غير مصححة للعسكري فقط." onClose={() => setCorrecting(null)} onConfirm={() => correcting && correct.mutate({ eventId: correcting.id, reason })}>
        <TextField label="سبب التصحيح" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </ConfirmDialog>
    </>
  );
}
