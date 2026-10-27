import EditIcon from '@mui/icons-material/EditOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAddAltOutlined';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import OutsideIcon from '@mui/icons-material/DirectionsWalkOutlined';
import LateIcon from '@mui/icons-material/AlarmOutlined';
import ProfileIcon from '@mui/icons-material/AssignmentIndOutlined';
import QrIcon from '@mui/icons-material/QrCode2Outlined';
import LabelIcon from '@mui/icons-material/LabelOutlined';
import BadgeIcon from '@mui/icons-material/BadgeOutlined';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/endpoints';
import type { Soldier } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Can } from '@/auth/guards';
import { KpiCard, PageHeader, SegmentedTabs } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { RowActions, SearchField, SoldierStatusChip } from '@/components/interactive';
import { formatNumber } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useSummary } from '@/lib/queries';
import { SoldierQrDialog } from './shared';
import { ExcelButtons } from '@/components/ExcelButtons';
import { SOLDIER_IMPORT, sheetWorkbook } from '@/lib/excel';

const BATCH = 200;

const soldiersWorkbook = (rows: Soldier[]) => sheetWorkbook('العسكريون', 'العسكريون', [
  { header: 'الاسم', key: 'name', width: 30 }, { header: 'الرقم العسكري', key: 'military_no' }, { header: 'الدرجة', key: 'rank' },
  { header: 'الرتبة', key: 'military_rank' }, { header: 'السرية', key: 'company' }, { header: 'الوحدة', key: 'unit' },
  { header: 'الوحدة الفرعية', key: 'sub_unit' }, { header: 'الحالة', key: 'status' },
  { header: 'الرقم القومي', key: 'national_id' }, { header: 'الهاتف', key: 'phone' },
], rows.map((r) => ({ name: r.name, military_no: r.military_no, rank: r.rank, military_rank: r.military_rank ?? '', company: r.company, unit: r.unit, sub_unit: r.sub_unit ?? '', status: r.status === 'in' ? 'داخل الوحدة' : 'خارج الوحدة', national_id: r.national_id ?? '', phone: r.phone ?? '' })));

/** Soldiers register: search, archived toggle, QR actions, 200-row server batches with client pagination. */
export function SoldiersPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const summary = useSummary();
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState<'active' | 'archived'>('active');
  const [batch, setBatch] = useState(0);
  const [qr, setQr] = useState<Soldier | null>(null);
  const list = useQuery({
    queryKey: ['soldiers', { q, batch, archived }],
    queryFn: () => api.soldiers({ q, offset: batch * BATCH, archived: archived === 'archived' }),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.soldiers ?? [];
  const print = (s: Soldier, type: 'qr' | 'card', mode: 'print' | 'pdf') => () =>
    api.document({ type, ids: [s.id], copies: 1, mode }).then(() => notify.success(mode === 'print' ? 'تم إرسال الطباعة' : 'تم حفظ PDF')).catch(notify.apiError);

  const columns: Column<Soldier>[] = [
    { field: 'name', headerName: 'الاسم', flex: 1.4, minWidth: 200, renderCell: (c) => <b>{c.value}</b> },
    { field: 'military_no', headerName: 'الرقم العسكري', width: 150, renderCell: (c) => <span className="num">{c.value}</span> },
    { field: 'rank', headerName: 'الدرجة', width: 110 },
    { field: 'military_rank', headerName: 'الرتبة', width: 110 },
    { field: 'company', headerName: 'السرية', width: 130 },
    { field: 'status', headerName: 'الحالة', width: 160, renderCell: (c) => <SoldierStatusChip status={c.row.status} /> },
    {
      field: 'actions', headerName: '', width: 60, sortable: false,
      renderCell: (c) => <RowActions actions={[
        { label: 'فتح الملف', icon: ProfileIcon, onClick: () => navigate(`/soldiers/${c.row.id}`) },
        { label: 'تعديل', icon: EditIcon, onClick: () => navigate(`/soldiers/${c.row.id}/edit`) },
        { label: 'معاينة QR', icon: QrIcon, onClick: () => setQr(c.row) },
        { label: 'طباعة ملصق QR', icon: LabelIcon, onClick: print(c.row, 'qr', 'print') },
        { label: 'طباعة بطاقة', icon: BadgeIcon, onClick: print(c.row, 'card', 'print') },
      ]} />,
    },
  ];

  return (
    <>
      <PageHeader title="العسكريون" description="بحث، بطاقات QR، وملفات كاملة مع المرفقات."
        actions={<>
          <ExcelButtons build={() => soldiersWorkbook(rows)} importSpec={isAdmin ? SOLDIER_IMPORT : undefined} />
          <Can when={isAdmin}><Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => navigate('/soldiers/new')}>إضافة عسكري</Button></Can>
        </>} />
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, sm: 4 }}><KpiCard label="المعروضون" value={formatNumber(rows.length)} icon={PeopleIcon} loading={list.isPending} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><KpiCard label="خارج الوحدة" value={formatNumber(summary.data?.outside)} icon={OutsideIcon} tone="amber" live loading={summary.isPending} /></Grid>
        <Grid size={{ xs: 12, sm: 4 }}><KpiCard label="متأخرون عن العودة" value={formatNumber(summary.data?.late)} icon={LateIcon} tone="red" loading={summary.isPending} /></Grid>
      </Grid>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' } }}>
          <SegmentedTabs id="sold" value={archived} onChange={(v) => { setArchived(v); setBatch(0); }} options={[{ value: 'active', label: 'النشطون' }, ...(isAdmin ? [{ value: 'archived' as const, label: 'المؤرشفون' }] : [])]} />
          <SearchField value={q} onChange={(v) => { setQ(v); setBatch(0); }} placeholder="الاسم أو الرقم العسكري" />
        </Stack>
      </Paper>
      <Paper variant="outlined">
        <DataTable rows={rows} columns={columns} loading={list.isFetching} onRowClick={isAdmin ? (r) => navigate(`/soldiers/${r.id}`) : undefined}
          emptyText={q ? 'لا توجد نتائج للبحث' : 'لا يوجد عسكريون'} emptyHint={q ? 'جرّب اسمًا أو رقمًا آخر.' : 'أضف أول عسكري لبدء العمل.'} />
        {(batch > 0 || rows.length === BATCH) && (
          <Stack direction="row" spacing={2} sx={{ p: 1.5, alignItems: 'center', justifyContent: 'center' }}>
            <Button size="small" variant="tonal" disabled={batch === 0} onClick={() => setBatch((b) => b - 1)}>الدفعة السابقة</Button>
            <Typography variant="caption">الدفعة {batch + 1} (كل دفعة {BATCH} سجل)</Typography>
            <Button size="small" variant="tonal" disabled={rows.length < BATCH} onClick={() => setBatch((b) => b + 1)}>الدفعة التالية</Button>
          </Stack>
        )}
      </Paper>
      <SoldierQrDialog soldier={qr} onClose={() => setQr(null)} />
    </>
  );
}
