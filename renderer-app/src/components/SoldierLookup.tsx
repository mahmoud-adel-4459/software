import SearchIcon from '@mui/icons-material/SearchOutlined';
import QrIcon from '@mui/icons-material/QrCodeScannerOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useRef, useState, type FormEvent } from 'react';
import { api } from '@/api/endpoints';
import type { Soldier } from '@/api/types';
import { notify } from '@/lib/notify';
import { parseGateScan } from '@/lib/soldierProfile';
import { tokens } from '@/theme/tokens';

/** Select an active soldier by exact military number (used by canteen, buffet and fitness). */
export function SoldierLookup({ selected, onSelect }: { selected: Soldier | null; onSelect: (s: Soldier | null) => void }) {
  const [no, setNo] = useState(selected?.military_no ?? '');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const clearSelection = () => {
    requestId.current += 1;
    onSelect(null);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const scan = parseGateScan(no);
    if (scan.kind !== 'soldier' || !/^\d{6,30}$/.test(scan.militaryNo)) {
      clearSelection();
      return notify.error('امسح كود العسكري أو أدخل رقمه العسكري الصحيح');
    }
    const value = scan.militaryNo;
    const currentRequest = ++requestId.current;
    onSelect(null);
    setBusy(true);
    try {
      const res = await api.soldiers({ q: value });
      if (currentRequest !== requestId.current) return;
      const hit = res.soldiers.find((s) => s.military_no === value) ?? null;
      if (!hit) notify.error('لا يوجد عسكري نشط بهذا الرقم');
      onSelect(hit);
      if (hit) setNo(value);
    } catch (err) {
      if (currentRequest === requestId.current) notify.apiError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2.5 }}>
      <Stack component="form" onSubmit={submit} direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <TextField inputRef={inputRef} label="الرقم العسكري" value={no} onChange={(e) => { setNo(e.target.value); clearSelection(); }} autoComplete="off" helperText="اكتب الرقم أو امسح QR بقارئ USB ثم Enter" sx={{ maxWidth: 420 }} slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'numeric' } }} />
        <Button type="button" variant="tonal" startIcon={<QrIcon />} disabled={busy} onClick={() => { setNo(''); clearSelection(); inputRef.current?.focus(); }}>اسكان كود العسكري</Button>
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} loading={busy}>اختيار العسكري</Button>
        {selected && (
          <Chip label={`${selected.rank} / ${selected.name} · ${selected.company}`} onDelete={() => { setNo(''); clearSelection(); inputRef.current?.focus(); }} sx={{ bgcolor: tokens.primaryLight, color: tokens.primary, height: 36 }} />
        )}
      </Stack>
    </Paper>
  );
}
