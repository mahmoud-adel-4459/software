import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { api } from '@/api/endpoints';
import { bridge, post, unwrap } from '@/api/client';
import type { AttachmentKind, Soldier, SoldierDetails } from '@/api/types';
import { PageHeader, SectionCard } from '@/components/basic';
import { RhfText } from '@/components/Fields';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';
import { DATE_DETAIL_KEYS, DETAIL_FIELDS, NUMBER_DETAIL_KEYS, parseDetails } from '@/lib/soldierProfile';
import { PhotoSlots, useSavedPhotos, type PendingPhotos } from './shared';

const detailShape = Object.fromEntries(Object.keys(DETAIL_FIELDS).map((k) => [k, z.string().optional()]));
const schema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب').max(200),
  militaryNo: z.string().trim().regex(/^\d{6,30}$/, 'الرقم العسكري من 6 إلى 30 رقمًا'),
  nationalId: z.string().trim().regex(/^\d{14}$/, 'الرقم القومي 14 رقمًا'),
  rank: z.string().trim().min(1, 'الدرجة مطلوبة'),
  company: z.string().trim().min(1, 'السرية مطلوبة'),
  unit: z.string().trim().min(1, 'الوحدة مطلوبة'),
  phone: z.string().optional(),
  address: z.string().optional(),
  ...detailShape,
});
type Values = z.infer<typeof schema>;

/** Add (no :id) or edit a soldier; pending photos upload after the file is saved. */
export function SoldierFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const record = useQuery({ queryKey: ['soldier', id], queryFn: () => api.soldier(id!), enabled: editing });
  const catalog = useCatalog();
  if ((editing && !record.data) || !catalog.data) return <Skeleton variant="rounded" height={400} />;
  return <SoldierForm key={id ?? 'new'} soldier={record.data?.soldier} attachments={record.data?.attachments} />;
}

function SoldierForm({ soldier, attachments }: { soldier?: Soldier; attachments?: import('@/api/types').AttachmentMeta[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const saved = useSavedPhotos(attachments);
  const [pending, setPending] = useState<PendingPhotos>({});
  const requestId = useRef<{ key: string; id: string } | null>(null);
  const d = parseDetails(soldier?.details);
  const { control, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: soldier?.name ?? '', militaryNo: soldier?.military_no ?? '', nationalId: soldier?.national_id ?? '',
      rank: soldier?.rank ?? 'جندي', company: soldier?.company ?? '', unit: soldier?.unit ?? catalog.data?.settings.unitName ?? '',
      phone: soldier?.phone ?? '', address: soldier?.address ?? '',
      ...Object.fromEntries(Object.keys(DETAIL_FIELDS).map((k) => [k, d[k as keyof SoldierDetails] ?? ''])),
    },
  });

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

  const submit = handleSubmit(async (values) => {
    const details: Record<string, string> = {};
    for (const k of Object.keys(DETAIL_FIELDS)) {
      details[k] = String((values as Record<string, unknown>)[k] ?? '');
    }
    const { phone, address, ...core } = values;
    const body = {
      name: core.name, militaryNo: core.militaryNo, nationalId: core.nationalId, rank: core.rank, company: core.company, unit: core.unit,
      phone: phone ?? '', address: address ?? '', details,
      ...(soldier ? { id: soldier.id, version: soldier.version } : {}),
    };
    const key = JSON.stringify(body);
    if (requestId.current?.key !== key) requestId.current = { key, id: crypto.randomUUID() };
    try {
      const result = await post<{ id: string }>(soldier ? '/api/soldier/update' : '/api/soldiers', body, requestId.current.id);
      const soldierId = soldier ? soldier.id : result.id;
      for (const [kind, file] of Object.entries(pending)) {
        if (file) await post('/api/attachments', { ...file, kind, soldierId }, crypto.randomUUID());
      }
      requestId.current = null;
      await queryClient.invalidateQueries({ queryKey: ['soldiers'] });
      await queryClient.invalidateQueries({ queryKey: ['soldier', soldierId] });
      notify.success(soldier ? 'تم حفظ العسكري' : 'تم حفظ العسكري — اطبع QR من قائمة الإجراءات');
      navigate('/soldiers');
    } catch (e) {
      notify.apiError(e);
    }
  });

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <PageHeader title={soldier ? 'تعديل بيانات العسكري' : 'إضافة عسكري'} description="الحقول الإلزامية محددة؛ التفاصيل الإضافية اختيارية." />
      <SectionCard title="البيانات الأساسية">
        <Grid container spacing={2}>
          {([['name', 'الاسم الرباعي'], ['militaryNo', 'الرقم العسكري'], ['nationalId', 'الرقم القومي'], ['rank', 'الدرجة'], ['company', 'السرية'], ['unit', 'الوحدة'], ['phone', 'رقم الهاتف'], ['address', 'العنوان المدني']] as const).map(([n, l]) => (
            <Grid key={n} size={{ xs: 12, sm: 6, md: 4 }}><RhfText control={control} name={n} label={l} slotProps={{ htmlInput: { dir: n === 'militaryNo' || n === 'nationalId' || n === 'phone' ? 'ltr' : undefined } }} /></Grid>
          ))}
        </Grid>
      </SectionCard>
      <SectionCard title="تفاصيل إضافية">
        <Grid container spacing={2}>
          {Object.entries(DETAIL_FIELDS).map(([k, label]) => (
            <Grid key={k} size={{ xs: 12, sm: 6, md: 4 }}>
              <RhfText control={control} name={k as keyof Values & string} label={label} type={DATE_DETAIL_KEYS.includes(k) ? 'date' : NUMBER_DETAIL_KEYS.includes(k) ? 'number' : 'text'} />
            </Grid>
          ))}
        </Grid>
      </SectionCard>
      <SectionCard title="صور العسكري" subtitle="PNG أو JPEG — تُرفع عند الحفظ أو لاحقًا من ملف العسكري.">
        <PhotoSlots saved={saved.data} pending={pending} onPick={pick} onClear={(k) => setPending((p) => { const n = { ...p }; delete n[k]; return n; })} />
      </SectionCard>
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" size="large" loading={formState.isSubmitting}>حفظ العسكري</Button>
        <Button variant="tonal" size="large" onClick={() => navigate('/soldiers')}>إلغاء</Button>
      </Stack>
    </Box>
  );
}
