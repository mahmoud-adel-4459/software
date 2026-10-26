import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { DocumentArg } from '@/api/types';
import { DocButtons } from '@/components/DocButtons';
import { useCatalog } from '@/lib/queries';
import { tokens } from '@/theme/tokens';

export const QR_SIZE = 300;

/** Crisp QR image (≥300px, pixelated scaling) with a fixed footprint while loading. */
export function QrImage({ src, size = QR_SIZE }: { src?: string; size?: number }) {
  return src ? (
    <Box component="img" src={src} alt="QR" sx={{ width: size, height: size, imageRendering: 'pixelated', bgcolor: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: `${tokens.radius}px` }} />
  ) : (
    <Skeleton variant="rounded" width={size} height={size} />
  );
}

/** Which printer and sticker size the label documents use (from the saved settings). */
export function LabelPrinterNote() {
  const settings = useCatalog().data?.settings;
  if (!settings) return null;
  const printer = settings.labelPrinter || settings.printer || 'طابعة النظام الافتراضية';
  return (
    <Typography variant="caption" color="text.secondary" data-testid="label-printer-note">
      طابعة الملصقات: {printer} · مقاس الملصق {settings.labelWidthMm ?? 89}×{settings.labelHeightMm ?? 102} مم
    </Typography>
  );
}

/** Shared QR preview dialog: title, name/number, big crisp QR, error state, extra actions. */
export function QrDialog({
  open,
  onClose,
  heading,
  name,
  subtitle,
  queryKey,
  load,
  labelDoc,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  heading: string;
  name?: string;
  subtitle?: string;
  queryKey: unknown[];
  load: () => Promise<string>;
  /** Sticker document (soldier `qr` / `visitor-qr`): the dialog offers «معاينة» and «طباعة» through the label printer. */
  labelDoc?: Omit<DocumentArg, 'mode'>;
  actions?: ReactNode;
}) {
  const qr = useQuery({ queryKey, queryFn: load, enabled: open, retry: false, staleTime: 5 * 60_000 });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{heading}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          {name && <Typography variant="h4">{name}</Typography>}
          {subtitle && <Typography className="num" color="text.secondary">{subtitle}</Typography>}
          {qr.isError ? <Alert severity="error" sx={{ width: '100%' }}>{qr.error.message}</Alert> : <QrImage src={qr.data} />}
          {labelDoc && <DocButtons doc={labelDoc} modes={['preview', 'print']} size="medium" />}
          {labelDoc && <LabelPrinterNote />}
          {actions}
        </Stack>
      </DialogContent>
      <DialogActions><Button variant="tonal" onClick={onClose}>إغلاق</Button></DialogActions>
    </Dialog>
  );
}
