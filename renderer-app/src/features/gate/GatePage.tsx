import CheckIcon from '@mui/icons-material/CheckCircleOutlined';
import QrIcon from '@mui/icons-material/QrCodeScannerOutlined';
import ExitIcon from '@mui/icons-material/LogoutOutlined';
import EnterIcon from '@mui/icons-material/LoginOutlined';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { VisitorCardPanel } from './VisitorCardPanel';
import { api } from '@/api/endpoints';
import type { GateMovementResult, Permit, Soldier } from '@/api/types';
import { DetailList, KpiCard, SectionCard } from '@/components/basic';
import { DocButtons } from '@/components/DocButtons';
import { SoldierStatusChip, ToneChip } from '@/components/interactive';
import { formatDateTime, formatNumber } from '@/lib/format';
import { notify } from '@/lib/notify';
import { usePermits, useCatalog, useSummary } from '@/lib/queries';
import { useIdempotentPost } from '@/lib/useIdempotentPost';
import { gateProfileRows, parseGateScan, PHOTO_KINDS } from '@/lib/soldierProfile';
import { TIER_LABELS } from '@/lib/format';
import { toneColors, tokens } from '@/theme/tokens';

type Target = { kind: 'soldier'; militaryNo: string } | { kind: 'visitor'; id: string } | { kind: 'visitor-card'; cardNo: number } | null;

/** Gate POS: large scan field (always focused), soldier/visitor panels and exit/entry forms. */
export function GatePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCard = Number(searchParams.get('card'));
  const [target, setTarget] = useState<Target>(() => Number.isInteger(selectedCard) && selectedCard >= 1 && selectedCard <= 24
    ? { kind: 'visitor-card', cardNo: selectedCard } : null);
  const clearTarget = () => { setTarget(null); setSearchParams({}, { replace: true }); };
  const [lastPermit, setLastPermit] = useState<GateMovementResult | null>(null);
  const summary = useSummary();
  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, mb: 3 }}>
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 700, color: tokens.primary }}>محطة البوابة · POS</Typography>
          <Typography variant="h2" component="h1">بوابة الخروج والدخول</Typography>
        </Box>
        <Stack direction="row" spacing={2} sx={{ minWidth: { md: 360 } }}>
          <Box sx={{ flex: 1 }}><KpiCard label="خارج الوحدة" value={formatNumber(summary.data?.outside)} tone="amber" live loading={summary.isPending} /></Box>
          <Box sx={{ flex: 1 }}><KpiCard label="متأخرون" value={formatNumber(summary.data?.late)} tone="red" loading={summary.isPending} /></Box>
        </Stack>
      </Stack>
      {lastPermit && (
        <Alert icon={<CheckIcon />} severity="success" sx={{ mb: 2, alignItems: 'center' }} action={<DocButtons doc={{ type: 'voucher', id: lastPermit.id }} />} onClose={() => setLastPermit(null)}>
          <b>آخر إذن #{String(lastPermit.no ?? '')}</b> — {lastPermit.returned_at ? 'تم تسجيل الدخول على الإذن' : 'تم إصدار إذن الخروج'}
        </Alert>
      )}
      {!target && <ScanPanel onScan={setTarget} />}
      {target?.kind === 'visitor-card' && <VisitorCardPanel key={target.cardNo} cardNo={target.cardNo} onClear={clearTarget} />}
      {target?.kind === 'soldier' && <SoldierPanel militaryNo={target.militaryNo} onClear={() => setTarget(null)} onPermit={setLastPermit} />}
      {target?.kind === 'visitor' && <VisitorPanel id={target.id} onClear={() => setTarget(null)} />}
    </Box>
  );
}

