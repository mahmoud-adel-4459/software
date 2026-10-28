import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '@/api/endpoints';
import { DetailList, SectionCard } from '@/components/basic';
import { useCatalog } from '@/lib/queries';
import { useIdempotentPost } from '@/lib/useIdempotentPost';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notify';

interface Movement {
  cardNo: number; action: 'in' | 'out'; visitId?: string;
  name: string; nationalId: string; phone: string; organization: string;
  categoryId: string; purpose: string; notes: string;
}

/** A reusable card keeps the current visit visible and asks for fresh details after checkout. */
export function VisitorCardPanel({ cardNo, onClear }: { cardNo: number; onClear: () => void }) {
  const queryClient = useQueryClient();
  const card = useQuery({ queryKey: ['visitor-card', cardNo], queryFn: () => api.visitorCard(cardNo), staleTime: 0, retry: false });
  const catalog = useCatalog();
  const [fields, setFields] = useState({ name: '', nationalId: '', phone: '', organization: '', categoryId: '', purpose: '', notes: '' });
  const move = useIdempotentPost<Movement>('/api/gate/visitor-card', {
    onSuccess: async (_result, vars) => {
      notify.success(vars.action === 'in' ? 'تم تسجيل دخول الزائر' : 'تم تسجيل الخروج وأصبحت البطاقة متاحة');
      await Promise.all(['visitor-card', 'visitor-cards', 'visitor-visits', 'visitors', 'report', 'daily-report', 'dashboard'].map(key =>
        queryClient.invalidateQueries({ queryKey: [key] })));
      onClear();
    },
    onError: notify.apiError,
  });
  const open = card.data?.openVisit;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!card.data) return;
    const nationalId = fields.nationalId.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    move.mutate({ ...fields, nationalId, cardNo, action: open ? 'out' : 'in', visitId: open?.id });
  };
  const input = (key: keyof typeof fields, label: string, required = false, maxLength = 200) => (
    <TextField key={key} label={label} value={fields[key]} required={required}
      onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))}
      slotProps={{ htmlInput: { maxLength } }} disabled={move.isPending} />
  );
  return (
    <SectionCard title={`بطاقة زائر رقم ${cardNo}`} subtitle="البطاقة تستخدم لزائر جديد بعد تسجيل الخروج">
      <Button onClick={onClear} disabled={move.isPending} sx={{ mb: 2 }}>مسح آخر</Button>
      {card.isPending && <Skeleton variant="rounded" height={220} />}
      {card.isError && <Alert severity="error" action={<Button onClick={() => card.refetch()}>إعادة المحاولة</Button>}>{card.error.message}</Alert>}
      {card.data && (
        <Stack component="form" onSubmit={submit} spacing={2} sx={{ maxWidth: 600 }}>
          {open ? <>
            <Alert severity="info">البطاقة مستخدمة — تأكد من بيانات الزائر قبل تسجيل خروجه</Alert>
            <DetailList rows={[
              { label: 'الاسم', value: open.visitor.name },
              { label: 'الرقم القومي', value: open.visitor.national_id || '—' },
              { label: 'الهاتف', value: open.visitor.phone || '—' },
              { label: 'الجهة', value: open.visitor.organization || '—' },
              { label: 'الفئة', value: open.visitor.category.name },
              { label: 'سبب الزيارة', value: open.purpose },
              { label: 'وقت الدخول', value: formatDateTime(open.check_in) },
              { label: 'ملاحظات الدخول', value: open.visitor.notes || '—' },
            ]} />
            {input('notes', 'ملاحظات الخروج (اختياري)', false, 1000)}
          </> : <>
            <Alert severity="success">البطاقة متاحة — اكتب بيانات الزائر الجديد</Alert>
            {input('name', 'اسم الزائر', true)}
            {input('nationalId', 'الرقم القومي (اختياري)', false, 14)}
            {input('phone', 'رقم الهاتف (اختياري)', false, 30)}
            {input('organization', 'الجهة (اختياري)')}
            <TextField select label="فئة الزائر" value={fields.categoryId} required disabled={move.isPending}
              onChange={event => setFields(previous => ({ ...previous, categoryId: event.target.value }))}>
              {(catalog.data?.visitorCategories ?? []).filter(c => !c.disabled).map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            {catalog.isError && <Alert severity="error">تعذر تحميل فئات الزوار <Button onClick={() => catalog.refetch()}>إعادة المحاولة</Button></Alert>}
            {input('purpose', 'سبب الزيارة', true, 500)}
            {input('notes', 'ملاحظات (اختياري)', false, 1000)}
          </>}
          <Button type="submit" variant="contained" size="large" loading={move.isPending}
            disabled={!open && !fields.categoryId}>{open ? 'تسجيل خروج الزائر وإتاحة البطاقة' : 'تسجيل دخول الزائر'}</Button>
        </Stack>
      )}
    </SectionCard>
  );
}
