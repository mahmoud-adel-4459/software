import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UnitSettings } from '@/api/types';
import { post } from '@/api/client';
import { SectionCard } from '@/components/basic';
import { notify } from '@/lib/notify';

/** Edits the complete reason list, including the reasons originally supplied with the application. */
export function ExitReasonsCard({ settings, reasons }: { settings: UnitSettings; reasons: string[] }) {
  const queryClient = useQueryClient();
  const rows = reasons;
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const persist = async (next: string[]) => {
    setBusy(true);
    try {
      await post('/api/settings', { ...settings, exitReasons: next });
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
      setName('');
      setEditing(null);
      notify.success('تم حفظ أسباب الخروج وتحديث البوابة');
    } catch (error) { notify.apiError(error); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    const value = name.trim();
    if (!value) return notify.error('اكتب سبب الخروج');
    if (value.length > 100) return notify.error('سبب الخروج حتى 100 حرف');
    if (rows.some((row, index) => row === value && index !== editing)) return notify.error('سبب خروج مكرر');
    await persist(editing === null ? [...rows, value] : rows.map((row, i) => i === editing ? value : row));
  };
  return (
    <SectionCard title="أسباب الخروج" subtitle="اضغط على السبب لتعديله، أو × لحذفه. كل تغيير يُحفظ مباشرة ويظهر في البوابة.">
      <Box component="form" onSubmit={event => { event.preventDefault(); apply(); }} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <TextField label={editing === null ? 'سبب خروج جديد' : 'تعديل سبب الخروج'} value={name} disabled={busy}
          onChange={event => setName(event.target.value)} size="small" fullWidth={false}
          slotProps={{ htmlInput: { maxLength: 100 } }} sx={{ width: { xs: '100%', sm: 320 } }} />
        <Button type="submit" variant="contained" loading={busy}>{editing === null ? 'إضافة سبب' : 'حفظ التعديل'}</Button>
        {editing !== null && <Button disabled={busy} onClick={() => { setEditing(null); setName(''); }}>إلغاء التعديل</Button>}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        {rows.map((reason, index) => <Chip key={reason} label={reason} variant="outlined" disabled={busy}
          onClick={() => { setEditing(index); setName(reason); }}
          onDelete={() => { void persist(rows.filter((_, i) => i !== index)); }} />)}
      </Box>
      {rows.length === 0 && <Alert severity="warning" sx={{ mb: 2 }}>القائمة فارغة؛ أضف سببًا حتى يمكن اختياره عند تسجيل الخروج.</Alert>}
    </SectionCard>
  );
}
