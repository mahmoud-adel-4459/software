import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/endpoints';
import type { SoldierEvaluation } from '@/api/types';
import { SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { dayOnly } from '@/lib/format';

type TestRow = SoldierEvaluation['tests'][number] & { id: string };

/** Fitness percentages against the Settings standards, the suggested grade and the administrator's final grade. */
export function EvaluationCard({ soldierId }: { soldierId: string }) {
  const evaluation = useQuery({ queryKey: ['soldier-evaluation', soldierId], queryFn: () => api.soldierEvaluation(soldierId) });
  const e = evaluation.data;
  const columns: Column<TestRow>[] = [
    { field: 'name', headerName: 'الاختبار', flex: 1, minWidth: 150 },
    { field: 'target', headerName: 'المعيار', width: 120, valueGetter: (_v, r) => `${r.target} ${r.unit}` },
    { field: 'value', headerName: 'آخر نتيجة', width: 130, valueGetter: (_v, r) => (r.value == null ? '—' : `${r.value} ${r.unit}`) },
    { field: 'date', headerName: 'التاريخ', width: 120, valueGetter: (_v, r) => (r.date ? dayOnly(r.date) : '—') },
    { field: 'score', headerName: 'النسبة', width: 100, renderCell: (c) => (c.row.score == null ? '—' : <b className="num">{`${c.row.score}%`}</b>) },
  ];
  return (
    <SectionCard title="التقييم" subtitle="النسبة من معايير اللياقة في الإعدادات (آخر نتيجة لكل اختبار). التقدير النهائي يُسجَّل من تبويب «التقييم النهائي» أدناه.">
      {evaluation.isError && <Alert severity="error">{evaluation.error.message}</Alert>}
      {e && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mb: 2 }}>
          <Stat label="متوسط اللياقة" value={e.average == null ? '—' : `${e.average}%`} hint={`${e.testedCount} من ${e.tests.length} اختبار`} />
          <Stat label="التقدير المقترح" value={e.suggestedGrade ?? '—'} />
          <Stat label="التقدير النهائي" value={e.finalGrade?.grade ?? 'لم يُحدد'} hint={e.finalGrade ? e.finalGrade.date : 'يحدده المسؤول'} strong />
        </Stack>
      )}
      <DataTable rows={(e?.tests ?? []).map((t) => ({ ...t, id: t.name }))} columns={columns} loading={evaluation.isPending} pageSize={10}
        emptyText="لا توجد معايير لياقة" emptyHint="أضف المعايير من الإعدادات." />
    </SectionCard>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant={strong ? 'h3' : 'h4'} sx={{ fontWeight: 800 }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Box>
  );
}
