import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PreviewIcon from '@mui/icons-material/VisibilityOutlined';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { DataGrid, type GridRowSelectionModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { api } from '@/api/endpoints';
import type { Soldier, Visitor } from '@/api/types';
import { PageHeader, SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { SelectField } from '@/components/Fields';
import { SearchField } from '@/components/interactive';
import { LabelPrinterNote } from '@/components/QrDialog';
import { VisitorQr } from '@/features/visitors/VisitorsPage';
import { notify } from '@/lib/notify';

type Mode = 'print' | 'preview' | 'pdf';
const TYPES = [{ value: 'qr', label: 'ملصق QR (بوابة)' }, { value: 'card', label: 'بطاقة عسكري' }];

async function run(type: string, ids: string[], copies: number, mode: Mode) {
  if (ids.length > 100) return notify.error('الحد الأقصى 100 عسكري في الطلب الواحد');
  try {
    const completed = await api.document({ type, ids, copies, mode });
    if (!completed) return;
    if (mode === 'print') notify.success('تم إرسال الطباعة');
    if (mode === 'pdf') notify.success('تم حفظ PDF');
  } catch (e) {
    notify.apiError(e);
  }
}
const clampCopies = (v: string) => Math.max(1, Math.min(8, Number(v) || 1));

function ModeButtons({ onMode, disabled }: { onMode: (m: Mode) => void | Promise<unknown>; disabled?: boolean }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState<Mode | null>(null);
  const submit = async (mode: Mode) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(mode);
    try { await onMode(mode); }
    finally { pending.current = false; setBusy(null); }
  };
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
      <Button variant="contained" startIcon={<PrintIcon />} loading={busy === 'print'} disabled={disabled || (busy !== null && busy !== 'print')} onClick={() => submit('print')}>طباعة المختار</Button>
      <Button variant="tonal" startIcon={<PreviewIcon />} loading={busy === 'preview'} disabled={disabled || (busy !== null && busy !== 'preview')} onClick={() => submit('preview')}>معاينة</Button>
      <Button variant="tonal" startIcon={<PdfIcon />} loading={busy === 'pdf'} disabled={disabled || (busy !== null && busy !== 'pdf')} onClick={() => submit('pdf')}>PDF</Button>
    </Stack>
  );
}

/** Printing: quick lookup + print, and bulk QR labels / cards (3.5×4 بوصة labels). */
export function PrintingPage() {
  return (
    <>
      <PageHeader title="الطباعة" description="ابحث بالاسم أو الرقم واطبع QR فورًا، أو اطبع دفعة كاملة." />
      <Alert severity="info" sx={{ mb: 2.5 }}>الملصقات تُطبع على طابعة الملصقات بمقاس الملصق المضبوط، والبطاقات على طابعة المكتب. اضبط الطابعات والمقاسات من الإعدادات. <LabelPrinterNote /></Alert>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 6 }}><QuickLookup /></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><BulkPrint /></Grid>
        <Grid size={{ xs: 12 }}><VisitorLabels /></Grid>
      </Grid>
    </>
  );
}

function QuickLookup() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [type, setType] = useState('qr');
  const [copies, setCopies] = useState('1');
  const [chosen, setChosen] = useState('');
  const hits = useQuery({ queryKey: ['print-hits', applied], enabled: Boolean(applied), queryFn: async () => (await api.soldiers({ q: applied })).soldiers.slice(0, 40) });
  const rows = hits.data ?? [];
  const selected = chosen || (rows.length === 1 ? rows[0].id : rows.find((s) => s.military_no === applied)?.id) || '';
  const search = (e?: FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return notify.error('أدخل اسمًا أو رقمًا عسكريًا');
    setChosen('');
    setApplied(q.trim());
  };
  const print = async (mode: Mode) => {
    if (!selected) {
      if (!applied) return search();
      return notify.error(rows.length ? 'عدة نتائج — اختر عسكريًا من الجدول' : 'لا يوجد عسكري بهذا البحث');
    }
    await run(type, [selected], clampCopies(copies), mode);
  };
  const cols: Column<Soldier>[] = [
    { field: 'id', headerName: '', width: 56, sortable: false, renderCell: (c) => <Radio size="small" checked={selected === c.row.id} onChange={() => setChosen(c.row.id)} slotProps={{ input: { 'aria-label': `اختيار ${c.row.name}` } }} /> },
    { field: 'name', headerName: 'الاسم', flex: 1, minWidth: 160 },
    { field: 'military_no', headerName: 'الرقم', width: 130, renderCell: (c) => <span className="num">{c.value}</span> },
    { field: 'rank', headerName: 'الدرجة', width: 100 },
    { field: 'military_rank', headerName: 'الرتبة', width: 100 },
  ];
  return (
    <SectionCard title="بحث وطباعة QR">
      <Stack spacing={2}>
        <Stack component="form" onSubmit={search} direction="row" spacing={1}>
          <TextField label="اسم العسكري أو الرقم العسكري" value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثال: محمد أو 000012345" autoComplete="off" />
          <Button type="submit" variant="tonal" startIcon={<SearchIcon />} loading={hits.isFetching}>بحث</Button>
        </Stack>
        {applied && <DataTable rows={rows} columns={cols} pageSize={10} emptyText="لا يوجد عسكري بهذا البحث" />}
        <Stack direction="row" spacing={2}>
          <SelectField label="نوع المستند" value={type} onChange={setType} options={TYPES} />
          <TextField label="عدد النسخ" type="number" value={copies} onChange={(e) => setCopies(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 8 } }} sx={{ maxWidth: 140 }} />
        </Stack>
        <ModeButtons onMode={print} />
      </Stack>
    </SectionCard>
  );
}

