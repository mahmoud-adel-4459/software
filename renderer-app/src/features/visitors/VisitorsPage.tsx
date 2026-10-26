import { zodResolver } from '@hookform/resolvers/zod';
import BlockIcon from '@mui/icons-material/BlockOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import PersonAddIcon from '@mui/icons-material/PersonAddAltOutlined';
import RestoreIcon from '@mui/icons-material/RestoreOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/endpoints';
import { post } from '@/api/client';
import type { Visitor } from '@/api/types';
import { PageHeader } from '@/components/basic';
import { QrDialog } from '@/components/QrDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { RhfSelect, RhfText } from '@/components/Fields';
import { RowActions, SearchField, ToneChip } from '@/components/interactive';
import { TIER_LABELS } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';
import { useRef } from 'react';
import { ExcelButtons } from '@/components/ExcelButtons';
import { VISITOR_IMPORT, sheetWorkbook } from '@/lib/excel';
import { VisitorCards } from './VisitorCards';

const schema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب'),
  categoryId: z.string().min(1, 'اختر الفئة'),
  badgeNo: z.string().optional(),
  organization: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});
type Values = z.infer<typeof schema>;

/** Visitors register: search, add/edit dialog, QR, disable/enable. */
export function VisitorsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Visitor | 'new' | null>(null);
  const list = useQuery({ queryKey: ['visitors', q], queryFn: () => api.visitors(q) });
  const toggle = async (v: Visitor) => {
    try {
      await post('/api/visitors/update', { id: v.id, disabled: !v.disabled });
      await queryClient.invalidateQueries({ queryKey: ['visitors'] });
      notify.success(v.disabled ? 'تم تفعيل الزائر' : 'تم تعطيل الزائر');
    } catch (e) {
      notify.apiError(e);
    }
  };
  const columns: Column<Visitor>[] = [
    { field: 'name', headerName: 'الاسم', flex: 1.2, minWidth: 180, renderCell: (c) => <b>{c.value}</b> },
    { field: 'badge_no', headerName: 'البطاقة', width: 120, renderCell: (c) => <span className="num">{c.value}</span> },
    { field: 'category_name', headerName: 'الفئة', width: 190, renderCell: (c) => <ToneChip tone={c.row.category_tier === 'admin' ? 'success' : c.row.category_tier === 'special' ? 'warning' : 'neutral'} label={`${c.row.category_name} · ${TIER_LABELS[c.row.category_tier]}`} icon={false} /> },
    { field: 'organization', headerName: 'الجهة', flex: 1, minWidth: 140, valueFormatter: (v: string) => v || '—' },
    { field: 'phone', headerName: 'الهاتف', width: 140, valueFormatter: (v: string) => v || '—' },
    { field: 'disabled', headerName: 'الحالة', width: 110, renderCell: (c) => <ToneChip tone={c.row.disabled ? 'neutral' : 'success'} label={c.row.disabled ? 'معطل' : 'نشط'} /> },
    { field: 'id', headerName: '', width: 60, sortable: false, renderCell: (c) => <RowActions actions={[
      { label: 'تعديل', icon: EditIcon, onClick: () => setEditing(c.row) },
      { label: c.row.disabled ? 'تفعيل' : 'تعطيل', icon: c.row.disabled ? RestoreIcon : BlockIcon, danger: !c.row.disabled, onClick: () => void toggle(c.row) },
    ]} /> },
  ];
  return (
    <>
      <PageHeader title="الزوار" description="بطاقات الدخول وسجل الزوار المسجّلين من البوابة." actions={<>
        <ExcelButtons build={() => sheetWorkbook('الزوار', 'الزوار', [{ header: 'الاسم', key: 'name', width: 30 }, { header: 'البطاقة', key: 'badge_no' }, { header: 'الفئة', key: 'category' }, { header: 'الجهة', key: 'organization' }, { header: 'الهاتف', key: 'phone' }, { header: 'الحالة', key: 'state' }],
          (list.data ?? []).map((v) => ({ name: v.name, badge_no: v.badge_no, category: `${v.category_name} · ${TIER_LABELS[v.category_tier]}`, organization: v.organization, phone: v.phone, state: v.disabled ? 'معطل' : 'نشط' })))} importSpec={VISITOR_IMPORT} />
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => navigate('/gate')}>تسجيل زيارة من البوابة</Button>
      </>} />
      <VisitorCards />
      <Paper variant="outlined">
        <Stack sx={{ p: 2 }} spacing={1}>
          <Typography component="h2" variant="h5">سجل الزوار</Typography>
          <SearchField value={q} onChange={setQ} placeholder="الاسم أو البطاقة أو الجهة" />
        </Stack>
        <DataTable rows={list.data ?? []} columns={columns} loading={list.isFetching} emptyText={q ? 'لا توجد نتائج' : 'لا يوجد زوار'} emptyHint="امسح بطاقة زائر في البوابة لتسجيل أول زيارة." />
      </Paper>
      {editing && <VisitorDialog visitor={editing === 'new' ? null : editing} categories={(catalog.data?.visitorCategories ?? []).filter((c) => !c.disabled)} onClose={() => setEditing(null)} />}
    </>
  );
}

