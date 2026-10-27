import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UnitSettings } from '@/api/types';
import { post } from '@/api/client';
import { SectionCard } from '@/components/basic';
import { notify } from '@/lib/notify';

type ListKey = 'soldierGrades' | 'soldierRanks';

/** The grade and rank choices of the soldier form. */
export function SoldierListsCard({ settings, grades, ranks }: { settings: UnitSettings; grades: string[]; ranks: string[] }) {
  return (
    <SectionCard title="الدرجات والرتب" subtitle="تظهر كقوائم اختيار عند إضافة العسكري أو تعديله. اضغط على العنصر لتعديله، أو × لحذفه؛ كل تغيير يُحفظ مباشرة.">
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ListEditor settings={settings} field="soldierGrades" items={grades} title="الدرجات" noun="درجة" />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ListEditor settings={settings} field="soldierRanks" items={ranks} title="الرتب" noun="رتبة" />
        </Grid>
      </Grid>
    </SectionCard>
  );
}

function ListEditor({ settings, field, items, title, noun }: { settings: UnitSettings; field: ListKey; items: string[]; title: string; noun: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const persist = async (next: string[]) => {
    setBusy(true);
    try {
      await post('/api/settings', { ...settings, [field]: next });
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
      setName('');
      setEditing(null);
      notify.success(`تم حفظ ${title}`);
    } catch (error) { notify.apiError(error); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    const value = name.trim();
    if (!value) return notify.error(`اكتب ال${noun}`);
    if (value.length > 80) return notify.error(`ال${noun} حتى 80 حرفًا`);
    if (items.some((item, index) => item === value && index !== editing)) return notify.error(`${noun} مكررة`);
    await persist(editing === null ? [...items, value] : items.map((item, i) => (i === editing ? value : item)));
  };
  return (
    <>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>{title}</Typography>
      <Box component="form" onSubmit={(event) => { event.preventDefault(); void apply(); }} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <TextField label={editing === null ? `${noun} جديدة` : `تعديل ال${noun}`} value={name} disabled={busy}
          onChange={(event) => setName(event.target.value)} size="small" fullWidth={false}
          slotProps={{ htmlInput: { maxLength: 80 } }} sx={{ width: { xs: '100%', sm: 240 } }} />
        <Button type="submit" variant="contained" loading={busy}>{editing === null ? 'إضافة' : 'حفظ التعديل'}</Button>
        {editing !== null && <Button disabled={busy} onClick={() => { setEditing(null); setName(''); }}>إلغاء</Button>}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {items.map((item, index) => <Chip key={item} label={item} variant="outlined" disabled={busy}
          onClick={() => { setEditing(index); setName(item); }}
          onDelete={() => { void persist(items.filter((_, i) => i !== index)); }} />)}
      </Box>
      {items.length === 0 && <Alert severity="warning" sx={{ mt: 1 }}>القائمة فارغة؛ أضف {noun} حتى يمكن اختيارها في ملف العسكري.</Alert>}
    </>
  );
}
