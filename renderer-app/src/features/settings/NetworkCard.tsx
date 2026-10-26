import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { bridge, unwrap } from '@/api/client';
import { api } from '@/api/endpoints';
import { SectionCard } from '@/components/basic';
import { ConfirmDialog } from '@/components/interactive';
import { switchNetworkRole } from '@/features/login/PairForm';

const mono = { fontFamily: 'monospace', direction: 'ltr', display: 'inline-block' } as const;

/** Unit PC: share this PC's data with gate PCs over the LAN, and show what to enter on them. */
export function NetworkCard() {
  const info = useQuery({ queryKey: ['info'], queryFn: api.info });
  const network = useQuery({ queryKey: ['network'], queryFn: () => unwrap(bridge().network()) });
  const [confirm, setConfirm] = useState<'host' | 'local' | null>(null);
  if (!info.data?.standaloneMode || !network.data) return null;
  const n = network.data;

  return (
    <SectionCard title="المشاركة على الشبكة (جهاز البوابة)">
      {n.sharing ? (
        <Stack spacing={2}>
          <Alert severity="success">هذا هو جهاز الوحدة: البيانات مشتركة مع أجهزة البوابة على الشبكة. اترك البرنامج مفتوحًا أثناء العمل.</Alert>
          <Box>
            <Typography variant="body2" color="text.secondary">على جهاز البوابة: «هذا جهاز بوابة؟» في شاشة الدخول، ثم أدخل:</Typography>
            <Typography sx={{ mt: 1 }}>عنوان جهاز الوحدة: {n.addresses.length ? n.addresses.map((a) => <b key={a} style={{ ...mono, marginInline: 8 }}>{a.replace('https://', '').replace(':8443', '')}</b>) : <b>لا يوجد اتصال بالشبكة</b>}</Typography>
            {n.hostname && <Typography variant="caption" color="text.secondary">أو باسم الجهاز: <span style={mono}>{n.hostname.replace('https://', '').replace(':8443', '')}</span></Typography>}
            <Typography sx={{ mt: 1.5 }}>رمز الربط: <b style={{ ...mono, fontSize: 22, letterSpacing: 2 }}>{n.pairingCode}</b></Typography>
          </Box>
          <Alert severity="info">
            بعد الربط ادخل على جهاز البوابة بحساب دوره «مناوب بوابة» (من صفحة المستخدمين). لو جهاز البوابة لا يصل: اسمح للبرنامج في جدار حماية ويندوز على «الشبكات الخاصة»، وتأكد أن الجهازين على نفس الشبكة وأن ساعتيهما مضبوطتان.
          </Alert>
          <Box><Button variant="tonal" color="error" onClick={() => setConfirm('local')}>إيقاف المشاركة</Button></Box>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Typography>شغّل هذا الجهاز كـ«جهاز الوحدة»: يبقى كل شيء على هذا الجهاز، ويستطيع جهاز البوابة العمل على نفس البيانات عبر الشبكة.</Typography>
          <Alert severity="warning">قبل التفعيل غيّر كلمة مرور المسؤول من صفحة المستخدمين، لأن أي جهاز على الشبكة يعرفها يستطيع الدخول.</Alert>
          <Box><Button variant="contained" onClick={() => setConfirm('host')}>تفعيل المشاركة على الشبكة</Button></Box>
        </Stack>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'host' ? 'تفعيل المشاركة على الشبكة' : 'إيقاف المشاركة على الشبكة'}
        tone={confirm === 'local' ? 'danger' : 'primary'}
        confirmLabel="تأكيد وإعادة التشغيل"
        message={confirm === 'host'
          ? 'سيُعاد تشغيل البرنامج. إن ظهرت رسالة جدار حماية ويندوز اختر «السماح» على الشبكات الخاصة.'
          : 'سيتوقف جهاز البوابة عن العمل حتى تُفعَّل المشاركة مرة أخرى.'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && void switchNetworkRole(confirm)}
      />
    </SectionCard>
  );
}