function VisitorDialog({ visitor, categories, onClose }: { visitor: Visitor | null; categories: { id: string; name: string }[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const id = useRef<{ key: string; id: string } | null>(null);
  const { control, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: visitor?.name ?? '', categoryId: categories.find((c) => c.name === visitor?.category_name)?.id ?? categories[0]?.id ?? '', badgeNo: '', organization: visitor?.organization ?? '', phone: visitor?.phone ?? '', notes: '' },
  });
  const submit = handleSubmit(async (v) => {
    const body: Record<string, unknown> = { name: v.name, categoryId: v.categoryId, organization: v.organization ?? '', phone: v.phone ?? '' };
    if (v.notes?.trim()) body.notes = v.notes;
    if (visitor) body.id = visitor.id;
    else if (v.badgeNo?.trim()) body.badgeNo = v.badgeNo.trim();
    const key = JSON.stringify(body);
    if (id.current?.key !== key) id.current = { key, id: crypto.randomUUID() };
    try {
      await post(visitor ? '/api/visitors/update' : '/api/visitors', body, id.current.id);
      id.current = null;
      await queryClient.invalidateQueries({ queryKey: ['visitors'] });
      notify.success('تم حفظ الزائر');
      onClose();
    } catch (e) {
      notify.apiError(e);
    }
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" component="form" onSubmit={submit}>
      <DialogTitle>{visitor ? 'تعديل زائر' : 'زائر جديد'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <RhfText control={control} name="name" label="الاسم" autoFocus />
          <RhfSelect control={control} name="categoryId" label="الفئة" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          {!visitor && <RhfText control={control} name="badgeNo" label="رقم البطاقة (اختياري — يُولَّد تلقائيًا)" />}
          <RhfText control={control} name="organization" label="الجهة / الجهة الزائرة" />
          <RhfText control={control} name="phone" label="الهاتف" />
          <RhfText control={control} name="notes" label="ملاحظات" multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="tonal" onClick={onClose}>إلغاء</Button>
        <Button type="submit" variant="contained" loading={formState.isSubmitting}>حفظ الزائر</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Visitor QR preview with «معاينة»/«طباعة» through the label printer (`visitor-qr` document). */
export function VisitorQr({ visitor, onClose }: { visitor: { id: string; name: string; badge_no: string } | null; onClose: () => void }) {
  return (
    <QrDialog
      open={Boolean(visitor)}
      onClose={onClose}
      heading="QR الزائر"
      name={visitor?.name}
      subtitle={visitor ? `بطاقة ${visitor.badge_no}` : undefined}
      queryKey={['qr-visitor', visitor?.id]}
      load={() => api.qrVisitor(visitor!.id)}
      labelDoc={visitor ? { type: 'visitor-qr', ids: [visitor.id], copies: 1 } : undefined}
    />
  );
}
