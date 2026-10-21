import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { bridge, unwrap } from '@/api/client';
import type { LegacyPreview } from '@/api/types';
import { DetailList, PageHeader, SectionCard } from '@/components/basic';
import { notify } from '@/lib/notify';

/** One-time import of the legacy browser prototype export: preview first, then type IMPORT to apply. */
export function ImportPage() {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<LegacyPreview | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    try {
      const p = await unwrap(bridge().previewLegacy());
      if (p) { setPreview(p); setConfirm(''); }
    } catch (e) {
      notify.apiError(e);
    }
  };
  const apply = async () => {
    setBusy(true);
    try {
      await unwrap(bridge().applyLegacy(confirm));
      setPreview(null);
      await queryClient.invalidateQueries();
      notify.success('تم استيراد البيانات والمرفقات دون نقل كلمة المرور القديمة');
    } catch (e) {
      notify.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="استيراد بيانات النسخة القديمة" description="معاينة ذرية قبل الدمج؛ التكرار يوقف العملية بالكامل. لا تُنقل كلمات المرور القديمة."
        actions={<Button variant="contained" startIcon={<UploadIcon />} onClick={pick}>اختيار ملف ومراجعته</Button>} />
      {preview && (
        <SectionCard title="نتيجة المعاينة">
          <DetailList rows={Object.entries(preview.counts).map(([k, v]) => ({ label: k, value: v }))} labelWidth={220} />
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            {preview.warnings.map((w) => <Alert key={w} severity="warning">{w}</Alert>)}
            {preview.errors.map((w) => <Alert key={w} severity="error">{w}</Alert>)}
            {preview.valid && (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <TextField label="اكتب IMPORT بعد مراجعة الملف" value={confirm} onChange={(e) => setConfirm(e.target.value)} sx={{ maxWidth: 320 }} slotProps={{ htmlInput: { dir: 'ltr' } }} />
                <Button variant="contained" disabled={confirm !== 'IMPORT'} loading={busy} onClick={apply}>استيراد البيانات</Button>
              </Stack>
            )}
          </Stack>
        </SectionCard>
      )}
    </>
  );
}
