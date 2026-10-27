import AddIcon from '@mui/icons-material/AddOutlined';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { DocButtons } from '@/components/DocButtons';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '@/api/endpoints';
import type { PersonnelCategory, PersonnelRecord } from '@/api/types';
import { SectionCard, SegmentedTabs } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { ConfirmDialog, RowActions } from '@/components/interactive';
import { useIdempotentPost } from '@/lib/useIdempotentPost';
import { notify } from '@/lib/notify';

export const PERSONNEL_LABELS: Record<PersonnelCategory, string> = {
  leave: 'الإجازات', grant: 'المنح', reward: 'المكافآت', penalty: 'الجزاءات والغرامات', medical: 'الأوامر الطبية',
  medical_affairs: 'الموقف الطبي', security_scan: 'المسح الأمني', security_report: 'تقرير ضابط أمن الوحدة',
  evaluation: 'التقييم النهائي',
};
const LABELS = PERSONNEL_LABELS;

/** "2026-11-01 08:00" for leaves with times, the date alone otherwise. */
const when = (date: string | null, time?: string) => (date ? `${date}${time ? ` ${time}` : ''}` : '—');

/** Administrative and medical histories are edited directly in the soldier's file. */
export function PersonnelRecords({ soldierId, archived = false }: { soldierId: string; archived?: boolean }) {
  const queryClient = useQueryClient();
  const records = useQuery({ queryKey: ['personnel-records', soldierId], queryFn: () => api.personnelRecords(soldierId) });
  const [category, setCategory] = useState<PersonnelCategory>('leave');
  const [editing, setEditing] = useState<PersonnelRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PersonnelRecord | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['personnel-records', soldierId] });
  const remove = useIdempotentPost<{ id: string; soldierId: string; version: number }>('/api/soldier/records/delete', {
    onSuccess: async () => { setDeleting(null); await refresh(); notify.success('تم حذف السجل'); },
    onError: notify.apiError,
  });
  const columns: Column<PersonnelRecord>[] = [
    { field: 'record_date', headerName: category === 'leave' ? 'الخروج' : 'التاريخ / البداية', width: 160, valueGetter: (_v, r) => when(r.record_date, r.start_time) },
    { field: 'end_date', headerName: category === 'leave' ? 'العودة' : 'تاريخ النهاية', width: 160, valueGetter: (_v, r) => when(r.end_date, r.end_time) },
    { field: 'title', headerName: category === 'evaluation' ? 'التقدير' : 'البيان', flex: 1, minWidth: 180 },
    { field: 'reference', headerName: 'رقم الأمر / المرجع', width: 160 },
    { field: 'details', headerName: 'التفاصيل والملاحظات', flex: 1.5, minWidth: 250,
      renderCell: cell => <Box title={cell.row.details} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell.row.details || '—'}</Box> },
    { field: 'id', headerName: '', width: 60, sortable: false,
      renderCell: cell => <RowActions actions={archived ? [
        { label: 'عرض السجل', onClick: () => setEditing(cell.row) },
      ] : [
        { label: 'عرض وتعديل السجل', icon: EditIcon, onClick: () => setEditing(cell.row) },
        { label: 'حذف السجل', icon: DeleteIcon, danger: true, onClick: () => setDeleting(cell.row) },
      ]} /> },
  ];
  return (
    <SectionCard title="السجلات الإدارية والطبية والأمنية" subtitle="اختر القسم لإضافة السجلات والتقارير مباشرة في ملف العسكري."
      action={<Button variant="contained" startIcon={<AddIcon />} disabled={archived || records.isPending || records.isError} onClick={() => setEditing('new')}>إضافة سجل</Button>}>
      {archived && <Alert severity="info" sx={{ mb: 2 }}>الملف مؤرشف؛ السجلات متاحة للعرض. ألغِ الأرشفة لتعديلها.</Alert>}
      <SegmentedTabs id={`personnel-${soldierId}`} value={category} onChange={setCategory}
        options={(Object.keys(LABELS) as PersonnelCategory[]).map(value => ({ value, label: LABELS[value], count: records.data?.filter(r => r.category === value).length ?? 0 }))} />
      <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>طباعة {LABELS[category]}:</Typography>
        <DocButtons doc={{ type: 'soldier-file', soldierId, category }} />
      </Stack>
      {records.isError ? <Alert severity="error" sx={{ mt: 2 }} action={<Button onClick={() => records.refetch()}>إعادة المحاولة</Button>}>{records.error.message}</Alert> :
        <Box sx={{ mt: 2 }}><DataTable rows={(records.data ?? []).filter(r => r.category === category)} columns={columns}
          loading={records.isPending} pageSize={10} emptyText={`لا توجد سجلات في ${LABELS[category]}`} emptyHint="استخدم «إضافة سجل» لتسجيل البيانات مباشرة." /></Box>}
      {editing && <RecordDialog soldierId={soldierId} category={category} record={editing === 'new' ? null : editing}
        readOnly={archived}
        onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} />}
      <ConfirmDialog open={Boolean(deleting)} title="حذف السجل" message={`حذف «${deleting?.title ?? ''}» من ملف العسكري؟`}
        confirmLabel="حذف" tone="danger" loading={remove.isPending} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) remove.mutate({ id: deleting.id, soldierId, version: deleting.version }); }} />
    </SectionCard>
  );
}

interface EntryBody {
  soldierId: string; category: PersonnelCategory; id?: string; version?: number;
  title: string; recordDate: string; endDate: string; startTime: string; endTime: string; reference: string; details: string;
}

