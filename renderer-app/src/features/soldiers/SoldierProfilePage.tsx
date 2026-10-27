import ArchiveIcon from '@mui/icons-material/Inventory2Outlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import QrIcon from '@mui/icons-material/QrCode2Outlined';
import { DocButtons } from '@/components/DocButtons';
import SaveAltIcon from '@mui/icons-material/SaveAltOutlined';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/api/endpoints';
import { bridge, post, unwrap } from '@/api/client';
import type { AttachmentKind } from '@/api/types';
import { DetailList, EmptyState, PageHeader, SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { ConfirmDialog, RowActions, SoldierStatusChip } from '@/components/interactive';
import { formatBytes, formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notify';
import { ATTACHMENT_LABELS, gateProfileRows } from '@/lib/soldierProfile';
import { PhotoSlots, SoldierQrDialog, useSavedPhotos, type PendingPhotos } from './shared';
import type { AttachmentMeta } from '@/api/types';
import { PersonnelRecords } from './PersonnelRecords';
import { EvaluationCard } from './EvaluationCard';

/** Soldier file: details, QR, photos, documents and archive. */
export function SoldierProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const record = useQuery({ queryKey: ['soldier', id], queryFn: () => api.soldier(id) });
  const saved = useSavedPhotos(record.data?.attachments);
  const [pending, setPending] = useState<PendingPhotos>({});
  const [qr, setQr] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (record.isError) return <EmptyState title="تعذر فتح الملف" hint={record.error.message} />;
  if (!record.data) return <Skeleton variant="rounded" height={420} />;
  const { soldier, attachments } = record.data;
  const docs = attachments.filter((a) => a.kind === 'document');
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['soldier', id] }), queryClient.invalidateQueries({ queryKey: ['soldiers'] })]);

  const pick = async (kind: AttachmentKind) => {
    try {
      const file = await unwrap(bridge().pickAttachment());
      if (!file) return;
      if (!file.mime.startsWith('image/')) return notify.error('اختر PNG أو JPEG');
      setPending((p) => ({ ...p, [kind]: file }));
    } catch (e) {
      notify.apiError(e);
    }
  };
  const savePhotos = async () => {
    setBusy(true);
    try {
      for (const [kind, file] of Object.entries(pending)) if (file) await post('/api/attachments', { ...file, kind, soldierId: soldier.id }, crypto.randomUUID());
      setPending({});
      await refresh();
      notify.success('تم حفظ الصور');
    } catch (e) {
      notify.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  const addDocument = async () => {
    try {
      const file = await unwrap(bridge().pickAttachment());
      if (!file) return;
      await post('/api/attachments', { ...file, kind: 'document', soldierId: soldier.id }, crypto.randomUUID());
      await refresh();
      notify.success('تم حفظ المرفق');
    } catch (e) {
      notify.apiError(e);
    }
  };
  const archive = async () => {
    setBusy(true);
    try {
      await post('/api/soldier/archive', { id: soldier.id, version: soldier.version, archived: !soldier.archived }, crypto.randomUUID());
      await refresh();
      notify.success(soldier.archived ? 'تم إلغاء الأرشفة' : 'تمت الأرشفة');
      navigate('/soldiers');
    } catch (e) {
      notify.apiError(e);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const cols: Column<AttachmentMeta>[] = [
    { field: 'name', headerName: 'الاسم', flex: 1, minWidth: 200 },
    { field: 'kind', headerName: 'النوع', width: 140, valueFormatter: (v: AttachmentKind) => ATTACHMENT_LABELS[v] ?? v },
    { field: 'size', headerName: 'الحجم', width: 110, valueFormatter: (v: number) => formatBytes(v) },
    { field: 'created_at', headerName: 'التاريخ', width: 160, valueFormatter: (v: string) => formatDateTime(v) },
    { field: 'id', headerName: '', width: 60, sortable: false, renderCell: (c) => <RowActions actions={[{ label: 'حفظ المرفق', icon: SaveAltIcon, onClick: () => void unwrap(bridge().saveAttachment(c.row.id)).catch(notify.apiError) }]} /> },
  ];

  return (
    <>
      <PageHeader title={`ملف ${soldier.name}`} description="الحقول الشخصية والمرفقات المركزية."
        actions={<>
          <Button variant="tonal" startIcon={<QrIcon />} onClick={() => setQr(true)}>QR</Button>
          <DocButtons size="medium" doc={{ type: 'soldier-file', soldierId: soldier.id }} />
          <Button variant="tonal" startIcon={<ArchiveIcon />} onClick={() => setConfirm(true)}>{soldier.archived ? 'إلغاء الأرشفة' : 'أرشفة الملف'}</Button>
          <Button variant="contained" startIcon={<EditIcon />} onClick={() => navigate(`/soldiers/${soldier.id}/edit`)}>تعديل</Button>
        </>} />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <SectionCard title="بيانات العسكري" badge={<SoldierStatusChip status={soldier.status} />}>
            <DetailList rows={[...gateProfileRows(soldier), { label: 'الرقم القومي', value: soldier.national_id || '—' }]} />
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <SectionCard title="مستندات إضافية" subtitle="PDF أو صورة" action={<Button size="small" variant="contained" onClick={addDocument}>اختيار وحفظ مرفق</Button>} noPadding>
            <DataTable rows={docs} columns={cols} pageSize={10} emptyText="لا توجد مستندات" emptyHint="أضف مستندًا من الزر أعلاه." />
          </SectionCard>
        </Grid>
      </Grid>
      <EvaluationCard soldierId={soldier.id} />
      <PersonnelRecords key={soldier.id} soldierId={soldier.id} archived={soldier.archived} />
      <SectionCard title="صور العسكري" subtitle="PNG أو JPEG">
        <PhotoSlots saved={saved.data} pending={pending} onPick={pick} onClear={(k) => setPending((p) => { const n = { ...p }; delete n[k]; return n; })} />
        <Stack direction="row" sx={{ mt: 2 }}>
          <Button variant="contained" disabled={!Object.keys(pending).length} loading={busy} onClick={savePhotos}>حفظ الصور المختارة</Button>
        </Stack>
      </SectionCard>
      <SoldierQrDialog soldier={qr ? soldier : null} onClose={() => setQr(false)} />
      <ConfirmDialog open={confirm} title={soldier.archived ? 'إلغاء أرشفة الملف' : 'أرشفة الملف'} loading={busy} onConfirm={archive} onClose={() => setConfirm(false)}
        message={soldier.archived ? 'سيعود الملف إلى قائمة النشطين.' : 'سيختفي الملف من القوائم النشطة ويمكن للمسؤول استرجاعه. يجب أن يكون العسكري داخل الوحدة.'} />
    </>
  );
}
