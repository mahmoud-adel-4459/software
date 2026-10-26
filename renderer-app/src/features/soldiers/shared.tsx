import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/endpoints';
import type { AttachmentKind, AttachmentMeta, PickedFile } from '@/api/types';
import { QrDialog } from '@/components/QrDialog';
import { PHOTO_KINDS } from '@/lib/soldierProfile';
import { tokens } from '@/theme/tokens';

/** QR preview dialog for a soldier with print/PDF buttons. */
export function SoldierQrDialog({ soldier, onClose }: { soldier: { id: string; name: string; military_no: string } | null; onClose: () => void }) {
  return (
    <QrDialog
      open={Boolean(soldier)}
      onClose={onClose}
      heading="باركود البوابة (QR)"
      queryKey={['qr', soldier?.id]}
      load={() => api.qr(soldier!.id)}
      labelDoc={soldier ? { type: 'qr', ids: [soldier.id], copies: 1 } : undefined}
    />
  );
}

/** Loads saved photo attachments (base64) as data URLs by kind. */
export function useSavedPhotos(attachments: AttachmentMeta[] | undefined) {
  const photos = (attachments ?? []).filter((a) => PHOTO_KINDS.some(([k]) => k === a.kind));
  return useQuery({
    queryKey: ['photos', photos.map((a) => a.id).join(',')],
    enabled: photos.length > 0,
    queryFn: async () => {
      const out: Partial<Record<AttachmentKind, string>> = {};
      await Promise.all(photos.map(async (a) => {
        const f = await api.attachment(a.id);
        out[a.kind] = `data:${f.mime};base64,${f.content}`;
      }));
      return out;
    },
  });
}

export type PendingPhotos = Partial<Record<AttachmentKind, PickedFile>>;

/** The four photo slots: saved preview, pick (via native dialog) and clear pending. */
export function PhotoSlots({
  saved,
  pending,
  onPick,
  onClear,
}: {
  saved?: Partial<Record<AttachmentKind, string>>;
  pending: PendingPhotos;
  onPick: (kind: AttachmentKind) => void;
  onClear: (kind: AttachmentKind) => void;
}) {
  return (
    <Grid container spacing={2}>
      {PHOTO_KINDS.map(([kind, label]) => {
        const file = pending[kind];
        const src = file ? `data:${file.mime};base64,${file.content}` : saved?.[kind];
        return (
          <Grid key={kind} size={{ xs: 6, md: 3 }} data-photo-kind={kind}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{label}{saved?.[kind] && !file ? ' (محفوظة)' : ''}</Typography>
            <Box sx={{ height: 150, my: 0.75, borderRadius: `${tokens.radius}px`, bgcolor: tokens.ice100, border: `1px solid ${tokens.border}`, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
              {src ? <img src={src} alt={label} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <Typography color="text.secondary">—</Typography>}
            </Box>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="tonal" onClick={() => onPick(kind)}>اختيار</Button>
              {file && <Button size="small" color="inherit" onClick={() => onClear(kind)}>إزالة</Button>}
            </Stack>
          </Grid>
        );
      })}
    </Grid>
  );
}
