import BellIcon from '@mui/icons-material/NotificationsActiveOutlined';
import Chip from '@mui/material/Chip';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/endpoints';
import type { Session, VisitorPass, VisitorPassStatus } from '@/api/types';
import { canOpen } from '@/auth/nav';
import { DetailList } from '@/components/basic';
import { ToneChip, type ChipTone } from '@/components/interactive';
import { formatDateTime } from '@/lib/format';
import { notify } from '@/lib/notify';
import { tokens } from '@/theme/tokens';

export const PASS_STATUS: Record<VisitorPassStatus, { label: string; tone: ChipTone }> = {
  pending: { label: 'بانتظار الوحدة', tone: 'warning' },
  approved: { label: 'معتمد — التصريح طُبع', tone: 'info' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  cancelled: { label: 'ملغى', tone: 'neutral' },
  inside: { label: 'داخل الوحدة', tone: 'success' },
  completed: { label: 'خرج', tone: 'neutral' },
};

export function PassStatusChip({ pass }: { pass: Pick<VisitorPass, 'status' | 'expired'> }) {
  if (pass.status === 'approved' && pass.expired) return <ToneChip tone="neutral" label="انتهت صلاحيته" />;
  const s = PASS_STATUS[pass.status];
  return <ToneChip tone={s.tone} label={s.label} />;
}

export function PassDetails({ pass }: { pass: VisitorPass }) {
  return (
    <DetailList rows={[
      { label: 'الاسم', value: <b>{pass.name}</b> },
      { label: 'الرقم القومي', value: pass.national_id || '—' },
      { label: 'الهاتف', value: pass.phone || '—' },
      { label: 'الجهة', value: pass.organization || '—' },
      { label: 'الفئة', value: pass.category_name },
      { label: 'الجهة المقصودة', value: pass.host || '—' },
      { label: 'سبب الزيارة', value: pass.purpose },
      { label: 'وقت الطلب', value: `${formatDateTime(pass.requested_at)} · ${pass.requested_by_name}` },
      ...(pass.decided_at ? [{ label: 'قرار الوحدة', value: `${formatDateTime(pass.decided_at)} · ${pass.decided_by_name}` }] : []),
      ...(pass.decision_notes ? [{ label: 'ملاحظات الوحدة', value: pass.decision_notes }] : []),
      ...(pass.check_in ? [{ label: 'وقت الدخول', value: formatDateTime(pass.check_in) }] : []),
      ...(pass.check_out ? [{ label: 'وقت الخروج', value: formatDateTime(pass.check_out) }] : []),
    ]} />
  );
}

/** Live list shared by the gate and the unit (both screens poll the same server). */
export const useVisitorPasses = (enabled = true) =>
  useQuery({ queryKey: ['visitor-passes'], queryFn: api.visitorPasses, enabled, refetchInterval: 5_000, refetchOnWindowFocus: true });

/**
 * Header alert: the unit gets a toast and a counter for every new gate request; the gate gets a
 * toast when the unit approves or rejects one of the open requests.
 */
export function VisitorPassAlert({ session }: { session: Session | null }) {
  const navigate = useNavigate();
  const unit = canOpen(session, '/visitor-passes');
  const gate = canOpen(session, '/gate/visitors');
  const passes = useVisitorPasses(unit || gate);
  const seen = useRef<Map<string, VisitorPassStatus> | null>(null);
  useEffect(() => {
    if (!passes.data) return;
    const previous = seen.current;
    seen.current = new Map(passes.data.map((p) => [p.id, p.status]));
    if (!previous) return; // first load: no alerts for what was already there
    for (const p of passes.data) {
      const before = previous.get(p.id);
      if (unit && p.status === 'pending' && !before) notify.info(`طلب زائر جديد من البوابة #${p.no}: ${p.name}`);
      if (gate && before === 'pending' && p.status === 'approved') notify.success(`اعتمدت الوحدة دخول ${p.name} (#${p.no}) — انتظر التصريح المطبوع`);
      if (gate && before === 'pending' && p.status === 'rejected') notify.error(`رفضت الوحدة دخول ${p.name} (#${p.no})`);
    }
  }, [passes.data, unit, gate]);
  if (!unit) return null;
  const pending = passes.data?.filter((p) => p.status === 'pending').length ?? 0;
  if (!pending) return null;
  return (
    <Chip icon={<BellIcon style={{ color: tokens.amberInk }} />} label={`طلبات زوار: ${pending}`} onClick={() => navigate('/visitor-passes')}
      sx={{ bgcolor: tokens.amberSoft, color: tokens.amberInk, fontWeight: 700 }} />
  );
}
