import SendIcon from '@mui/icons-material/SendOutlined';
import CancelIcon from '@mui/icons-material/CancelOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { VisitorPass } from '@/api/types';
import { PageHeader, SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { RowActions } from '@/components/interactive';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';
import { useIdempotentPost } from '@/lib/useIdempotentPost';
import { PassStatusChip, useVisitorPasses } from './shared';

const EMPTY = { name: '', nationalId: '', phone: '', organization: '', categoryId: '', host: '', purpose: '' };

/** Gate: send a waiting visitor's details to the unit, then follow the request until the printed pass arrives. */
export function GateVisitorRequestsPage() {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const passes = useVisitorPasses();
  const [fields, setFields] = useState(EMPTY);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['visitor-passes'] });
  const send = useIdempotentPost<typeof EMPTY, { id: string; no: number }>('/api/gate/visitor-passes', {
    onSuccess: async (r) => {
      notify.success(`تم إرسال الطلب #${r.no} إلى الوحدة — انتظر التصريح المطبوع`);
      setFields(EMPTY);
      await refresh();
    },
    onError: notify.apiError,
  });
  const cancel = useIdempotentPost<{ id: string }>('/api/gate/visitor-passes/cancel', {
    onSuccess: async () => {
      notify.success('تم إلغاء الطلب');
      await refresh();
    },
    onError: notify.apiError,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nationalId = fields.nationalId.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    send.mutate({ ...fields, nationalId });
  };
  const input = (key: keyof typeof EMPTY, label: string, required = false, maxLength = 200) => (
    <TextField label={label} value={fields[key]} required={required} disabled={send.isPending}
      onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))} slotProps={{ htmlInput: { maxLength } }} />
  );
  const columns: Column<VisitorPass>[] = [
    { field: 'no', headerName: '#', width: 70, renderCell: (c) => <span className="num">{c.value}</span> },
    { field: 'name', headerName: 'الزائر', flex: 1, minWidth: 160, renderCell: (c) => <b>{c.value}</b> },
    { field: 'host', headerName: 'الجهة المقصودة', flex: 1, minWidth: 140, valueFormatter: (v: string) => v || '—' },
    { field: 'purpose', headerName: 'سبب الزيارة', flex: 1, minWidth: 140 },
    { field: 'status', headerName: 'الحالة', width: 190, renderCell: (c) => <PassStatusChip pass={c.row} /> },
    { field: 'requested_at', headerName: 'وقت الطلب', width: 170, valueFormatter: (v: string) => formatDateTime(v) },
    { field: 'id', headerName: '', width: 60, sortable: false, renderCell: (c) => (c.row.status === 'pending' || c.row.status === 'approved') ? (
      <RowActions actions={[{ label: 'إلغاء الطلب (الزائر انصرف)', icon: CancelIcon, danger: true, onClick: () => cancel.mutate({ id: c.row.id }) }]} />
    ) : null },
  ];
  return (
    <>
      <PageHeader title="طلبات الزوار" description="أرسل بيانات الزائر إلى الوحدة؛ بعد الاعتماد يصل تصريح مطبوع بباركود يُمسح من شاشة البوابة للدخول ثم للخروج." />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <SectionCard title="زائر جديد على البوابة" icon={SendIcon}>
            <Stack component="form" onSubmit={submit} spacing={2}>
              {input('name', 'اسم الزائر', true)}
              {input('nationalId', 'الرقم القومي (اختياري)', false, 14)}
              {input('phone', 'رقم الهاتف (اختياري)', false, 30)}
              {input('organization', 'جهة الزائر (اختياري)')}
              <TextField select label="فئة الزائر" value={fields.categoryId} required disabled={send.isPending}
                onChange={(e) => setFields((f) => ({ ...f, categoryId: e.target.value }))}>
                {(catalog.data?.visitorCategories ?? []).filter((c) => !c.disabled).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
              {input('host', 'الجهة / الشخص المطلوب زيارته')}
              {input('purpose', 'سبب الزيارة', true, 500)}
              <Button type="submit" variant="contained" size="large" startIcon={<SendIcon />} loading={send.isPending} disabled={!fields.categoryId}>
                إرسال الطلب إلى الوحدة
              </Button>
            </Stack>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <SectionCard title="متابعة الطلبات" subtitle="تتحدث تلقائيًا كل بضع ثوانٍ">
            <Alert severity="info" sx={{ mb: 2 }}>عند وصول التصريح المطبوع امسح الباركود من شاشة «البوابة» لتسجيل دخول الزائر، وامسحه مرة أخرى عند خروجه.</Alert>
            {passes.isError && <Alert severity="error" sx={{ mb: 2 }}>{passes.error.message}</Alert>}
            <DataTable rows={passes.data ?? []} columns={columns} loading={passes.isPending} emptyText="لا توجد طلبات" emptyHint="سجّل بيانات أول زائر من النموذج." />
          </SectionCard>
        </Grid>
      </Grid>
    </>
  );
}