/** Idle state: keeps the scan field focused so USB (keyboard-wedge) scanners never lose keystrokes. */
function ScanPanel({ onScan }: { onScan: (t: Target) => void }) {
  const catalog = useCatalog();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  useEffect(() => {
    ref.current?.focus();
    const refocus = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      ref.current?.focus();
    };
    document.addEventListener('keydown', refocus);
    return () => document.removeEventListener('keydown', refocus);
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const scan = parseGateScan(value);
    if (scan.kind === 'none' || (scan.kind === 'soldier' && !scan.militaryNo)) return notify.error('امسح QR أو أدخل رقمًا صالحًا');
    onScan(scan);
    setValue('');
  };
  return (
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, lg: 8 }}>
        <Card component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 } }}>
          <Stack spacing={3} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 96, height: 96, borderRadius: `${tokens.radius}px`, bgcolor: tokens.primaryLight, color: tokens.primary, display: 'grid', placeItems: 'center', border: `2px dashed ${tokens.primary}` }}>
              <QrIcon sx={{ fontSize: 52 }} />
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h3">امسح بطاقة العسكري أو الزائر</Typography>
              <Typography color="text.secondary"><span className="live-pulse-dot" style={{ background: tokens.green, marginInlineEnd: 8 }} />المحطة جاهزة — قارئ USB يملأ الحقل تلقائيًا</Typography>
            </Box>
            <TextField
              inputRef={ref}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              label="الرقم العسكري"
              placeholder="000000000"
              autoComplete="off"
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 200, 'aria-label': 'الرقم العسكري', dir: 'ltr', style: { fontSize: 28, textAlign: 'center', letterSpacing: 2 } } }}
              sx={{ maxWidth: 520 }}
            />
            <Button type="submit" variant="contained" size="large" sx={{ minWidth: 280 }}>التعرف على العسكري</Button>
          </Stack>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <SectionCard title="خطوات التشغيل">
          <Stack component="ol" spacing={1} sx={{ m: 0, pl: 0, pr: 2.5 }}>
            <li>مسح أو إدخال الرقم</li>
            <li>مراجعة البيانات</li>
            <li>تأكيد الخروج أو الدخول</li>
          </Stack>
          <Typography variant="caption" sx={{ mt: 2, display: 'block' }}>
            {catalog.data?.exitReasons.length ?? '—'} سبب خروج · مسح عسكري أو زائر (QR) · Enter للتأكيد
          </Typography>
        </SectionCard>
      </Grid>
    </Grid>
  );
}

function Banner({ title, sub, tone }: { title: string; sub: string; tone: 'exit' | 'entry' }) {
  const c = tone === 'exit' ? toneColors.amber : toneColors.green;
  return (
    <Box role="status" aria-live="polite" sx={{ p: 2, mb: 2, borderRadius: `${tokens.radius}px`, bgcolor: c.soft, color: c.ink, borderInlineStart: `6px solid ${c.main}` }}>
      <Typography variant="caption" sx={{ color: c.ink, fontWeight: 700 }}>بعد المسح — الحركة المطلوبة</Typography>
      <Typography variant="h3" sx={{ color: c.ink }}>{title}</Typography>
      <Typography variant="body2">{sub}</Typography>
    </Box>
  );
}

/** Soldier summary strip with photo and status. */
function SoldierStrip({ soldier, photo, onClear }: { soldier: Soldier; photo?: string; onClear: () => void }) {
  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <Avatar src={photo} sx={{ width: 84, height: 84, bgcolor: tokens.ice }} variant="rounded" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h3">{soldier.name}</Typography>
          <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', gap: 1, color: tokens.textSecondary }}>
            <span>الرقم <b className="num" style={{ color: tokens.text, fontSize: 18 }}>{soldier.military_no}</b></span>
            <span>الدرجة <b>{soldier.rank}</b></span>
            {soldier.military_rank && <span>الرتبة <b>{soldier.military_rank}</b></span>}
            <span>السرية <b>{soldier.company}</b></span>
            <span>الوحدة <b>{soldier.unit}</b></span>
            {soldier.sub_unit && <span>الوحدة الفرعية <b>{soldier.sub_unit}</b></span>}
          </Stack>
        </Box>
        <Stack spacing={1} sx={{ alignItems: 'flex-end' }}>
          <SoldierStatusChip status={soldier.status} />
          <Button variant="tonal" onClick={onClear}>عسكري آخر</Button>
        </Stack>
      </Stack>
    </Card>
  );
}

