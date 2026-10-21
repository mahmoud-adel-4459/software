import FlagIcon from '@mui/icons-material/FlagOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { bridge, unwrap } from '@/api/client';
import type { AppInfo } from '@/api/types';
import { notify } from '@/lib/notify';
import { tokens } from '@/theme/tokens';

const FLAG = 'setupComplete';

/** True when first-run setup (server URL + CA) is still needed. */
export function setupRequired(info: AppInfo | undefined): boolean {
  if (!info) return false;
  const markDone = () => {
    try {
      sessionStorage.setItem(FLAG, '1');
    } catch {
      /* ignore */
    }
  };
  if (info.labMode || info.previewMode || info.standaloneMode || info.playMode) {
    markDone();
    return false;
  }
  try {
    if (sessionStorage.getItem(FLAG) === '1') return false;
  } catch {
    return false;
  }
  return !info.serverUrl || !info.caImported;
}

const LABELS = ['مرحبًا', 'الخادم', 'الشهادة', 'الاعتماد', 'جاهز'];

/** First-run wizard: welcome, server URL, CA certificate, device approval, done. */
export function SetupWizard({ info, onDone }: { info: AppInfo; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState(info.serverUrl || 'https://');
  const [busy, setBusy] = useState(false);
  const local = /127\.0\.0\.1:8443|localhost:8443/i.test(info.serverUrl || url);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['info'] });
  const finish = () => {
    try {
      sessionStorage.setItem(FLAG, '1');
    } catch {
      /* ignore */
    }
    onDone();
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  const next = () => setStep((s) => Math.min(s + 1, LABELS.length - 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const body = [
    <Stack spacing={2} key="0">
      <Typography variant="h4">تطبيق سطح المكتب — وليس موقعًا في المتصفح</Typography>
      <Typography>لا تفتح عنوان الخادم في Chrome أو Edge للعمل اليومي؛ استخدم هذه النافذة للدخول والطباعة.</Typography>
      <Button variant="contained" onClick={info.labMode ? finish : next}>التالي</Button>
    </Stack>,
    <Stack spacing={2} key="1">
      <Typography variant="h4">عنوان الخادم الآمن</Typography>
      <TextField label="عنوان HTTPS" type="url" value={url} onChange={(e) => setUrl(e.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
      <Stack direction="row" spacing={1}>
        <Button variant="tonal" onClick={back}>رجوع</Button>
        <Button variant="contained" loading={busy} onClick={() => run(async () => { await unwrap(bridge().configure(url)); await refresh(); notify.success('تم حفظ عنوان الخادم'); next(); })}>حفظ والمتابعة</Button>
      </Stack>
    </Stack>,
    <Stack spacing={2} key="2">
      <Typography variant="h4">شهادة الشبكة الداخلية (CA)</Typography>
      <Typography>استورد ملف .pem أو .crt للجهة المصدرة التي وقّعت شهادة الخادم.</Typography>
      {local && <Typography variant="body2" color="text.secondary">تجربة محلية: استخدم «شهادة التجربة المحلية» وتأكد من تشغيل خادم Lab أولًا.</Typography>}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button variant="tonal" onClick={back}>رجوع</Button>
        {local && (
          <Button variant="tonal" loading={busy} onClick={() => run(async () => { await unwrap(bridge().importBundledCA()); await refresh(); notify.success('تم استيراد الشهادة'); next(); })}>شهادة التجربة المحلية</Button>
        )}
        <Button variant="contained" loading={busy} onClick={() => run(async () => { if (info.caImported) return next(); if (await unwrap(bridge().importCA())) { await refresh(); notify.success('تم استيراد الشهادة'); next(); } })}>
          {info.caImported ? 'تم الاستيراد — التالي' : 'استيراد الشهادة'}
        </Button>
      </Stack>
    </Stack>,
    <Stack spacing={2} key="3">
      <Typography variant="h4">اعتماد هذا الجهاز</Typography>
      <Typography>صدّر طلب الاعتماد وأرسله للجهة المالكة لإضافته إلى ترخيص الوحدة.</Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button variant="tonal" onClick={back}>رجوع</Button>
        <Button variant="tonal" onClick={() => run(async () => { if (await unwrap(bridge().exportDevice())) notify.success('تم حفظ طلب الاعتماد'); })}>حفظ طلب الاعتماد</Button>
        <Button variant="contained" onClick={next}>تخطي — لدي ترخيص</Button>
      </Stack>
    </Stack>,
    <Stack spacing={2} key="4">
      <Typography variant="h4">اكتمل الإعداد</Typography>
      <Typography>سجّل الدخول باسم المستخدم وكلمة المرور التي يوفّرها مسؤول الخادم.</Typography>
      <Button variant="contained" onClick={finish}>الذهاب لتسجيل الدخول</Button>
    </Stack>,
  ];

  return (
    <Box sx={{ minHeight: '100%', display: 'grid', placeItems: 'center', p: 2, background: `linear-gradient(160deg, ${tokens.sidebarFrom}, ${tokens.sidebarTo})` }}>
      <Card sx={{ p: 4, width: '100%', maxWidth: 640 }}>
        <Stack spacing={1} sx={{ alignItems: 'center', mb: 3 }}>
          <FlagIcon sx={{ fontSize: 40, color: tokens.primary }} />
          <Typography variant="h3" component="h1">إعداد أول تشغيل</Typography>
        </Stack>
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
          {LABELS.map((l) => (
            <Step key={l}>
              <StepLabel>{l}</StepLabel>
            </Step>
          ))}
        </Stepper>
        {body[step]}
      </Card>
    </Box>
  );
}
