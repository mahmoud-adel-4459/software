import AssessmentIcon from '@mui/icons-material/AssessmentOutlined';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PreviewIcon from '@mui/icons-material/VisibilityOutlined';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import TableIcon from '@mui/icons-material/TableChartOutlined';
import WarningIcon from '@mui/icons-material/WarningAmberOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { bridge, unwrap } from '@/api/client';
import { api } from '@/api/endpoints';
import type { AnalyticReport, AnalyticReportQuery, ExcelSheet, ReportKpi, ReportTable, ReportTopic, Soldier } from '@/api/types';
import { EmptyState, KpiCard, PageHeader, SectionCard, SegmentedTabs } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { SoldierLookup } from '@/components/SoldierLookup';
import { addDays, formatDateTime, startOfMonth, todayCairo } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';

const TOPICS: { id: ReportTopic; label: string; unitOnly?: boolean; groupOnly?: boolean }[] = [
  { id: 'gate', label: 'البوابة والتصاريح' }, { id: 'leave', label: 'الإجازات' }, { id: 'fitness', label: 'اللياقة والتدريب' },
  { id: 'penalty', label: 'الجزاءات والغرامات' }, { id: 'reward', label: 'المكافآت' }, { id: 'grant', label: 'المنح' },
  { id: 'medical', label: 'الموقف الطبي' }, { id: 'security', label: 'الموقف الأمني' }, { id: 'evaluation', label: 'التقييمات' },
  { id: 'canteen', label: 'الكانتين' }, { id: 'buffet', label: 'البوفيه' }, { id: 'roster', label: 'قوة الأفراد', groupOnly: true },
  { id: 'visitors', label: 'الزوار', unitOnly: true },
];

