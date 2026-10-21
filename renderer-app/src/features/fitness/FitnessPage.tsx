import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '@/api/endpoints';
import type { FitnessRecord, Soldier } from '@/api/types';
import { PageHeader, SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { SoldierLookup } from '@/components/SoldierLookup';
import { dayOnly, todayCairo } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';
import { useIdempotentPost } from '@/lib/useIdempotentPost';
import { ExcelButtons } from '@/components/ExcelButtons';
import { FITNESS_IMPORT, sheetWorkbook } from '@/lib/excel';

/** Fitness test records per soldier. */
export function FitnessPage() {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const types = Object.entries(catalog.data?.fitnessTypes ?? {});
  const [soldier, setSoldier] = useState<Soldier | null>(null);
  const [type, setType] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayCairo());
  const [notes, setNotes] = useState('');
  const chosenType = type || types[0]?.[0] || '';
  const records = useQuery({ queryKey: ['fitness', soldier?.id], queryFn: () => api.fitness(soldier!.id), enabled: Boolean(soldier) });
  const save = useIdempotentPost<{ soldierId: string; type: string; value: number; date: string; notes: string }>('/api/fitness', {
    onSuccess: async () => {
      setValue('');
      setNotes('');
      notify.success('تم حفظ الاختبار');
      await queryClient.invalidateQueries({ queryKey: ['fitness'] });
    },
    onError: notify.apiError,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (value.trim() === '' || !Number.isFinite(n) || n < 0) return notify.error('أدخل نتيجة صالحة');
    save.mutate({ soldierId: soldier!.id, type: chosenType, value: n, date, notes });
  };
  const columns: Column<FitnessRecord>[] = [
    { field: 'date', headerName: 'التاريخ', width: 140, valueFormatter: (v: string) => dayOnly(v) },
    { field: 'type', headerName: 'الاختبار', flex: 1, minWidth: 160 },
    { field: 'value', headerName: 'النتيجة', width: 160, valueGetter: (_v, r) => `${r.value ?? r.raw_result ?? ''} ${r.unit ?? ''}` },
    { field: 'notes', headerName: 'ملاحظات', flex: 1, minWidth: 160 },
  ];
  return (
    <>
      <PageHeader title="اللياقة" description="تسجيل نتائج اللياقة حسب نوع الاختبار وتاريخه."
        actions={<ExcelButtons importSpec={FITNESS_IMPORT} build={soldier ? () => sheetWorkbook('اللياقة', 'اللياقة', [{ header: 'التاريخ', key: 'date' }, { header: 'الاختبار', key: 'type', width: 24 }, { header: 'النتيجة', key: 'value' }, { header: 'الوحدة', key: 'unit' }, { header: 'ملاحظات', key: 'notes', width: 30 }],
          (records.data ?? []).map((r) => ({ date: dayOnly(r.date), type: r.type, value: r.value ?? r.raw_result ?? '', unit: r.unit ?? '', notes: r.notes }))) : undefined} />} />
      <SoldierLookup selected={soldier} onSelect={setSoldier} />
      {soldier && (
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <SectionCard title="اختبار جديد">
              <Stack component="form" onSubmit={submit} spacing={2} noValidate>
                <TextField select label="نوع الاختبار" value={chosenType} onChange={(e) => setType(e.target.value)}>
                  {types.map(([t, u]) => <MenuItem key={t} value={t}>{`${t} (${u})`}</MenuItem>)}
                </TextField>
                <TextField label="النتيجة بالقيمة الموضحة" type="number" value={value} onChange={(e) => setValue(e.target.value)} slotProps={{ htmlInput: { step: 0.01, min: 0 } }} />
                <TextField label="تاريخ الاختبار" type="date" value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <Button type="submit" variant="contained" loading={save.isPending}>حفظ الاختبار</Button>
              </Stack>
            </SectionCard>
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <SectionCard title="سجل الاختبارات" noPadding>
              <DataTable rows={records.data ?? []} columns={columns} loading={records.isFetching} emptyText="لا توجد اختبارات" emptyHint="سجّل أول نتيجة من النموذج." />
            </SectionCard>
          </Grid>
        </Grid>
      )}
    </>
  );
}