function RecordDialog({ soldierId, category, record, readOnly, onClose, onSaved }: {
  soldierId: string; category: PersonnelCategory; record: PersonnelRecord | null; onClose: () => void; onSaved: () => Promise<void>;
  readOnly: boolean;
}) {
  const kind = record?.category ?? category;
  const isLeave = kind === 'leave';
  const isEvaluation = kind === 'evaluation';
  const queryClient = useQueryClient();
  const evaluation = useQuery({ queryKey: ['soldier-evaluation', soldierId], queryFn: () => api.soldierEvaluation(soldierId), enabled: isEvaluation });
  const [values, setValues] = useState({ title: record?.title ?? '', recordDate: record?.record_date ?? '',
    endDate: record?.end_date ?? '', startTime: record?.start_time ?? '', endTime: record?.end_time ?? '',
    reference: record?.reference ?? '', details: record?.details ?? '' });
  const save = useIdempotentPost<EntryBody>('/api/soldier/records', {
    onSuccess: async () => {
      notify.success('تم حفظ السجل في ملف العسكري');
      await queryClient.invalidateQueries({ queryKey: ['soldier-evaluation', soldierId] });
      await onSaved();
    },
    onError: notify.apiError,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (readOnly) return;
    if (values.endDate && values.endDate < values.recordDate) return notify.error('تاريخ النهاية يجب ألا يسبق البداية');
    if (isLeave && values.endTime && !values.endDate) return notify.error('حدد تاريخ العودة مع وقت العودة');
    if (isLeave && values.startTime && values.endTime && `${values.endDate}T${values.endTime}` <= `${values.recordDate}T${values.startTime}`) {
      return notify.error('موعد العودة يجب أن يكون بعد موعد الخروج');
    }
    save.mutate({ ...values, soldierId, category: record?.category ?? category, ...(record ? { id: record.id, version: record.version } : {}) });
  };
  const change = (key: keyof typeof values, value: string) => setValues(previous => ({ ...previous, [key]: value }));
  return (
    <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="sm" component="form" onSubmit={submit}>
      <DialogTitle>{record ? 'عرض وتعديل سجل' : 'إضافة سجل'} — {LABELS[record?.category ?? category]}</DialogTitle>
      <DialogContent>
        <Stack component="fieldset" disabled={readOnly || save.isPending} spacing={2} sx={{ pt: 1, px: 0, pb: 0, m: 0, border: 0, minWidth: 0 }}>
          {isEvaluation ? (
            <>
              {evaluation.data && (
                <Alert severity="info">
                  متوسط اللياقة: {evaluation.data.average == null ? 'لا توجد نتائج محسوبة' : `${evaluation.data.average}% (${evaluation.data.testedCount} اختبار)`}
                  {evaluation.data.suggestedGrade && <> — التقدير المقترح: <b>{evaluation.data.suggestedGrade}</b></>}
                </Alert>
              )}
              <TextField select label="التقدير النهائي" value={values.title} onChange={e => change('title', e.target.value)} required autoFocus disabled={save.isPending}>
                {[...new Set([...(evaluation.data?.gradeLabels ?? []), ...(values.title ? [values.title] : [])])].map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </TextField>
            </>
          ) : (
            <TextField label={isLeave ? 'نوع الإجازة' : 'البيان / العنوان'} value={values.title} onChange={e => change('title', e.target.value)} required autoFocus disabled={save.isPending} slotProps={{ htmlInput: { maxLength: 200 } }} />
          )}
          <Stack direction="row" spacing={1.5}>
            <TextField label={isLeave ? 'تاريخ الخروج' : isEvaluation ? 'تاريخ التقييم' : 'التاريخ / بداية المدة'} type="date" value={values.recordDate} onChange={e => change('recordDate', e.target.value)} required disabled={save.isPending} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            {isLeave && <TextField label="وقت الخروج" type="time" value={values.startTime} onChange={e => change('startTime', e.target.value)} disabled={save.isPending} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />}
          </Stack>
          {!isEvaluation && (
            <Stack direction="row" spacing={1.5}>
              <TextField label={isLeave ? 'تاريخ العودة' : 'تاريخ النهاية (اختياري)'} type="date" value={values.endDate} onChange={e => change('endDate', e.target.value)} disabled={save.isPending}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: values.recordDate || undefined } }} sx={{ flex: 1 }} />
              {isLeave && <TextField label="وقت العودة" type="time" value={values.endTime} onChange={e => change('endTime', e.target.value)} disabled={save.isPending} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />}
            </Stack>
          )}
          <TextField label="رقم الأمر / المرجع (اختياري)" value={values.reference} onChange={e => change('reference', e.target.value)} disabled={save.isPending} slotProps={{ htmlInput: { maxLength: 100 } }} />
          <TextField label={kind === 'security_report' ? 'نص تقرير ضابط أمن الوحدة' : kind === 'security_scan' ? 'نتيجة المسح الأمني' : 'التفاصيل والملاحظات'} value={values.details} onChange={e => change('details', e.target.value)} multiline minRows={4} disabled={save.isPending} slotProps={{ htmlInput: { maxLength: 5000 } }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={save.isPending}>إلغاء</Button>
        {!readOnly && <Button type="submit" variant="contained" loading={save.isPending}>حفظ السجل</Button>}
      </DialogActions>
    </Dialog>
  );
}
