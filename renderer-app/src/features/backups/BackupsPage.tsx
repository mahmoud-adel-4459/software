import AddIcon from '@mui/icons-material/AddOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import RestoreIcon from '@mui/icons-material/SettingsBackupRestoreOutlined';
import SaveAltIcon from '@mui/icons-material/SaveAltOutlined';
import ScheduleIcon from '@mui/icons-material/ScheduleOutlined';
import SizeIcon from '@mui/icons-material/StorageOutlined';
import StatusIcon from '@mui/icons-material/VerifiedUserOutlined';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import PreviewIcon from '@mui/icons-material/VisibilityOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/endpoints';
import { bridge, post, unwrap } from '@/api/client';
import type { BackupItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { DetailList, EmptyState, KpiCard, PageHeader, SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { RowActions, ToneChip } from '@/components/interactive';
import { formatBytes, formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useIdempotentPost } from '@/lib/useIdempotentPost';
import { ExcelButtons } from '@/components/ExcelButtons';
import { sheetWorkbook } from '@/lib/excel';

export const RESTORE_WORD = 'RESTORE';
const SKIP: Record<string, string> = { busy: 'مؤجل — الخادم مشغول بالعمليات', disabled: 'النسخ التلقائي متوقف من الإعدادات' };

/** Backups: KPIs, schedule, table (preview/save/restore), create/import and a strong restore confirmation. */
export function BackupsPage() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<{ item: BackupItem; restore: boolean } | null>(null);
  const q = useQuery({ queryKey: ['backups'], queryFn: api.backups, retry: false });
  const create = useIdempotentPost('/api/backup/create', {
    onSuccess: async () => { notify.success('تم إنشاء النسخة المشفرة'); await queryClient.invalidateQueries({ queryKey: ['backups'] }); },
    onError: notify.apiError,
  });
  const importFile = async () => {
    try {
      if (await unwrap(bridge().importBackup())) {
        notify.success('تم التحقق من ملف النسخة واستيراده');
        await queryClient.invalidateQueries({ queryKey: ['backups'] });
      }
    } catch (e) {
      notify.apiError(e);
    }
  };
  const list = q.data?.backups ?? [];
  const sch = q.data?.schedule;
  const total = list.reduce((s, b) => s + b.size, 0);
  const status = sch ? (sch.running ? 'جاري نسخ تلقائي…' : (sch.lastSkipReason && SKIP[sch.lastSkipReason]) || (sch.autoBackup ? 'يعمل في الخلفية' : 'متوقف')) : '—';
  const columns: Column<BackupItem>[] = [
    { field: 'createdAt', headerName: 'التاريخ', flex: 1, minWidth: 190, valueFormatter: (v: string) => formatDateTime(v) },
    { field: 'size', headerName: 'الحجم', width: 130, valueFormatter: (v: number) => formatBytes(v) },
    { field: 'id', headerName: '', width: 60, sortable: false, renderCell: (c) => <RowActions actions={[
      { label: 'معاينة المحتوى', icon: PreviewIcon, onClick: () => setTarget({ item: c.row, restore: false }) },
      { label: 'حفظ نسخة خارجية', icon: SaveAltIcon, onClick: () => void unwrap(bridge().saveBackup(c.row.id)).catch(notify.apiError) },
      { label: 'استعادة', icon: RestoreIcon, danger: true, onClick: () => setTarget({ item: c.row, restore: true }) },
    ]} /> },
  ];
  return (
    <>
      <PageHeader title="النسخ الاحتياطي والاستعادة" description="نسخ مشفرة، معاينة قبل الاستعادة، ونسخة أمان تلقائية قبل كل استعادة."
        actions={<>
          <ExcelButtons build={() => sheetWorkbook('النسخ-الاحتياطية', 'النسخ الاحتياطية', [{ header: 'التاريخ', key: 'at', width: 24 }, { header: 'الحجم', key: 'size' }, { header: 'المعرف', key: 'id', width: 44 }], list.map((b) => ({ at: formatDateTime(b.createdAt), size: formatBytes(b.size), id: b.id })))} />
          <Button variant="tonal" startIcon={<UploadIcon />} onClick={importFile}>استيراد ملف نسخة</Button>
          <Button variant="contained" startIcon={<AddIcon />} loading={create.isPending} onClick={() => create.mutate({})}>إنشاء نسخة الآن</Button>
        </>} />
      {q.isError && <Alert severity="error" sx={{ mb: 2.5 }}>{q.error.message}</Alert>}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard label="آخر نسخة" value={list[0] ? formatDateTime(list[0].createdAt) : '—'} icon={HistoryIcon} tone="green" loading={q.isPending} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard label="النسخة التالية (تقريبي)" value={sch?.autoBackup && sch.nextDueAt ? formatDateTime(sch.nextDueAt) : '—'} icon={ScheduleIcon} tone="blue" loading={q.isPending} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard label={`الحجم الكلي (${list.length} نسخة)`} value={formatBytes(total)} icon={SizeIcon} loading={q.isPending} /></Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}><KpiCard label="حالة الجدولة" value={status} icon={StatusIcon} tone={sch?.autoBackup ? 'green' : 'amber'} live={Boolean(sch?.running)} loading={q.isPending} /></Grid>
      </Grid>
      {sch && (
        <SectionCard title="النسخ التلقائي" subtitle="يُفحص كل 15 دقيقة؛ يُؤجَّل النسخ إذا كان الخادم مشغولًا." action={<Button component={Link} to="/settings" size="small" variant="tonal">تعديل من الإعدادات</Button>}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <ToneChip tone={sch.autoBackup ? 'success' : 'neutral'} label={sch.autoBackup ? `كل ${sch.autoBackupIntervalHours} ساعة` : 'متوقف'} />
            <ToneChip tone="info" label={`آخر نسخ تلقائي: ${sch.lastAutoBackupAt ? formatDateTime(sch.lastAutoBackupAt) : '—'}`} icon={false} />
            <ToneChip tone="neutral" label={`الاحتفاظ ${sch.backupRetentionDays} يومًا`} icon={false} />
          </Stack>
        </SectionCard>
      )}
      <SectionCard title="النسخ المتاحة" noPadding>
        <DataTable rows={list} columns={columns} loading={q.isFetching} emptyText="لا توجد نسخ احتياطية" emptyHint="أنشئ أول نسخة من الزر أعلاه." />
      </SectionCard>
      {!q.isError && !q.isPending && !list.length && <EmptyState title="لم تُنشأ نسخ بعد" />}
      {target && <RestoreDialog item={target.item} initialRestore={target.restore} onClose={() => setTarget(null)} />}
    </>
  );
}

