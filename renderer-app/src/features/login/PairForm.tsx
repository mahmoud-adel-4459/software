import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { bridge, unwrap } from '@/api/client';
import { notify } from '@/lib/notify';

/** Gate PC: unit PC address + pairing code → trusted connection (no certificate file to copy). */
export function PairForm({ initialAddress = '', onPaired }: { initialAddress?: string; onPaired?: () => void }) {
  const queryClient = useQueryClient();
  const [address, setAddress] = useState(initialAddress.replace(/^https:\/\//, ''));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const pair = async () => {
    setBusy(true);
    try {
      await unwrap(bridge().pair({ address, code }));
      await queryClient.invalidateQueries({ queryKey: ['info'] });
      notify.success('تم الربط بجهاز الوحدة');
      onPaired?.();
    } catch (e) {
      notify.apiError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Stack spacing={2}>
      <TextField
        label="عنوان جهاز الوحدة"
        placeholder="192.168.1.9"
        helperText="كما يظهر في جهاز الوحدة: الإعدادات ← المشاركة على الشبكة"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        slotProps={{ htmlInput: { dir: 'ltr' } }}
      />
      <TextField
        label="رمز الربط"
        placeholder="XXXX-XXXX-XXXX-XXXX"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        slotProps={{ htmlInput: { dir: 'ltr', style: { fontFamily: 'monospace', letterSpacing: 2 } } }}
      />
      <Button variant="contained" loading={busy} disabled={!address.trim() || !code.trim()} onClick={pair}>ربط بجهاز الوحدة</Button>
    </Stack>
  );
}

/** Restarts the app with another network role. */
export async function switchNetworkRole(role: 'local' | 'host' | 'client') {
  try {
    await unwrap(bridge().setNetworkRole(role));
    notify.info('جاري إعادة تشغيل البرنامج…');
  } catch (e) {
    notify.apiError(e);
  }
}
