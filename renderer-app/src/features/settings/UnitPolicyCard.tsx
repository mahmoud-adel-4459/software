import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/AddOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { post } from '@/api/client';
import type { FitnessStandard, GradeBand, UnitSettings } from '@/api/types';
import { SectionCard } from '@/components/basic';
import { notify } from '@/lib/notify';

interface Props {
  settings: UnitSettings;
  gateMinMinutes: number;
  standards: FitnessStandard[];
  gradeScale: GradeBand[];
}

/** Gate minimum time, fitness standards and the grade scale — all set by the administrator. */
export function UnitPolicyCard({ settings, gateMinMinutes, standards, gradeScale }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const save = async (key: string, value: unknown, message: string) => {
    setBusy(key);
    try {
      await post('/api/settings', { ...settings, [key]: value });
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
      await queryClient.invalidateQueries({ queryKey: ['soldier-evaluation'] });
      notify.success(message);
    } catch (error) { notify.apiError(error); }
    finally { setBusy(null); }
  };
  return (
    <SectionCard title="البوابة واللياقة والتقديرات" subtitle="كل قسم يُحفظ بزر الحفظ الخاص به.">
      <GateMinimum value={gateMinMinutes} busy={busy === 'gateMinMinutes'} onSave={(v) => save('gateMinMinutes', v, 'تم حفظ أقل مدة بين الخروج والعودة')} />
      <Divider sx={{ my: 3 }} />
      <StandardsEditor initial={standards} busy={busy === 'fitnessStandards'} onSave={(v) => save('fitnessStandards', v, 'تم حفظ معايير اللياقة')} />
      <Divider sx={{ my: 3 }} />
      <ScaleEditor initial={gradeScale} busy={busy === 'gradeScale'} onSave={(v) => save('gradeScale', v, 'تم حفظ سلم التقديرات')} />
    </SectionCard>
  );
}

function GateMinimum({ value, busy, onSave }: { value: number; busy: boolean; onSave: (v: number) => void }) {
  const [hours, setHours] = useState(String(Math.floor(value / 60)));
  const [minutes, setMinutes] = useState(String(value % 60));
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>أقل مدة بين خروج العسكري وعودته</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        البوابة ترفض تسجيل العودة قبل مرور هذه المدة من الخروج، وترفض موعد عودة متوقع أقرب منها. 0 = بدون حد أدنى.
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
        <TextField label="ساعات" type="number" size="small" value={hours} onChange={(e) => setHours(e.target.value)} slotProps={{ htmlInput: { min: 0, max: 168 } }} sx={{ width: 110 }} />
        <TextField label="دقائق" type="number" size="small" value={minutes} onChange={(e) => setMinutes(e.target.value)} slotProps={{ htmlInput: { min: 0, max: 59 } }} sx={{ width: 110 }} />
        <Button variant="contained" loading={busy} onClick={() => {
          if (!Number.isInteger(total) || total < 0 || total > 10080) return notify.error('المدة من 0 إلى 7 أيام');
          onSave(total);
        }}>حفظ المدة</Button>
      </Stack>
    </Box>
  );
}

type StandardRow = { name: string; unit: string; target: string; better: 'higher' | 'lower' };