function PhotosPanel({ photos }: { photos: Record<string, string> }) {
  return (
    <SectionCard title="صور العسكري">
      <Grid container spacing={1.5}>
        {PHOTO_KINDS.map(([kind, label]) => (
          <Grid key={kind} size={{ xs: 6, md: 3 }}>
            <Typography variant="caption">{label}</Typography>
            <Box sx={{ height: 140, mt: 0.5, borderRadius: `${tokens.radius}px`, bgcolor: tokens.ice100, border: `1px solid ${tokens.border}`, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
              {photos[kind] ? <img src={photos[kind]} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <Typography color="text.secondary">—</Typography>}
            </Box>
          </Grid>
        ))}
      </Grid>
    </SectionCard>
  );
}

function SoldierPanel({ militaryNo, onClear, onPermit }: { militaryNo: string; onClear: () => void; onPermit: (r: GateMovementResult) => void }) {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const permits = usePermits();
  const profile = useQuery({ queryKey: ['gate-soldier', militaryNo], queryFn: () => api.gateSoldier(militaryNo), retry: false, staleTime: 0 });
  const photos = useQuery({
    queryKey: ['gate-photos', profile.data?.photos.map((p) => p.id).join(',')],
    enabled: Boolean(profile.data?.photos.length),
    queryFn: async () => {
      const out: Record<string, string> = {};
      await Promise.all((profile.data?.photos ?? []).map(async (p) => {
        const file = await api.attachment(p.id);
        out[p.kind] = `data:${file.mime};base64,${file.content}`;
      }));
      return out;
    },
  });
  useEffect(() => {
    if (profile.isError) {
      notify.apiError(profile.error);
      onClear();
    }
  }, [profile.isError, profile.error, onClear]);

  const soldier = profile.data?.soldier;
  const active: Permit | undefined = soldier ? permits.data?.find((p) => p.soldier_id === soldier.id && !p.returned_at && !p.voided) : undefined;
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [notes, setNotes] = useState('');

  const move = useIdempotentPost<{ soldierId: string; kind: 'exit' | 'entry'; notes: string; reason?: string; expectedReturn?: string }, GateMovementResult>('/api/gate', {
    onSuccess: async (result, vars) => {
      onPermit(result);
      setReason('');
      setReturnDate('');
      setReturnTime('');
      setNotes('');
      notify.success(vars.kind === 'exit' ? 'تم تسجيل الخروج — يمكن تسجيل العودة أو خروج جديد لاحقًا' : 'تم تسجيل الدخول — يمكن تسجيل خروج جديد');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gate-soldier', militaryNo] }),
        queryClient.invalidateQueries({ queryKey: ['permits'] }),
        queryClient.invalidateQueries({ queryKey: ['summary'] }),
      ]);
    },
    onError: notify.apiError,
  });

  if (!soldier) return <Skeleton variant="rounded" height={220} />;
  const photoMap = photos.data ?? {};
  const inside = soldier.status === 'in';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (inside) {
      if (!reason || !returnDate || !returnTime) return notify.error('اختر سبب الخروج ويوم ووقت العودة');
      move.mutate({ soldierId: soldier.id, kind: 'exit', reason, notes, expectedReturn: new Date(`${returnDate}T${returnTime}`).toISOString() });
    } else move.mutate({ soldierId: soldier.id, kind: 'entry', notes });
  };

  return (
    <Box>
      <SoldierStrip soldier={soldier} photo={photoMap.photo} onClear={onClear} />
      {inside ? (
        <Banner tone="exit" title="إذن خروج" sub="العسكري داخل الوحدة — أصدر تصريح الخروج ثم أكّد" />
      ) : (
        <Banner tone="entry" title="إذن دخول" sub={active ? `إغلاق إذن الخروج #${active.no} — تسجيل العودة` : 'العسكري خارج الوحدة — سجّل العودة'} />
      )}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 6 }}><SectionCard title="بيانات الدخول / الخروج"><DetailList rows={gateProfileRows(soldier)} /></SectionCard></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><PhotosPanel photos={photoMap} /></Grid>
      </Grid>
      {active && (
        <Alert severity="info" sx={{ mb: 2 }} action={<DocButtons doc={{ type: 'voucher', id: active.id }} />}>
          <b>تصريح نشط #{active.no}</b> · {active.reason} · العودة {formatDateTime(active.expected_return)}
        </Alert>
      )}
      <Box component="form" onSubmit={submit} aria-label={inside ? 'نموذج الخروج' : 'نموذج الدخول'}>
        {inside ? (
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <SectionCard title="سبب الخروج" subtitle="اختر بندًا واحدًا">
                {catalog.data?.exitReasons.length === 0 && <Alert severity="warning">لا توجد أسباب خروج؛ أضف الأسباب من الإعدادات أولًا.</Alert>}
                <Box role="radiogroup" aria-label="سبب الخروج" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 1 }}>
                  {(catalog.data?.exitReasons ?? []).map((r, i) => {
                    const on = reason === r;
                    return (
                      <Box key={r} component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25, cursor: 'pointer', borderRadius: `${tokens.radius}px`, border: `1.5px solid ${on ? tokens.primary : tokens.border}`, bgcolor: on ? tokens.primaryLight : tokens.surface, fontWeight: on ? 700 : 500, '&:hover': { borderColor: tokens.primary } }}>
                        <input type="radio" name="reason" value={r} checked={on} onChange={() => setReason(r)} style={{ accentColor: tokens.primary }} />
                        <Typography component="span" variant="caption" sx={{ color: tokens.textTertiary }}>{String(i + 1).padStart(2, '0')}</Typography>
                        {r}
                      </Box>
                    );
                  })}
                </Box>
              </SectionCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <SectionCard title="موعد العودة والتأكيد">
                <Stack spacing={2}>
                  <TextField label="يوم العودة" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
                  <TextField label="وقت العودة" type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
                  <TextField label="ملاحظات" helperText="تفاصيل الجهة أو سبب الخروج — حتى 1000 حرف" multiline minRows={3} value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
                  <Button type="submit" variant="contained" size="large" startIcon={<ExitIcon />} loading={move.isPending}>تأكيد الخروج وإصدار الإذن</Button>
                </Stack>
              </SectionCard>
            </Grid>
          </Grid>
        ) : (
          <SectionCard title="تسجيل دخول إلى الوحدة">
            {active && (
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <ToneChip tone="info" label={`إذن #${active.no}`} icon={false} />
                <ToneChip tone="neutral" label={active.reason} icon={false} />
                <ToneChip tone="warning" label={`العودة المتوقعة ${formatDateTime(active.expected_return)}`} icon={false} />
              </Stack>
            )}
            <Stack spacing={2} sx={{ maxWidth: 560 }}>
              <TextField label="ملاحظات (اختياري)" helperText="ملاحظات العودة لهذه الحركة — حتى 1000 حرف" multiline minRows={3} value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
              <Button type="submit" variant="contained" color="success" size="large" startIcon={<EnterIcon />} loading={move.isPending}>تسجيل العودة الآن</Button>
            </Stack>
          </SectionCard>
        )}
      </Box>
    </Box>
  );
}

