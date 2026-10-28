import EnterIcon from '@mui/icons-material/LoginOutlined';
import ExitIcon from '@mui/icons-material/LogoutOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '@/api/endpoints';
import type { VisitorPass } from '@/api/types';
import { SectionCard } from '@/components/basic';
import { notify } from '@/lib/notify';
import { useIdempotentPost } from '@/lib/useIdempotentPost';
import { PassDetails, PassStatusChip } from './shared';

/** Why a scanned pass cannot move the visitor right now (null = it can). */
function blocked(pass: VisitorPass): string | null {
  if (pass.status === 'pending') return 'الطلب لم يُعتمد من الوحدة بعد';
  if (pass.status === 'rejected') return `الوحدة رفضت دخول هذا الزائر${pass.decision_notes ? ` — ${pass.decision_notes}` : ''}`;
  if (pass.status === 'cancelled') return 'هذا التصريح ملغى';
  if (pass.status === 'completed') return 'التصريح استُخدم بالكامل (دخل الزائر وخرج)';
  if (pass.status === 'approved' && pass.expired) return 'انتهت صلاحية التصريح؛ أرسل طلبًا جديدًا للوحدة';
  return null;
}

/** Gate: a printed visitor pass was scanned — admit (first scan) or release (second scan). */
export function VisitorPassPanel({ id, onClear }: { id: string; onClear: () => void }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['visitor-pass', id], queryFn: () => api.visitorPass(id), retry: false, staleTime: 0 });
  const [notes, setNotes] = useState('');
  const move = useIdempotentPost<{ id: string; action: 'in' | 'out'; notes: string }>('/api/gate/visitor-pass', {
    onSuccess: async (_r, vars) => {
      notify.success(vars.action === 'in' ? 'تم تسجيل دخول الزائر بالتصريح' : 'تم تسجيل خروج الزائر');
      await Promise.all(['visitor-pass', 'visitor-passes', 'visitors', 'reports', 'daily-report', 'dashboard'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] })));
      onClear();
    },
    onError: notify.apiError,
  });
  const pass = q.data;
  const action = pass?.status === 'inside' ? 'out' : 'in';
  const reason = pass && blocked(pass);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pass && !reason) move.mutate({ id: pass.id, action, notes: action === 'out' ? notes : '' });
  };
  return (
    <SectionCard title={pass ? `تصريح زائر رقم ${pass.no}` : 'تصريح زائر'} action={pass && <PassStatusChip pass={pass} />}>
      <Button onClick={onClear} disabled={move.isPending} sx={{ mb: 2 }}>مسح آخر</Button>
      {q.isPending && <Skeleton variant="rounded" height={220} />}
      {q.isError && <Alert severity="error">{q.error.message}</Alert>}
      {pass && (
        <Stack component="form" onSubmit={submit} spacing={2} sx={{ maxWidth: 640 }}>
          {reason ? <Alert severity="error">{reason}</Alert>
            : <Alert severity={action === 'in' ? 'success' : 'warning'}>
              {action === 'in' ? 'تصريح معتمد من الوحدة — طابق بيانات الزائر ثم سجّل الدخول' : 'الزائر داخل الوحدة — سجّل خروجه'}
            </Alert>}
          <PassDetails pass={pass} />
          {!reason && action === 'out' && (
            <TextField label="ملاحظات الخروج (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
          )}
          {!reason && (
            <Button type="submit" variant="contained" size="large" color={action === 'in' ? 'success' : 'primary'} autoFocus
              startIcon={action === 'in' ? <EnterIcon /> : <ExitIcon />} loading={move.isPending}>
              {action === 'in' ? 'تسجيل دخول الزائر' : 'تسجيل خروج الزائر'}
            </Button>
          )}
        </Stack>
      )}
    </SectionCard>
  );
}
