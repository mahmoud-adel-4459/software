import ApproveIcon from '@mui/icons-material/TaskAltOutlined';
import RejectIcon from '@mui/icons-material/BlockOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/endpoints';
import type { VisitorPass } from '@/api/types';
import { EmptyState, PageHeader, SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { DocButtons } from '@/components/DocButtons';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useIdempotentPost } from '@/lib/useIdempotentPost';
import { tokens } from '@/theme/tokens';
import { PassDetails, PassStatusChip, useVisitorPasses } from './shared';

type Decision = { id: string; decision: 'approve' | 'reject'; notes: string };

/** Unit: requests sent from the gate. Approving prints the QR pass that is carried to the gate. */
export function VisitorPassesPage() {
  const queryClient = useQueryClient();
  const passes = useVisitorPasses();
  const [rejecting, setRejecting] = useState<VisitorPass | null>(null);
  const [notes, setNotes] = useState('');
  const decide = useIdempotentPost<Decision>('/api/visitor-passes/decide', {
    onSuccess: async (_r, vars) => {
      await queryClient.invalidateQueries({ queryKey: ['visitor-passes'] });
      if (vars.decision === 'reject') {
        notify.success('تم رفض الطلب وإبلاغ البوابة');
        setRejecting(null);
        setNotes('');
        return;
      }
      notify.success('تم الاعتماد — جارٍ طباعة التصريح');
      try {
        await api.document({ type: 'visitor-pass', id: vars.id, mode: 'print' });
      } catch (e) {
        notify.apiError(e);
        notify.info('يمكن إعادة طباعة التصريح من جدول التصاريح');
      }
    },
    onError: notify.apiError,
  });
  const all = passes.data ?? [];
  const pending = all.filter((p) => p.status === 'pending');
  const columns: Column<VisitorPass>[] = [
    { field: 'no', headerName: '#', width: 70, renderCell: (c) => <span className="num">{c.value}</span> },
    { field: 'name', headerName: 'الزائر', flex: 1, minWidth: 160, renderCell: (c) => <b>{c.value}</b> },
    { field: 'host', headerName: 'الجهة المقصودة', flex: 1, minWidth: 140, valueFormatter: (v: string) => v || '—' },
    { field: 'purpose', headerName: 'سبب الزيارة', flex: 1, minWidth: 140 },
    { field: 'status', headerName: 'الحالة', width: 190, renderCell: (c) => <PassStatusChip pass={c.row} /> },
    { field: 'decided_at', headerName: 'القرار', width: 170, valueFormatter: (v: string | null) => formatDateTime(v) },
    { field: 'check_in', headerName: 'الدخول', width: 170, valueFormatter: (v: string | null) => formatDateTime(v) },
    { field: 'id', headerName: 'التصريح', width: 230, sortable: false, renderCell: (c) => c.row.status === 'approved' && !c.row.expired
      ? <DocButtons doc={{ type: 'visitor-pass', id: c.row.id }} modes={['preview', 'print']} /> : null },
  ];
  return (
    <>
      <PageHeader title="تصاريح الزوار" description="طلبات الدخول القادمة من البوابة. الاعتماد يطبع تصريحًا بباركود يُسلَّم للبوابة ليدخل به الزائر." />
      <SectionCard title="بانتظار الاعتماد" subtitle="تتحدث تلقائيًا — يظهر تنبيه عند وصول طلب جديد">
        {passes.isError && <Alert severity="error">{passes.error.message}</Alert>}
        {!passes.isPending && pending.length === 0 && <EmptyState title="لا توجد طلبات معلقة" hint="عند تسجيل البوابة لزائر جديد يظهر طلبه هنا." />}
        <Grid container spacing={2}>
          {pending.map((p) => (
            <Grid key={p.id} size={{ xs: 12, md: 6, xl: 4 }}>
              <Card variant="outlined" sx={{ p: 2, height: '100%', borderInlineStart: `5px solid ${tokens.amber}` }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h5">طلب #{p.no}</Typography>
                  <PassStatusChip pass={p} />
                </Stack>
                <PassDetails pass={p} />
                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <Button variant="contained" color="success" startIcon={<ApproveIcon />} sx={{ flex: 1 }}
                    loading={decide.isPending && decide.variables?.id === p.id && decide.variables.decision === 'approve'}
                    disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, decision: 'approve', notes: '' })}>
                    اعتماد وطباعة التصريح
                  </Button>
                  <Button variant="tonal" color="error" startIcon={<RejectIcon />} disabled={decide.isPending} onClick={() => setRejecting(p)}>
                    رفض
                  </Button>
                </Stack>
              </Card>
            </Grid>
          ))}
        </Grid>
      </SectionCard>
      <SectionCard title="التصاريح" subtitle="المفتوحة وآخر 24 ساعة">
        <DataTable rows={all.filter((p) => p.status !== 'pending')} columns={columns} loading={passes.isPending} emptyText="لا توجد تصاريح" />
      </SectionCard>
      <Dialog open={Boolean(rejecting)} onClose={() => setRejecting(null)} fullWidth maxWidth="xs">
        <DialogTitle>رفض دخول {rejecting?.name}</DialogTitle>
        <DialogContent>
          <TextField label="سبب الرفض (يظهر للبوابة)" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={2} sx={{ mt: 1 }} slotProps={{ htmlInput: { maxLength: 500 } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="tonal" onClick={() => setRejecting(null)}>إلغاء</Button>
          <Button variant="contained" color="error" loading={decide.isPending} onClick={() => rejecting && decide.mutate({ id: rejecting.id, decision: 'reject', notes })}>تأكيد الرفض</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
