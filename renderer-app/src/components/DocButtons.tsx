import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PreviewIcon from '@mui/icons-material/VisibilityOutlined';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useRef, useState } from 'react';
import { api } from '@/api/endpoints';
import type { DocumentArg } from '@/api/types';
import { notify } from '@/lib/notify';

type Mode = 'preview' | 'print' | 'pdf';
const MODES: { mode: Mode; label: string; icon: typeof PrintIcon; variant: 'tonal' | 'contained' }[] = [
  { mode: 'preview', label: 'معاينة', icon: PreviewIcon, variant: 'tonal' },
  { mode: 'print', label: 'طباعة', icon: PrintIcon, variant: 'contained' },
  { mode: 'pdf', label: 'حفظ PDF', icon: PdfIcon, variant: 'tonal' },
];

/** Preview / print / PDF buttons for a document (voucher, receipt, statement, report, daily report). */
export function DocButtons({ doc, size = 'small', modes }: { doc: Omit<DocumentArg, 'mode'>; size?: 'small' | 'medium'; modes?: Mode[] }) {
  const [busy, setBusy] = useState<Mode | null>(null);
  const pending = useRef(false);
  const run = async (mode: Mode) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(mode);
    try {
      const completed = await api.document({ ...doc, mode });
      if (!completed) return;
      if (mode === 'print') notify.success('تم إرسال الطباعة');
      if (mode === 'pdf') notify.success('تم حفظ PDF');
    } catch (e) {
      notify.apiError(e);
    } finally {
      pending.current = false;
      setBusy(null);
    }
  };
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
      {MODES.filter((m) => !modes || modes.includes(m.mode)).map((m) => (
        <Button key={m.mode} size={size} variant={m.variant} startIcon={<m.icon />} loading={busy === m.mode} disabled={busy !== null && busy !== m.mode} onClick={() => run(m.mode)}>
          {m.label}
        </Button>
      ))}
    </Stack>
  );
}
