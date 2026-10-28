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
import { RhfSelect, RhfText } from '@/components/Fields';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';
import { DATE_DETAIL_KEYS, DETAIL_FIELDS, NUMBER_DETAIL_KEYS, parseDetails } from '@/lib/soldierProfile';
import { PhotoSlots, useSavedPhotos, type PendingPhotos } from './shared';

const detailShape = Object.fromEntries(Object.entries(DETAIL_FIELDS).map(([key, label]) => [key, z.string().trim().min(1, `${label} مطلوب`).max(['weaponNo', 'cardNo'].includes(key) ? 40 : 200).superRefine((value, ctx) => {
  if (!value) return;
  if (DATE_DETAIL_KEYS.includes(key) && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) ctx.addIssue({ code: 'custom', message: 'أدخل تاريخًا صحيحًا' });
  if (NUMBER_DETAIL_KEYS.includes(key) && !(Number(value) > 0 && Number(value) < (key === 'age' ? 120 : 1000) && (key !== 'age' || Number.isInteger(Number(value))))) ctx.addIssue({ code: 'custom', message: key === 'age' ? 'أدخل عمرًا صحيحًا من 1 إلى 119' : 'أدخل قياسًا موجبًا أقل من 1000' });
})]));
const schema = z.object({
  name: z.string().trim().min(1, 'الاسم مطلوب').max(200),
  militaryNo: z.string().trim().regex(/^\d{6,30}$/, 'الرقم العسكري من 6 إلى 30 رقمًا'),
  nationalId: z.string().trim().regex(/^\d{14}$/, 'الرقم القومي 14 رقمًا'),
  rank: z.string().trim().min(1, 'الدرجة مطلوبة'),
  militaryRank: z.string().trim().min(1, 'الرتبة مطلوبة'),
  company: z.string().trim().min(1, 'السرية مطلوبة'),
  unit: z.string().trim().min(1, 'الوحدة مطلوبة'),
  subUnit: z.string().trim().max(100),
  phone: z.string().trim().min(1, 'رقم الهاتف مطلوب').max(30),
  address: z.string().trim().min(1, 'العنوان المدني مطلوب').max(500),
  ...detailShape,
});
type Values = z.infer<typeof schema>;

/** Options from the Settings list; a stored value that was later removed from the list stays selectable. */
const choices = (list: string[] = [], current?: string) =>
  [...list, ...(current && !list.includes(current) ? [current] : [])].map((value) => ({ value, label: value }));

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
      rank: soldier?.rank ?? '', militaryRank: soldier?.military_rank ?? '',
      company: soldier?.company ?? '', unit: soldier?.unit ?? catalog.data?.settings.unitName ?? '', subUnit: soldier?.sub_unit ?? '',
      phone: soldier?.phone ?? '', address: soldier?.address ?? '',
      ...Object.fromEntries(Object.keys(DETAIL_FIELDS).map((k) => [k, d[k as keyof SoldierDetails] ?? ''])),
    },
  });

  const pick = async (kind: AttachmentKind) => {
    try {
      const file = await unwrap(bridge().pickAttachment());
      if (!file) return;
      if (!['image/png', 'image/jpeg'].includes(file.mime)) return notify.error('اختر PNG أو JPEG');
      const bytes = Math.floor(file.content.length * 3 / 4) - (file.content.endsWith('==') ? 2 : file.content.endsWith('=') ? 1 : 0);
      if (bytes > 5 * 1024 * 1024) return notify.error('الصورة أكبر من 5 ميجابايت؛ اختر صورة أصغر');
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
      name: core.name, militaryNo: core.militaryNo, nationalId: core.nationalId, rank: core.rank, militaryRank: core.militaryRank,
      company: core.company, unit: core.unit, subUnit: core.subUnit,
      phone, address, details,
      photos: Object.entries(pending).filter(([, file]) => Boolean(file)).map(([kind, file]) => ({ ...file, kind })),
      ...(soldier ? { id: soldier.id, version: soldier.version } : {}),
    };
    const key = JSON.stringify(body);
    if (requestId.current?.key !== key) requestId.current = { key, id: crypto.randomUUID() };
    try {
      const result = await post<{ id: string }>(soldier ? '/api/soldier/update' : '/api/soldiers', body, requestId.current.id);
      const soldierId = soldier ? soldier.id : result.id;
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
      <PageHeader title={soldier ? 'تعديل بيانات العسكري' : 'إضافة عسكري'} description="جميع البيانات والصور الأربع إلزامية. البيانات والصور تُحفظ معًا بعد اكتمال الملف." />
      <SectionCard title="البيانات الأساسية">
        <Grid container spacing={2}>
          {([['name', 'الاسم الرباعي'], ['militaryNo', 'الرقم العسكري'], ['nationalId', 'الرقم القومي']] as const).map(([n, l]) => (
            <Grid key={n} size={{ xs: 12, sm: 6, md: 4 }}><RhfText required control={control} name={n} label={l} slotProps={{ htmlInput: { dir: n === 'name' ? undefined : 'ltr' } }} /></Grid>
          ))}
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <RhfSelect required control={control} name="rank" label="الدرجة" options={choices(catalog.data?.soldierGrades, soldier?.rank)} helperText="تُضاف الدرجات من الإعدادات" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <RhfSelect required control={control} name="militaryRank" label="الرتبة" options={choices(catalog.data?.soldierRanks, soldier?.military_rank)} helperText="تُضاف الرتب من الإعدادات" />
          </Grid>
          {([['company', 'السرية'], ['unit', 'الوحدة']] as const).map(([n, l]) => (
            <Grid key={n} size={{ xs: 12, sm: 6, md: 4 }}><RhfText required control={control} name={n} label={l} /></Grid>
          ))}
          <Grid size={{ xs: 12, sm: 6, md: 4 }}><RhfText control={control} name="subUnit" label="الوحدة الفرعية" /></Grid>
          {([['phone', 'رقم الهاتف'], ['address', 'العنوان المدني']] as const).map(([n, l]) => (
            <Grid key={n} size={{ xs: 12, sm: 6, md: 4 }}><RhfText required control={control} name={n} label={l} slotProps={{ htmlInput: { dir: n === 'phone' ? 'ltr' : undefined } }} /></Grid>
          ))}
        </Grid>
      </SectionCard>
      <SectionCard title="بيانات العسكري التفصيلية — مطلوبة">
        <Grid container spacing={2}>
          {Object.entries(DETAIL_FIELDS).map(([k, label]) => (
            <Grid key={k} size={{ xs: 12, sm: 6, md: 4 }}>
              <RhfText required control={control} name={k as keyof Values & string} label={label} type={DATE_DETAIL_KEYS.includes(k) ? 'date' : NUMBER_DETAIL_KEYS.includes(k) ? 'number' : 'text'} />
            </Grid>
          ))}
        </Grid>
      </SectionCard>
      <SectionCard title="صور العسكري — اختيارية" subtitle="صورة 4×6، البطاقة، وجه الكارنيه وظهره. PNG أو JPEG بحد أقصى 5 ميجابايت للصورة؛ الصور المحفوظة سابقًا لا تحتاج إعادة رفع.">
        <PhotoSlots saved={saved.data} pending={pending} onPick={pick} onClear={(k) => setPending((p) => { const n = { ...p }; delete n[k]; return n; })} />
      </SectionCard>
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" size="large" loading={formState.isSubmitting}>حفظ العسكري</Button>
        <Button variant="tonal" size="large" onClick={() => navigate('/soldiers')}>إلغاء</Button>
      </Stack>
    </Box>
  );
}