/** Preview of a backup's table counts; the restore step requires the admin password and typing RESTORE. */
export function RestoreDialog({ item, initialRestore, onClose }: { item: BackupItem; initialRestore: boolean; onClose: () => void }) {
  const { logout } = useAuth();
  const [restore, setRestore] = useState(initialRestore);
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = useQuery({ queryKey: ['backup-preview', item.id], queryFn: () => api.backupPreview(item.id), retry: false });
  const ready = password.length > 0 && word === RESTORE_WORD;
  const doRestore = async () => {
    setBusy(true);
    try {
      await post('/api/backup/restore', { id: item.id, password, confirm: RESTORE_WORD });
      notify.success('تمت الاستعادة وإنشاء نسخة أمان؛ سجل الدخول من جديد');
      onClose();
      await logout();
    } catch (e) {
      notify.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{restore ? 'استعادة النسخة الاحتياطية' : 'محتوى النسخة'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>نسخة {formatDateTime(item.createdAt)} · {formatBytes(item.size)}</Typography>
        {preview.isPending && <Typography>جاري فحص النسخة…</Typography>}
        {preview.isError && <Alert severity="error">{preview.error.message}</Alert>}
        {preview.data && <DetailList rows={Object.entries(preview.data.counts).map(([k, v]) => ({ label: k, value: v }))} labelWidth={220} />}
        {restore && (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Alert severity="error">ستُستبدل كل البيانات الحالية بمحتوى هذه النسخة. ينشئ الخادم نسخة أمان أولًا ويُسجَّل خروج كل الأجهزة بعد النجاح.</Alert>
            <TextField label="كلمة مرور المسؤول" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <TextField label={`اكتب ${RESTORE_WORD} لتأكيد الاستبدال`} value={word} onChange={(e) => setWord(e.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="tonal" onClick={onClose} disabled={busy}>إغلاق</Button>
        {restore ? (
          <Button variant="contained" color="error" disabled={!ready || !preview.data} loading={busy} onClick={doRestore}>استعادة النسخة المحددة</Button>
        ) : (
          <Button variant="contained" color="error" disabled={!preview.data} onClick={() => setRestore(true)}>متابعة للاستعادة</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