function VisitorPanel({ id, onClear }: { id: string; onClear: () => void }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['gate-visitor', id], queryFn: () => api.gateVisitor(id), retry: false, staleTime: 0 });
  const [text, setText] = useState('');
  useEffect(() => {
    if (q.isError) {
      notify.apiError(q.error);
      onClear();
    }
  }, [q.isError, q.error, onClear]);
  const move = useIdempotentPost<{ visitorId: string; action: 'in' | 'out'; purpose: string; notes: string }>('/api/gate/visitor', {
    onSuccess: async (_r, vars) => {
      notify.success(vars.action === 'in' ? 'تم تسجيل دخول الزائر' : 'تم تسجيل خروج الزائر');
      setText('');
      await Promise.all(['gate-visitor', 'visitor-visits', 'report', 'daily-report', 'dashboard'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: notify.apiError,
  });
  if (!q.data) return <Skeleton variant="rounded" height={200} />;
  const { visitor, openVisit } = q.data;
  const action = openVisit ? 'out' : 'in';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (action === 'in' && !text.trim()) return notify.error('اكتب سبب الزيارة (جاي ليه)');
    move.mutate({ visitorId: visitor.id, action, purpose: action === 'in' ? text : '', notes: action === 'out' ? text : '' });
  };
  return (
    <Box>
      <Card sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h3">{visitor.name}</Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', color: tokens.textSecondary }}>
              <span>بطاقة <b className="num" style={{ color: tokens.text }}>{visitor.badge_no}</b></span>
              <ToneChip tone={visitor.category_tier === 'admin' ? 'success' : visitor.category_tier === 'special' ? 'warning' : 'neutral'} label={`${TIER_LABELS[visitor.category_tier] ?? visitor.category_tier} · ${visitor.category_name}`} icon={false} />
              {visitor.organization && <span>{visitor.organization}</span>}
            </Stack>
          </Box>
          <Button variant="tonal" onClick={onClear}>مسح آخر</Button>
        </Stack>
      </Card>
      <Banner tone={action === 'out' ? 'exit' : 'entry'} title={action === 'out' ? 'إذن خروج زائر' : 'إذن دخول زائر'} sub={action === 'out' ? 'أكّد خروج الزائر من الوحدة' : 'اكتب سبب الزيارة ثم أكّد الدخول'} />
      {openVisit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          الزائر <b>داخل الوحدة</b> منذ {formatDateTime(openVisit.check_in)} — سبب الزيارة: {openVisit.purpose}
        </Alert>
      )}
      <SectionCard>
        <Stack component="form" onSubmit={submit} spacing={2} sx={{ maxWidth: 560 }}>
          <TextField label={action === 'in' ? 'جاي ليه؟ (سبب الزيارة)' : 'ملاحظات الخروج (اختياري)'} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <Button type="submit" variant="contained" size="large" loading={move.isPending}>{action === 'in' ? 'تسجيل دخول الزائر' : 'تسجيل خروج الزائر'}</Button>
        </Stack>
      </SectionCard>
    </Box>
  );
}