function StandardsEditor({ initial, busy, onSave }: { initial: FitnessStandard[]; busy: boolean; onSave: (v: FitnessStandard[]) => void }) {
  const [rows, setRows] = useState<StandardRow[]>(initial.map((s) => ({ ...s, target: String(s.target) })));
  const set = (i: number, patch: Partial<StandardRow>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const submit = () => {
    const parsed = rows.map((r) => ({ name: r.name.trim(), unit: r.unit.trim(), target: Number(r.target), better: r.better }));
    const bad = parsed.find((s) => !s.name || !s.unit || !(s.target > 0));
    if (bad) return notify.error('أكمل اسم الاختبار والوحدة ومعيارًا أكبر من صفر لكل صف');
    if (new Set(parsed.map((s) => s.name)).size !== parsed.length) return notify.error('اسم اختبار مكرر');
    onSave(parsed);
  };
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>معايير اختبارات اللياقة</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        من يحقق المعيار يأخذ 100%، وأقل منه يأخذ نسبة. «الأكثر أفضل» للعدد (ضغط، عقلة…)، «الأقل أفضل» للوقت (الجري).
      </Typography>
      <Stack spacing={1.5}>
        {rows.map((row, i) => (
          <Stack key={i} direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
            <TextField label="الاختبار" size="small" value={row.name} onChange={(e) => set(i, { name: e.target.value })} sx={{ flex: 2 }} />
            <TextField label="المعيار (100%)" type="number" size="small" value={row.target} onChange={(e) => set(i, { target: e.target.value })} slotProps={{ htmlInput: { min: 0, step: 0.01 } }} sx={{ flex: 1 }} />
            <TextField label="الوحدة" size="small" value={row.unit} onChange={(e) => set(i, { unit: e.target.value })} sx={{ flex: 1 }} />
            <TextField select label="الاحتساب" size="small" value={row.better} onChange={(e) => set(i, { better: e.target.value as 'higher' | 'lower' })} sx={{ flex: 1.3 }}>
              <MenuItem value="higher">الأكثر أفضل (عدد)</MenuItem>
              <MenuItem value="lower">الأقل أفضل (وقت)</MenuItem>
            </TextField>
            <IconButton aria-label={`حذف ${row.name || 'الاختبار'}`} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}><DeleteIcon /></IconButton>
          </Stack>
        ))}
      </Stack>
      <Alert severity="info" sx={{ my: 2 }}>تغيير اسم اختبار أو وحدته يوقف احتساب النسبة للنتائج القديمة المسجلة بالاسم أو الوحدة السابقة.</Alert>
      <Stack direction="row" spacing={1}>
        <Button variant="tonal" startIcon={<AddIcon />} onClick={() => setRows((r) => [...r, { name: '', unit: 'مرة', target: '', better: 'higher' }])}>إضافة اختبار</Button>
        <Button variant="contained" loading={busy} onClick={submit}>حفظ المعايير</Button>
      </Stack>
    </Box>
  );
}

type BandRow = { label: string; min: string };

function ScaleEditor({ initial, busy, onSave }: { initial: GradeBand[]; busy: boolean; onSave: (v: GradeBand[]) => void }) {
  const [rows, setRows] = useState<BandRow[]>(initial.map((b) => ({ label: b.label, min: String(b.min) })));
  const set = (i: number, patch: Partial<BandRow>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const submit = () => {
    const parsed = rows.map((r) => ({ label: r.label.trim(), min: Number(r.min) }));
    if (!parsed.length) return notify.error('أضف تقديرًا واحدًا على الأقل');
    if (parsed.some((b) => !b.label || !(b.min >= 0 && b.min <= 100) || rows.some((r) => r.min.trim() === ''))) return notify.error('لكل تقدير اسم وحد أدنى من 0 إلى 100');
    if (new Set(parsed.map((b) => b.label)).size !== parsed.length) return notify.error('تقدير مكرر');
    onSave(parsed);
  };
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>سلم التقديرات</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        يُقترح التقدير من متوسط نسب اللياقة. من أقل من آخر حد يأخذ «ضعيف». التقدير النهائي يحدده المسؤول من ملف العسكري.
      </Typography>
      <Stack spacing={1.5}>
        {rows.map((row, i) => (
          <Stack key={i} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <TextField label="التقدير" size="small" value={row.label} onChange={(e) => set(i, { label: e.target.value })} sx={{ width: 200 }} />
            <TextField label="من %" type="number" size="small" value={row.min} onChange={(e) => set(i, { min: e.target.value })} slotProps={{ htmlInput: { min: 0, max: 100 } }} sx={{ width: 120 }} />
            <IconButton aria-label={`حذف ${row.label || 'التقدير'}`} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}><DeleteIcon /></IconButton>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button variant="tonal" startIcon={<AddIcon />} onClick={() => setRows((r) => [...r, { label: '', min: '' }])}>إضافة تقدير</Button>
        <Button variant="contained" loading={busy} onClick={submit}>حفظ السلم</Button>
      </Stack>
    </Box>
  );
}