type PresetId = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'year' | 'lastYear';
function presetRange(p: PresetId): [string, string] {
  const today = todayCairo();
  if (p === 'today') return [today, today];
  if (p === 'yesterday') return [addDays(today, -1), addDays(today, -1)];
  if (p === 'week') return [addDays(today, -6), today];
  if (p === 'month') return [startOfMonth(today), today];
  if (p === 'lastMonth') {
    const end = addDays(startOfMonth(today), -1);
    return [startOfMonth(end), end];
  }
  const y = Number(today.slice(0, 4));
  return p === 'year' ? [`${y}-01-01`, today] : [`${y - 1}-01-01`, `${y - 1}-12-31`];
}
const PRESETS: [PresetId, string][] = [
  ['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'آخر 7 أيام'], ['month', 'هذا الشهر'],
  ['lastMonth', 'الشهر الماضي'], ['year', 'هذه السنة'], ['lastYear', 'السنة الماضية'],
];

const display = (value: unknown, type?: string) => {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return `${Number(value).toFixed(2)} ج.م`;
  if (type === 'percent') return `${value}%`;
  return String(value);
};
const kpiText = (k: ReportKpi) => (k.value === null ? '—' : `${k.value}${k.unit ? ` ${k.unit}` : ''}`);
const deltaOf = (k: ReportKpi) =>
  typeof k.value === 'number' && typeof k.previous === 'number' ? { percent: k.previous ? Math.round(((k.value - k.previous) / k.previous) * 1000) / 10 : null } : undefined;

/** Multi-sheet workbook: summary, exceptions and one sheet per analysis table, with typed columns and SUM totals. */
function workbookOf(r: AnalyticReport): { fileName: string; sheets: ExcelSheet[] } {
  const header = [`${r.title} — ${r.subject.label}`, `${r.unit.name} · الفترة ${r.from} — ${r.to}${r.previous ? ` · مقارنة بـ ${r.previous.from} — ${r.previous.to}` : ''}`];
  const sheet = (name: string, t: ReportTable): ExcelSheet => ({
    name,
    title: [...header, t.title],
    columns: t.columns.map((c) => ({
      header: c.label, key: c.key,
      ...(c.type === 'money' || c.type === 'percent' || c.type === 'number' ? { format: c.type } : {}),
      ...(c.total ? { total: 'sum' as const } : {}),
    })),
    rows: t.rows,
  });
  const summary: ExcelSheet = {
    name: 'الملخص',
    title: header,
    columns: [{ header: 'المؤشر', key: 'label', width: 48 }, { header: 'القيمة', key: 'value' }, { header: 'الوحدة', key: 'unit' },
      ...(r.previous ? [{ header: 'الفترة السابقة', key: 'previous' }, { header: 'التغير', key: 'change' }] : [])],
    rows: [...r.summary, ...r.sections.flatMap((s) => s.kpis.map((k) => ({ ...k, label: `${s.title} — ${k.label}` })))].map((k) => ({
      label: k.label, value: k.value, unit: k.unit ?? '', previous: k.previous ?? null,
      change: typeof k.value === 'number' && typeof k.previous === 'number' ? Math.round((k.value - k.previous) * 100) / 100 : null,
    })),
  };
  const sheets = [summary];
  if (r.profile) sheets.push(sheet('البيانات الأساسية', r.profile));
  r.exceptions.forEach((t) => sheets.push(sheet(`تنبيه - ${t.title}`, t)));
  r.sections.forEach((s) => s.tables.forEach((t) => sheets.push(sheet(`${s.title} - ${t.title}`, t))));
  return { fileName: `تقرير-${r.subject.label}-${r.from}-${r.to}`.replace(/[\\/:*?"<>|]/g, ' '), sheets: sheets.slice(0, 80) };
}

function ReportTableView({ table }: { table: ReportTable }) {
  const columns: Column<Record<string, unknown> & { id: string }>[] = table.columns.map((c) => ({
    field: c.key, headerName: c.label, flex: 1, minWidth: c.type === 'money' || c.type === 'percent' ? 110 : 140,
    valueGetter: (_v, row) => display(row[c.key], c.type),
  }));
  const totals = table.columns.filter((c) => c.total).map((c) => `${c.label}: ${display(Math.round(table.rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0) * 100) / 100, c.type)}`);
  return (
    <Box sx={{ mb: 2.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{table.title}</Typography>
        <Chip size="small" label={`${table.rows.length} صف`} />
        {totals.length > 0 && table.rows.length > 0 && <Chip size="small" color="primary" variant="outlined" label={`الإجمالي — ${totals.join(' · ')}`} />}
      </Stack>
      <DataTable rows={table.rows.map((r, i) => ({ ...r, id: String(i) }))} columns={columns} pageSize={10} emptyText="لا توجد بيانات في هذه الفترة" />
    </Box>
  );
}

function PrintDialog({ open, onClose, onPrint, defaultPrinter }: { open: boolean; onClose: () => void; onPrint: (printer: string, copies: number) => Promise<void>; defaultPrinter: string }) {
  const printers = useQuery({ queryKey: ['printers'], queryFn: () => unwrap(bridge().printers()), enabled: open });
  const [printer, setPrinter] = useState('');
  const [copies, setCopies] = useState('1');
  const [busy, setBusy] = useState(false);
  const list = printers.data ?? [];
  const chosen = printer || defaultPrinter || list.find((p) => p.isDefault)?.name || '';
  const virtual = /pdf|onenote|xps|fax/i.test(chosen);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>طباعة التقرير على طابعة</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="الطابعة" value={chosen} onChange={(e) => setPrinter(e.target.value)} disabled={printers.isPending}
            helperText="الافتراضي «طابعة المكتب» من الإعدادات. يُطبع على ورق A4 بتنسيق المذكرة الرسمية.">
            {list.map((p) => <MenuItem key={p.name} value={p.name}>{p.displayName}{p.name === defaultPrinter ? ' — طابعة المكتب' : ''}{p.isDefault ? ' (افتراضي ويندوز)' : ''}</MenuItem>)}
          </TextField>
          {virtual && <Alert severity="warning">هذه طابعة افتراضية (ملف وليست ورق). للطباعة الورقية اختر الطابعة الفعلية؛ ولحفظ ملف استخدم زر «حفظ PDF».</Alert>}
          <TextField label="عدد النسخ" type="number" value={copies} onChange={(e) => setCopies(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 20 } }} sx={{ maxWidth: 160 }} />
          {printers.isError && <Alert severity="error">تعذر قراءة الطابعات من ويندوز.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy}>إلغاء</Button>
        <Button variant="contained" startIcon={<PrintIcon />} loading={busy} disabled={!chosen} onClick={async () => {
          const n = Number(copies);
          if (!Number.isInteger(n) || n < 1 || n > 20) return notify.error('عدد النسخ من 1 إلى 20');
          setBusy(true);
          try { await onPrint(chosen, n); onClose(); } finally { setBusy(false); }
        }}>طباعة</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Report center: any subject (unit, company, soldier), any period, chosen topics, comparison, preview, print, PDF and Excel. */
export function ReportCenterPage() {
  const catalog = useCatalog();
  const [subject, setSubject] = useState<AnalyticReportQuery['subject']>('unit');
  const [company, setCompany] = useState('');
  const [soldier, setSoldier] = useState<Soldier | null>(null);
  const [[from, to], setRange] = useState<[string, string]>(presetRange('month'));
  const [topics, setTopics] = useState<ReportTopic[]>(TOPICS.map((t) => t.id));
  const [compare, setCompare] = useState(true);
  const [query, setQuery] = useState<AnalyticReportQuery | null>(null);
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const companies = useQuery({ queryKey: ['report-companies'], queryFn: () => api.dailyReport(todayCairo()), staleTime: 5 * 60_000 });
  const report = useQuery({ queryKey: ['analytic-report', query], queryFn: () => api.analyticReport(query!), enabled: Boolean(query) });
  const r = report.data;
  const available = TOPICS.filter((t) => !(t.unitOnly && subject !== 'unit') && !(t.groupOnly && subject === 'soldier'));
  const chosen = topics.filter((t) => available.some((a) => a.id === t));

  const build = () => {
    if (from > to) return notify.error('تاريخ البداية بعد النهاية');
    if (subject === 'company' && !company) return notify.error('اختر السرية');
    if (subject === 'soldier' && !soldier) return notify.error('اختر العسكري');
    if (!chosen.length) return notify.error('اختر قسمًا واحدًا على الأقل');
    setQuery({
      subject, from, to, topics: chosen.join(','), ...(compare ? { compare: '1' as const } : {}),
      ...(subject === 'company' ? { company } : {}), ...(subject === 'soldier' ? { soldierId: soldier!.id } : {}),
    });
  };
  const doc = async (mode: 'preview' | 'pdf' | 'print', printer?: string, copies?: number) => {
    if (!query) return;
    setBusy(mode);
    try {
      const done = await api.document({ type: 'analytic-report', mode, query, ...(printer ? { printer, printCopies: copies } : {}) });
      if (done && mode === 'print') notify.success(`تم إرسال التقرير إلى ${printer}`);
      if (done && mode === 'pdf') notify.success('تم حفظ PDF');
    } catch (e) { notify.apiError(e); }
    finally { setBusy(null); }
  };
  const excel = async () => {
    if (!r) return;
    setBusy('excel');
    try { if (await unwrap(bridge().excelExport(workbookOf(r)))) notify.success('تم حفظ ملف Excel'); }
    catch (e) { notify.apiError(e); }
    finally { setBusy(null); }
  };
  const companyList = useMemo(() => (companies.data?.snapshot.soldiers.byCompany ?? []).map((c) => c.company).filter((c) => c !== '—'), [companies.data]);

  return (
    <>
      <PageHeader title="مركز التقارير" description="تقرير تحليلي مفصل عن الوحدة أو سرية أو عسكري، لأي فترة، مع مقارنة واستثناءات — معاينة وطباعة على أي طابعة و PDF و Excel." />
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2.5 }}>
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>1. التقرير عن</Typography>
            <SegmentedTabs id="report-subject" value={subject} onChange={setSubject}
              options={[{ value: 'unit', label: 'الوحدة كلها' }, { value: 'company', label: 'سرية' }, { value: 'soldier', label: 'عسكري' }]} />
            <Box sx={{ mt: 1.5 }}>
              {subject === 'company' && (
                <TextField select label="السرية" value={company} onChange={(e) => setCompany(e.target.value)} sx={{ minWidth: 260 }}>
                  {companyList.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </TextField>
              )}
              {subject === 'soldier' && <SoldierLookup selected={soldier} onSelect={setSoldier} />}
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>2. الفترة</Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              {PRESETS.map(([id, label]) => {
                const [a, b] = presetRange(id);
                return <Chip key={id} label={label} color={a === from && b === to ? 'primary' : 'default'} onClick={() => setRange([a, b])} />;
              })}
            </Stack>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <TextField label="من" type="date" size="small" value={from} onChange={(e) => setRange([e.target.value, to])} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="إلى" type="date" size="small" value={to} onChange={(e) => setRange([from, e.target.value])} slotProps={{ inputLabel: { shrink: true } }} />
              <FormControlLabel control={<Checkbox checked={compare} onChange={(_e, c) => setCompare(c)} />} label="مقارنة بالفترة السابقة" />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>3. الأقسام</Typography>
              <Button size="small" onClick={() => setTopics(TOPICS.map((t) => t.id))}>الكل</Button>
              <Button size="small" onClick={() => setTopics([])}>لا شيء</Button>
            </Stack>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {available.map((t) => {
                const on = topics.includes(t.id);
                return <Chip key={t.id} label={t.label} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                  onClick={() => setTopics((cur) => (on ? cur.filter((x) => x !== t.id) : [...cur, t.id]))} />;
              })}
            </Stack>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Button variant="contained" size="large" startIcon={<AssessmentIcon />} loading={report.isFetching} onClick={build}>إنشاء التقرير</Button>
          </Grid>
        </Grid>
      </Paper>

      {report.isError && <Alert severity="error" sx={{ mb: 2 }}>{report.error.message}</Alert>}
      {!query && <EmptyState title="اختر موضوع التقرير والفترة والأقسام ثم «إنشاء التقرير»" hint="مثال: سرية — الشهر الماضي — الإجازات والجزاءات — مع المقارنة." />}
      {r && (
        <>
          <Paper variant="outlined" sx={{ p: 2, mb: 2.5, position: 'sticky', top: 8, zIndex: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h4">{r.title} — {r.subject.label}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {r.unit.name} · {r.from === r.to ? r.from : `${r.from} — ${r.to}`} ({r.days} يوم){r.previous ? ` · مقارنة بـ ${r.previous.from} — ${r.previous.to}` : ''} · {formatDateTime(r.generatedAt)}
                </Typography>
              </Box>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Button variant="tonal" startIcon={<PreviewIcon />} loading={busy === 'preview'} onClick={() => doc('preview')}>معاينة الطباعة</Button>
                <Button variant="contained" startIcon={<PrintIcon />} onClick={() => setPrinting(true)}>طباعة…</Button>
                <Button variant="tonal" startIcon={<PdfIcon />} loading={busy === 'pdf'} onClick={() => doc('pdf')}>حفظ PDF</Button>
                <Button variant="tonal" startIcon={<TableIcon />} loading={busy === 'excel'} onClick={excel}>Excel</Button>
              </Stack>
            </Stack>
          </Paper>

          <SectionCard title="الملخص التنفيذي" subtitle={r.previous ? 'النسبة بجانب كل مؤشر = التغير عن الفترة السابقة' : undefined}>
            <Grid container spacing={2}>
              {r.summary.map((k) => (
                <Grid key={k.label} size={{ xs: 12, sm: 6, md: 4, xl: 3 }}><KpiCard label={k.label} value={kpiText(k)} delta={deltaOf(k)} /></Grid>
              ))}
            </Grid>
          </SectionCard>

          {r.profile && <SectionCard title="البيانات الأساسية"><ReportTableView table={r.profile} /></SectionCard>}

          <SectionCard title="استثناءات تحتاج انتباه" badge={<Chip size="small" color={r.exceptions.length ? 'warning' : 'success'} label={r.exceptions.length ? `${r.exceptions.length} تنبيه` : 'لا توجد'} />}>
            {r.exceptions.length
              ? r.exceptions.map((t) => <Box key={t.title}><Alert icon={<WarningIcon />} severity="warning" sx={{ mb: 1 }}>{t.title}: {t.rows.length}</Alert><ReportTableView table={t} /></Box>)
              : <Alert severity="success">لا توجد استثناءات في هذه الفترة.</Alert>}
          </SectionCard>

          {r.sections.map((s, i) => (
            <Accordion key={s.id} defaultExpanded={i < 2} sx={{ mb: 1.5 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 800, flex: 1 }}>{s.title}</Typography>
                <Typography variant="body2" color="text.secondary">{s.kpis.slice(0, 3).map((k) => `${k.label}: ${kpiText(k)}`).join(' · ')}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  {s.kpis.map((k) => <Grid key={k.label} size={{ xs: 12, sm: 6, md: 3 }}><KpiCard label={k.label} value={kpiText(k)} delta={deltaOf(k)} /></Grid>)}
                </Grid>
                {s.tables.map((t) => <ReportTableView key={t.title} table={t} />)}
              </AccordionDetails>
            </Accordion>
          ))}
        </>
      )}
      <PrintDialog open={printing} onClose={() => setPrinting(false)} defaultPrinter={catalog.data?.settings.printer ?? ''}
        onPrint={(printer, copies) => doc('print', printer, copies)} />
    </>
  );
}
