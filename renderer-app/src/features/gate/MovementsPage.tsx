import ActivityIcon from '@mui/icons-material/TimelineOutlined';
import LateIcon from '@mui/icons-material/AlarmOutlined';
import OutsideIcon from '@mui/icons-material/DirectionsWalkOutlined';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PreviewIcon from '@mui/icons-material/VisibilityOutlined';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import ReturnedIcon from '@mui/icons-material/AssignmentReturnedOutlined';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import type { Permit } from '@/api/types';
import { api } from '@/api/endpoints';
import { KpiCard, PageHeader, SegmentedTabs } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { RowActions, SearchField, ToneChip, type ChipTone } from '@/components/interactive';
import { formatDateTime, formatNumber, isLate } from '@/lib/format';
import { notify } from '@/lib/notify';
import { usePermits, useSummary } from '@/lib/queries';
import { ExcelButtons } from '@/components/ExcelButtons';
import { sheetWorkbook } from '@/lib/excel';

type Filter = 'all' | 'outside' | 'late' | 'returned' | 'cancelled';
const statusOf = (p: Permit): Exclude<Filter, 'all'> => (p.voided ? 'cancelled' : p.returned_at ? 'returned' : isLate(p.expected_return) ? 'late' : 'outside');
const STATUS: Record<Exclude<Filter, 'all'>, { label: string; tone: ChipTone }> = {
  cancelled: { label: 'إذن ملغى', tone: 'neutral' },
  returned: { label: 'عاد إلى الوحدة', tone: 'success' },
  late: { label: 'متأخر عن العودة', tone: 'danger' },
  outside: { label: 'خارج الوحدة', tone: 'warning' },
};

/** Latest 200 permits with status, return times and voucher actions. */
export function MovementsPage() {
  const permits = usePermits();
  const summary = useSummary();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const all = permits.data ?? [];
    return all.filter((p) => (filter === 'all' || statusOf(p) === filter) && (!q || `${p.name} ${p.military_no} ${p.reason}`.includes(q)));
  }, [permits.data, filter, q]);
  const count = (f: Filter) => (permits.data ?? []).filter((p) => f === 'all' || statusOf(p) === f).length;
  const doc = (p: Permit, mode: 'preview' | 'print' | 'pdf') => () =>
    api.document({ type: 'voucher', id: p.id, mode }).then(() => mode !== 'preview' && notify.success(mode === 'print' ? 'تم إرسال الطباعة' : 'تم حفظ PDF')).catch(notify.apiError);

  const columns: Column<Permit>[] = [
    { field: 'no', headerName: 'الإذن', width: 90, renderCell: (c) => <span className="num">#{c.value}</span> },
    { field: 'name', headerName: 'العسكري', flex: 1.2, minWidth: 180, renderCell: (c) => <Stack><b>{c.row.name}</b><Typography variant="caption" className="num">{c.row.military_no}</Typography></Stack> },
    { field: 'reason', headerName: 'السبب', flex: 1, minWidth: 140 },
    { field: 'exit_at', headerName: 'وقت الخروج', width: 150, valueFormatter: (v: string) => formatDateTime(v) },
    { field: 'expected_return', headerName: 'العودة المتوقعة', width: 150, valueFormatter: (v: string) => formatDateTime(v) },
    { field: 'returned_at', headerName: 'الدخول الفعلي', width: 150, valueFormatter: (v: string | null) => (v ? formatDateTime(v) : 'لم يسجل بعد') },
    { field: 'voided', headerName: 'الحالة', width: 170, sortable: false, renderCell: (c) => <ToneChip tone={STATUS[statusOf(c.row)].tone} label={STATUS[statusOf(c.row)].label} /> },
    {
      field: 'actions', headerName: '', width: 60, sortable: false,
      renderCell: (c) => <RowActions actions={[
        { label: 'معاينة الإذن', icon: PreviewIcon, onClick: doc(c.row, 'preview') },
        { label: 'طباعة الإذن', icon: PrintIcon, onClick: doc(c.row, 'print') },
        { label: 'حفظ PDF', icon: PdfIcon, onClick: doc(c.row, 'pdf') },
      ]} />,
    },
  ];

  return (
    <>
      <PageHeader title="حركات البوابة" description="أحدث 200 تصريح مع حالة العودة والتأخير؛ التقارير تعرض الحركات بالفترة المطلوبة."
        actions={<ExcelButtons build={() => sheetWorkbook('حركات-البوابة', 'حركات البوابة', [{ header: 'الإذن', key: 'no' }, { header: 'العسكري', key: 'name', width: 30 }, { header: 'الرقم العسكري', key: 'military_no' }, { header: 'السبب', key: 'reason', width: 24 }, { header: 'وقت الخروج', key: 'exit_at', width: 22 }, { header: 'العودة المتوقعة', key: 'expected_return', width: 22 }, { header: 'الدخول الفعلي', key: 'returned_at', width: 22 }, { header: 'الحالة', key: 'status' }],
          rows.map((p) => ({ no: p.no, name: p.name, military_no: p.military_no, reason: p.reason, exit_at: formatDateTime(p.exit_at), expected_return: formatDateTime(p.expected_return), returned_at: p.returned_at ? formatDateTime(p.returned_at) : 'لم يسجل بعد', status: STATUS[statusOf(p)].label })))} />} />
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard label="خارج الوحدة" value={formatNumber(summary.data?.outside)} icon={OutsideIcon} tone="amber" loading={summary.isPending} live active={filter === 'outside'} onClick={() => setFilter('outside')} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard label="متأخرون عن العودة" value={formatNumber(summary.data?.late)} icon={LateIcon} tone="red" loading={summary.isPending} active={filter === 'late'} onClick={() => setFilter('late')} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard label="عادوا" value={count('returned')} icon={ReturnedIcon} tone="green" loading={permits.isPending} active={filter === 'returned'} onClick={() => setFilter('returned')} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard label="إجمالي المعروض" value={count('all')} icon={ActivityIcon} tone="primary" loading={permits.isPending} active={filter === 'all'} onClick={() => setFilter('all')} /></Grid>
      </Grid>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
          <SegmentedTabs id="mv" value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'الكل', count: count('all') },
            { value: 'outside', label: 'خارج', count: count('outside') },
            { value: 'late', label: 'متأخر', count: count('late') },
            { value: 'returned', label: 'عاد', count: count('returned') },
            { value: 'cancelled', label: 'ملغى', count: count('cancelled') },
          ]} />
          <SearchField value={q} onChange={setQ} placeholder="بحث بالاسم أو الرقم أو السبب" />
        </Stack>
      </Paper>
      <Paper variant="outlined">
        <DataTable rows={rows} columns={columns} loading={permits.isFetching && !permits.data} emptyText="لا توجد حركات بوابة" emptyHint="سجل خروج عسكري من شاشة البوابة لعرض إذنه هنا." />
      </Paper>
    </>
  );
}
