import SearchIcon from '@mui/icons-material/SearchOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState, type FormEvent } from 'react';
import { api } from '@/api/endpoints';
import type { Soldier } from '@/api/types';
import { notify } from '@/lib/notify';
import { tokens } from '@/theme/tokens';

/** Select an active soldier by exact military number (used by canteen, buffet and fitness). */
export function SoldierLookup({ selected, onSelect }: { selected: Soldier | null; onSelect: (s: Soldier | null) => void }) {
  const [no, setNo] = useState(selected?.military_no ?? '');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = no.trim();
    if (!value) return;
    setBusy(true);
    try {
      const res = await api.soldiers({ q: value });
      const hit = res.soldiers.find((s) => s.military_no === value) ?? null;
      if (!hit) notify.error('لا يوجد عسكري نشط بهذا الرقم');
      onSelect(hit);
    } catch (err) {
      notify.apiError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2.5 }}>
      <Stack component="form" onSubmit={submit} direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <TextField label="الرقم العسكري" value={no} onChange={(e) => setNo(e.target.value)} sx={{ maxWidth: 320 }} slotProps={{ htmlInput: { dir: 'ltr', inputMode: 'numeric' } }} />
        <Button type="submit" variant="contained" startIcon={<SearchIcon />} loading={busy}>اختيار العسكري</Button>
        {selected && (
          <Chip label={`${selected.rank} / ${selected.name} · ${selected.company}`} onDelete={() => onSelect(null)} sx={{ bgcolor: tokens.primaryLight, color: tokens.primary, height: 36 }} />
        )}
      </Stack>
    </Paper>
  );
}
