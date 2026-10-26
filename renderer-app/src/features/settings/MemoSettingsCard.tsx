import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { post } from '@/api/client';
import type { UnitSettings } from '@/api/types';
import { SectionCard } from '@/components/basic';
import { notify } from '@/lib/notify';
import { LOGO_SRC } from '@/lib/brand';

const FIELDS = [
  ['memoFormation', 'التشكيل أعلى الورقة', 'قيادة قوات الحرس الجمهوري'],
  ['memoUnitLine', 'بيانات الكتيبة أعلى الورقة', 'الكتيبة ١٢٣ مدفعية م ط ش ب'],
  ['memoRightRank', 'رتبة الموقّع يمينًا', 'نقيب'],
  ['memoRightName', 'اسم الموقّع يمينًا', ''],
  ['memoRightRole', 'وظيفة الموقّع يمينًا', 'ضابط أمن الكتيبة'],
  ['memoLeftRank', 'رتبة الموقّع يسارًا', 'مقدم'],
  ['memoLeftName', 'اسم الموقّع يسارًا', ''],
  ['memoLeftRole', 'وظيفة الموقّع يسارًا', 'قائد الكتيبة'],
] as const;

export function MemoSettingsCard({ settings }: { settings: UnitSettings }) {
  const client = useQueryClient();
  const [values, setValues] = useState(() => Object.fromEntries(FIELDS.map(([key, , fallback]) => [key, settings[key] || fallback])));
  const [logo, setLogo] = useState(settings.memoLogo || null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await post('/api/settings', { ...settings, ...values, memoLogo: logo });
      await client.invalidateQueries({ queryKey: ['catalog'] });
      notify.success('تم حفظ تصميم مذكرة التقارير');
    } catch (error) { notify.apiError(error); }
    finally { setBusy(false); }
  };
  return (
    <SectionCard title="تصميم تقارير A4 — مذكرة تفصيلية">
      <Stack spacing={2}>
        <Alert severity="info">إطار أزرق، شعار أعلى اليسار، علامة مائية وتوقيعان في كل صفحة. اكتب الأسماء وارفع الشعار الأصلي لمطابقة الورقة المرجعية.</Alert>
        <Grid container spacing={2}>
          {FIELDS.map(([key, label]) => <Grid key={key} size={{ xs: 12, md: 6 }}><TextField fullWidth label={label} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} slotProps={{ htmlInput: { maxLength: 150 } }} /></Grid>)}
        </Grid>
        <Typography variant="body2">الشعار هنا خاص بالتقارير؛ يُستخدم في أعلى الصفحة وكعلامة مائية.</Typography>
        <Box component="img" src={logo || LOGO_SRC} alt="شعار مذكرة التقارير" sx={{ width: 100, height: 100, objectFit: 'contain' }} />
        <Stack direction="row" spacing={1}>
          <Button component="label" variant="tonal">اختيار شعار المذكرة
            <input hidden type="file" accept="image/png,image/jpeg" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) { notify.error('اختر صورة PNG أو JPG بحجم لا يزيد عن 2 ميجابايت'); return; }
              const reader = new FileReader();
              reader.onload = () => setLogo(String(reader.result));
              reader.onerror = () => notify.error('تعذرت قراءة الشعار');
              reader.readAsDataURL(file);
            }} />
          </Button>
          {logo && <Button color="inherit" onClick={() => setLogo(null)}>استخدام شعار الوحدة</Button>}
        </Stack>
        <Button variant="contained" loading={busy} onClick={save}>حفظ تصميم المذكرة</Button>
      </Stack>
    </SectionCard>
  );
}
