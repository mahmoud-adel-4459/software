import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { bridge, unwrap } from '@/api/client';
import type { AppInfo } from '@/api/types';
import { notify } from '@/lib/notify';
import { tokens } from '@/theme/tokens';

/** Server connection settings: machine id, server URL, device approval request, CA import. */
export function ConnectionPanel({ info }: { info: AppInfo }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(info.serverUrl ?? '');
  const [saving, setSaving] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['info'] });

  const saveUrl = async () => {
    setSaving(true);
    try {
      await unwrap(bridge().configure(url));
      await refresh();
      notify.success('تم حفظ عنوان الخادم');
    } catch (e) {
      notify.apiError(e);
    } finally {
      setSaving(false);
    }
  };
  const copyMachineId = async () => {
    try {
      if (bridge().copyText) await unwrap(bridge().copyText(info.machineId));
      else await navigator.clipboard.writeText(info.machineId);
      notify.success('تم نسخ رقم تعريف الكمبيوتر');
    } catch (e) {
      notify.apiError(e);
    }
  };
  const exportDevice = async () => {
    try {
      if (await unwrap(bridge().exportDevice())) notify.success('تم حفظ طلب الاعتماد؛ أرسله إلى الجهة المالكة');
    } catch (e) {
      notify.apiError(e);
    }
  };
  const importCa = async () => {
    try {
      if (await unwrap(bridge().importCA())) {
        await refresh();
        notify.success('تم استيراد الشهادة');
      }
    } catch (e) {
      notify.apiError(e);
    }
  };

  if (info.playMode) {
    return (
      <Typography variant="body2" sx={{ color: tokens.onDark, textAlign: 'center', mt: 2 }}>
        تجربة محلية — بدون ترخيص. المستخدم: <b>admin</b> · كلمة المرور في ملف play-login.txt
      </Typography>
    );
  }
  return (
    <Accordion defaultExpanded={!info.serverUrl} sx={{ mt: 2, borderRadius: `${tokens.radius}px !important`, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 700 }}>إعداد اتصال الخادم واعتماد الجهاز</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1}>
            <TextField label="رقم تعريف الكمبيوتر (للتفعيل)" value={info.machineId} slotProps={{ input: { readOnly: true } }} />
            <Button variant="tonal" onClick={copyMachineId}>نسخ</Button>
          </Stack>
          {info.standaloneMode && info.loginHintPath && (
            <Typography variant="caption">كلمة مرور المسؤول المحلي: ملف login.txt داخل مجلد standalone في بيانات التطبيق.</Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            قبل الدخول (وضع الشبكة) أرسل طلب اعتماد هذا الجهاز إلى الجهة المالكة لإضافته إلى ترخيص المنشأة.
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField label="عنوان الخادم الآمن" type="url" value={url} onChange={(e) => setUrl(e.target.value)} slotProps={{ htmlInput: { dir: 'ltr' } }} />
            <Button variant="contained" loading={saving} onClick={saveUrl} sx={{ whiteSpace: 'nowrap' }}>حفظ العنوان</Button>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button variant="tonal" onClick={exportDevice}>حفظ طلب اعتماد الجهاز</Button>
            <Button variant="tonal" onClick={importCa}>استيراد شهادة الشبكة الداخلية</Button>
          </Stack>
          <Typography variant="caption">
            {info.caImported ? 'شهادة الشبكة مستوردة' : 'يُفضّل استيراد شهادة CA الداخلية'} · الإصدار {info.version}
            {info.labMode ? ' · تجربة محلية' : ''}
            {info.standaloneMode ? ' · خادم محلي' : ''}
          </Typography>
          <Accordion disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>متقدم — معرّف الجهاز</AccordionSummary>
            <AccordionDetails>
              <Typography variant="caption" component="div">معرف الجهاز: <code>{info.deviceId}</code></Typography>
              <Typography variant="caption" component="div">بصمة المفتاح: <code>{info.fingerprint}</code></Typography>
              {info.machineGuid && <Typography variant="caption" component="div">Windows MachineGuid: <code>{info.machineGuid}</code></Typography>}
            </AccordionDetails>
          </Accordion>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