function BulkPrint() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('qr');
  const [copies, setCopies] = useState('1');
  const [sel, setSel] = useState<string[]>([]);
  const list = useQuery({ queryKey: ['soldiers', { q, batch: 0, archived: 'active' }], queryFn: () => api.soldiers({ q }) });
  const cols: Column<Soldier>[] = [
    { field: 'name', headerName: 'الاسم', flex: 1, minWidth: 160 },
    { field: 'military_no', headerName: 'الرقم', width: 130, renderCell: (c) => <span className="num">{c.value}</span> },
    { field: 'company', headerName: 'السرية', width: 110 },
  ];
  const onSel = (m: GridRowSelectionModel) => setSel(m.type === 'exclude' ? (list.data?.soldiers ?? []).map((s) => s.id).filter((id) => !m.ids.has(id)) : [...m.ids].map(String));
  return (
    <SectionCard title="طباعة جماعية" subtitle="اختر عسكريين من القائمة">
      <Stack spacing={2}>
        <SearchField value={q} onChange={setQ} placeholder="تصفية القائمة" />
        <DataGrid<Soldier> rows={list.data?.soldiers ?? []} columns={cols} loading={list.isFetching} checkboxSelection disableRowSelectionOnClick disableColumnMenu autoHeight
          onRowSelectionModelChange={onSel} pageSizeOptions={[10, 20, 50]} initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }} disableVirtualization={import.meta.env.MODE === 'test'} />
        <Stack direction="row" spacing={2}>
          <SelectField label="نوع الطباعة" value={type} onChange={setType} options={TYPES} />
          <TextField label="عدد النسخ لكل عسكري" type="number" value={copies} onChange={(e) => setCopies(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 8 } }} sx={{ maxWidth: 200 }} />
        </Stack>
        <ModeButtons disabled={!sel.length} onMode={(m) => run(type, sel, clampCopies(copies), m)} />
      </Stack>
    </SectionCard>
  );
}

function VisitorLabels() {
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<Visitor | null>(null);
  const list = useQuery({ queryKey: ['visitors', q], queryFn: () => api.visitors(q) });
  const cols: Column<Visitor>[] = [
    { field: 'name', headerName: 'الاسم', flex: 1, minWidth: 160 },
    { field: 'badge_no', headerName: 'البطاقة', width: 130, renderCell: (c) => <span className="num">{c.value}</span> },
    { field: 'category_name', headerName: 'الفئة', width: 150 },
    { field: 'id', headerName: '', width: 150, sortable: false, renderCell: (c) => <Button size="small" variant="tonal" startIcon={<PrintIcon />} onClick={() => setTarget(c.row)}>ملصق QR</Button> },
  ];
  return (
    <SectionCard title="ملصق QR للزوار" subtitle="3.5×4 بوصة — معاينة وطباعة من نافذة الطباعة">
      <Stack spacing={2}>
        <SearchField value={q} onChange={setQ} placeholder="اسم الزائر أو البطاقة" />
        <DataTable rows={list.data ?? []} columns={cols} loading={list.isFetching} pageSize={10} emptyText="لا يوجد زوار" />
      </Stack>
      <VisitorQr visitor={target} onClose={() => setTarget(null)} />
    </SectionCard>
  );
}
