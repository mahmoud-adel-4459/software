import { zodResolver } from '@hookform/resolvers/zod';
import AddIcon from '@mui/icons-material/AddOutlined';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { bridge, post, unwrap } from '@/api/client';
import type { Outlet, OutletKind, VisitorCategory, VisitorTier } from '@/api/types';
import { PageHeader, SectionCard } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { RhfSelect, RhfText, SelectField } from '@/components/Fields';
import { RowActions, ToneChip } from '@/components/interactive';
import { OUTLET_LABELS, TIER_LABELS } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useCatalog } from '@/lib/queries';
import { LOGO_SRC } from '@/lib/brand';
import { ReceiptPrinterCard, receiptFrom } from './ReceiptPrinterCard';
import { ExitReasonsCard } from './ExitReasonsCard';
import { MemoSettingsCard } from './MemoSettingsCard';
import { NetworkCard } from './NetworkCard';
import { SoldierListsCard } from './SoldierListsCard';
import { UnitPolicyCard } from './UnitPolicyCard';

const schema = z.object({
  unitName: z.string().trim().min(1, 'اسم الوحدة مطلوب').max(100),
  parentFormation: z.string().max(100).optional(),
  paper: z.enum(['A4', 'A5']),
  margins: z.enum(['normal', 'narrow']),
  printer: z.string().optional(),
  labelPrinter: z.string().optional(),
  receiptPrinter: z.string().optional(),
  labelPreset: z.string(),
  labelWidthMm: z.coerce.number().min(20, 'العرض من 20 إلى 120 مم').max(120, 'العرض من 20 إلى 120 مم'),
  labelHeightMm: z.coerce.number().min(15, 'الارتفاع من 15 إلى 200 مم').max(200, 'الارتفاع من 15 إلى 200 مم'),
  silentPrint: z.boolean(),
  showLogo: z.boolean(),
  autoBackup: z.boolean(),
  autoBackupIntervalHours: z.string(),
  backupRetentionDays: z.coerce.number().int().min(7, 'من 7 إلى 365 يومًا').max(365, 'من 7 إلى 365 يومًا'),
});
type Values = z.input<typeof schema>;

const LABEL_PRESETS = [
  { value: '45x50', label: '4.5×5 سم (45×50 مم)' },
  { value: '89x102', label: '3.5×4 بوصة (89×102 مم)' },
  { value: '100x100', label: '100×100 مم' },
  { value: '80x60', label: '80×60 مم' },
  { value: '60x40', label: '60×40 مم' },
  { value: '50x30', label: '50×30 مم' },
  { value: 'custom', label: 'مقاس مخصص' },
];
const labelPresetOf = (w: number, h: number) => (LABEL_PRESETS.some((p) => p.value === `${w}x${h}`) ? `${w}x${h}` : 'custom');
const PRINTER_KINDS = [
  { kind: 'label' as const, field: 'labelPrinter' as const, title: 'طابعة الملصقات (XP-246B)', hint: 'ملصقات QR للعسكريين والزوار' },
  { kind: 'receipt' as const, field: 'receiptPrinter' as const, title: 'طابعة الإيصالات (XP-90)', hint: 'تصاريح البوابة وإيصالات الكانتين' },
  { kind: 'office' as const, field: 'printer' as const, title: 'طابعة المكتب (A4/A5)', hint: 'التقارير والبطاقات وكشوف الحساب' },
];

/** Unit settings: info, printing, logo, backup policy, outlets, visitor categories, fixed reasons. */
export function SettingsPage() {
  const catalog = useCatalog();
  if (!catalog.data) return <Skeleton variant="rounded" height={420} />;
  return (
    <>
      <PageHeader title="الإعدادات" description="الشعار، الكانتينات والبوفيهات، فئات الزوار، أسباب الخروج، وخيارات الطباعة." />
      <NetworkCard />
      <UnitForm />
      <MemoSettingsCard key={`memo-${catalog.data.settings.version}`} settings={catalog.data.settings} />
      <OutletsBlock kind="canteen" />
      <OutletsBlock kind="buffet" />
      <CategoriesBlock />
      <ExitReasonsCard key={catalog.data.settings.version} settings={catalog.data.settings} reasons={catalog.data.exitReasons} />
      <SoldierListsCard key={`lists-${catalog.data.settings.version}`} settings={catalog.data.settings} grades={catalog.data.soldierGrades} ranks={catalog.data.soldierRanks} />
      <UnitPolicyCard key={`policy-${catalog.data.settings.version}`} settings={catalog.data.settings}
        gateMinMinutes={catalog.data.gateMinMinutes ?? 0} standards={catalog.data.fitnessStandards ?? []} gradeScale={catalog.data.gradeScale ?? []} />
    </>
  );
}

function UnitForm() {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const s = catalog.data!.settings;
  const printers = useQuery({ queryKey: ['printers'], queryFn: () => unwrap(bridge().printers()), retry: false });
  const [logo, setLogo] = useState<string | null | undefined>(undefined); // undefined = unchanged
  const pendingPrint = useRef(false);
  const [printingKind, setPrintingKind] = useState<'label' | 'receipt' | 'office' | null>(null);
  const shownLogo = logo === undefined ? s.logo : logo;
  const { control, handleSubmit, formState, watch, setValue } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      unitName: s.unitName, parentFormation: s.parentFormation ?? '', paper: s.paper, margins: s.margins, printer: s.printer ?? '',
      labelPrinter: s.labelPrinter ?? '', receiptPrinter: s.receiptPrinter ?? '',
      labelPreset: labelPresetOf(s.labelWidthMm ?? 89, s.labelHeightMm ?? 102), labelWidthMm: s.labelWidthMm ?? 89, labelHeightMm: s.labelHeightMm ?? 102,
      silentPrint: s.silentPrint === true,
      showLogo: s.showLogo,
      autoBackup: s.autoBackup !== false, autoBackupIntervalHours: String(s.autoBackupIntervalHours ?? 24), backupRetentionDays: s.backupRetentionDays ?? 30,
    },
  });
  const pickLogo = async () => {
    try {
      const file = await unwrap(bridge().pickAttachment());
      if (!file) return;
      if (!file.mime.startsWith('image/')) return notify.error('اختر صورة PNG أو JPEG');
      setLogo(`data:${file.mime};base64,${file.content}`);
      notify.info('تم اختيار الشعار؛ اضغط حفظ');
    } catch (e) {
      notify.apiError(e);
    }
  };
  const printerOptions = [{ value: '', label: 'الافتراضي' }, ...(printers.data ?? []).map((p) => ({ value: p.name, label: (p.displayName || p.name) + (p.isDefault ? ' (افتراضية)' : '') }))];
  const preset = watch('labelPreset');
  const pickPreset = (value: string) => {
    setValue('labelPreset', value);
    if (value !== 'custom') {
      const [w, h] = value.split('x').map(Number);
      setValue('labelWidthMm', w);
      setValue('labelHeightMm', h);
    }
  };
  const testPrint = async (kind: 'label' | 'receipt' | 'office') => {
    if (pendingPrint.current) return;
    pendingPrint.current = true;
    setPrintingKind(kind);
    try {
      await unwrap(bridge().testPrint({ kind }));
      notify.success('تم إرسال الطباعة الاختبارية');
    } catch (e) {
      notify.apiError(e);
    } finally {
      pendingPrint.current = false;
      setPrintingKind(null);
    }
  };
  const submit = handleSubmit(async (raw) => {
    const v = schema.parse(raw);
    try {
      await post('/api/settings', {
        unitName: v.unitName, parentFormation: v.parentFormation ?? '', paper: v.paper, margins: v.margins, printer: v.printer ?? '',
        labelPrinter: v.labelPrinter ?? '', receiptPrinter: v.receiptPrinter ?? '',
        labelWidthMm: v.labelWidthMm, labelHeightMm: v.labelHeightMm, silentPrint: v.silentPrint, ...receiptFrom(s),
        exitReasons: catalog.data!.exitReasons,
        showLogo: v.showLogo, logo: logo === undefined ? s.logo : logo,
        autoBackup: v.autoBackup, autoBackupIntervalHours: Number(v.autoBackupIntervalHours), backupRetentionDays: v.backupRetentionDays,
        version: s.version,
      });
      setLogo(undefined);
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
      notify.success('تم حفظ الإعدادات');
    } catch (e) {
      notify.apiError(e);
    }
  });
  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="بيانات الوحدة والطباعة">
            <Stack spacing={2}>
              <RhfText control={control} name="unitName" label="اسم الوحدة" />
              <RhfText control={control} name="parentFormation" label="التشكيل الأعلى" />
              <Stack direction="row" spacing={2}>
                <RhfSelect control={control} name="paper" label="مقاس الورق" options={[{ value: 'A4', label: 'A4' }, { value: 'A5', label: 'A5' }]} />
                <RhfSelect control={control} name="margins" label="الهوامش" options={[{ value: 'normal', label: 'عادية' }, { value: 'narrow', label: 'ضيقة' }]} />
              </Stack>
            </Stack>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="الشعار">
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Avatar variant="rounded" src={shownLogo || LOGO_SRC} sx={{ width: 72, height: 72, bgcolor: 'transparent', '& img': { objectFit: 'contain' } }} />
              <Button variant="tonal" onClick={pickLogo}>اختيار الشعار</Button>
              <Button variant="tonal" color="inherit" disabled={!shownLogo} onClick={() => { setLogo(null); notify.info('اضغط حفظ لتأكيد إزالة الشعار'); }}>إزالة الشعار</Button>
              <Controller control={control} name="showLogo" render={({ field }) => <FormControlLabel control={<Switch checked={Boolean(field.value)} onChange={(_e, c) => field.onChange(c)} />} label="إظهار شعار الوحدة في المستندات" />} />
            </Stack>
          </SectionCard>
          <SectionCard title="النسخ الاحتياطي التلقائي">
            <Stack spacing={2}>
              <Controller control={control} name="autoBackup" render={({ field }) => <FormControlLabel control={<Switch checked={Boolean(field.value)} onChange={(_e, c) => field.onChange(c)} />} label="تفعيل النسخ الدوري على هذا الجهاز/الخادم" />} />
              <RhfSelect control={control} name="autoBackupIntervalHours" label="كل كم ساعة" options={[{ value: '6', label: '6 ساعات' }, { value: '12', label: '12 ساعة' }, { value: '24', label: '24 ساعة (يومي)' }, { value: '48', label: '48 ساعة' }]} />
              <RhfText control={control} name="backupRetentionDays" label="احتفاظ بالنسخ (أيام)" type="number" />
            </Stack>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <SectionCard title="الطباعة">
            <Stack spacing={2.5}>
              <Alert severity="info">اضبط طابعة لكل نوع مستند. «الافتراضي» يعني طابعة النظام. الطباعة الاختبارية تستخدم آخر إعدادات محفوظة؛ احفظ أولًا.</Alert>
              {PRINTER_KINDS.map((p) => (
                <Stack key={p.kind} direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
                  <Box sx={{ flex: 1 }}>
                    <RhfSelect control={control} name={p.field} label={p.title} helperText={p.hint} options={printerOptions} />
                  </Box>
                  <Button variant="tonal" startIcon={<PrintIcon />} loading={printingKind === p.kind} disabled={printingKind !== null && printingKind !== p.kind} onClick={() => testPrint(p.kind)}>طباعة اختبارية — {p.kind === 'label' ? 'ملصق' : p.kind === 'receipt' ? 'إيصال' : 'ورقة'}</Button>
                </Stack>
              ))}
              {printers.isError && <Alert severity="warning">تعذر قراءة قائمة الطابعات من النظام.</Alert>}
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField select label="مقاس الملصق" value={preset} onChange={(e) => pickPreset(e.target.value)} sx={{ minWidth: 220 }}>
                  {LABEL_PRESETS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </TextField>
                {preset === 'custom' && (
                  <>
                    <RhfText control={control} name="labelWidthMm" label="عرض الملصق (مم)" type="number" />
                    <RhfText control={control} name="labelHeightMm" label="ارتفاع الملصق (مم)" type="number" />
                  </>
                )}
              </Stack>
              <Alert severity="info">الملصق بدون شعار. اختَر مقاس الملصق الواحد الفعلي بدون الفراغ بين الملصقات، واضبط نفس العرض والارتفاع في تعريف الطابعة. لو الطابعة تتخطى ملصقًا، عاير حساس الفراغات من إعدادات الطابعة. احفظ قبل الطباعة الاختبارية.</Alert>
              <Controller control={control} name="silentPrint" render={({ field }) => <FormControlLabel control={<Switch checked={Boolean(field.value)} onChange={(_e, c) => field.onChange(c)} />} label="طباعة مباشرة بدون نافذة (عند تحديد طابعة)" />} />
            </Stack>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <ReceiptPrinterCard settings={s} />
        </Grid>
      </Grid>
      <Button type="submit" variant="contained" size="large" loading={formState.isSubmitting} sx={{ mb: 3 }}>حفظ الإعدادات</Button>
    </Box>
  );
}

function AddRow({ label, onAdd, children }: { label: string; onAdd: (name: string) => Promise<unknown>; children?: React.ReactNode }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Stack component="form" direction="row" spacing={1.5} sx={{ mb: 2 }} onSubmit={async (e) => {
      e.preventDefault();
      if (!name.trim()) return notify.error(`أدخل ${label}`);
      setBusy(true);
      try { await onAdd(name.trim()); setName(''); } finally { setBusy(false); }
    }}>
      <TextField label={label} value={name} onChange={(e) => setName(e.target.value)} sx={{ maxWidth: 320 }} />
      {children}
      <Button type="submit" variant="contained" startIcon={<AddIcon />} loading={busy}>إضافة</Button>
    </Stack>
  );
}

function OutletsBlock({ kind }: { kind: OutletKind }) {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const rows = (catalog.data?.outletsAll ?? []).filter((o) => o.kind === kind);
  const label = OUTLET_LABELS[kind];
  const done = async (m: string) => { notify.success(m); await queryClient.invalidateQueries({ queryKey: ['catalog'] }); };
  const cols: Column<Outlet>[] = [
    { field: 'name', headerName: 'الاسم', flex: 1, minWidth: 180 },
    { field: 'disabled', headerName: 'الحالة', width: 120, renderCell: (c) => <ToneChip tone={c.row.disabled ? 'neutral' : 'success'} label={c.row.disabled ? 'معطل' : 'نشط'} /> },
    { field: 'id', headerName: '', width: 60, sortable: false, renderCell: (c) => <RowActions actions={[{ label: c.row.disabled ? 'تفعيل' : 'تعطيل', danger: !c.row.disabled, onClick: () => void post('/api/outlets/update', { id: c.row.id, disabled: !c.row.disabled }).then(() => done(c.row.disabled ? 'تم التفعيل' : 'تم التعطيل')).catch(notify.apiError) }]} /> },
  ];
  return (
    <SectionCard title={kind === 'buffet' ? 'بوفيهات الوحدة' : 'كانتينات الوحدة'}>
      <AddRow label={`اسم ${label} جديد`} onAdd={(name) => post('/api/outlets', { name, kind }).then(() => done(`تمت إضافة ${label}`)).catch(notify.apiError)} />
      <DataTable rows={rows} columns={cols} pageSize={10} emptyText={`لا يوجد ${label}`} />
    </SectionCard>
  );
}

function CategoriesBlock() {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const [tier, setTier] = useState<VisitorTier>('normal');
  const rows = catalog.data?.visitorCategoriesAll ?? [];
  const done = async (m: string) => { notify.success(m); await queryClient.invalidateQueries({ queryKey: ['catalog'] }); };
  const cols: Column<VisitorCategory>[] = [
    { field: 'name', headerName: 'الاسم', flex: 1, minWidth: 180 },
    { field: 'tier', headerName: 'النوع', width: 120, valueFormatter: (v: VisitorTier) => TIER_LABELS[v] },
    { field: 'disabled', headerName: 'الحالة', width: 120, renderCell: (c) => <ToneChip tone={c.row.disabled ? 'neutral' : 'success'} label={c.row.disabled ? 'معطل' : 'نشط'} /> },
    { field: 'id', headerName: '', width: 60, sortable: false, renderCell: (c) => <RowActions actions={[{ label: c.row.disabled ? 'تفعيل' : 'تعطيل', danger: !c.row.disabled, onClick: () => void post('/api/visitor-categories/update', { id: c.row.id, disabled: !c.row.disabled }).then(() => done(c.row.disabled ? 'تم تفعيل الفئة' : 'تم تعطيل الفئة')).catch(notify.apiError) }]} /> },
  ];
  return (
    <SectionCard title="فئات الزوار">
      <AddRow label="اسم فئة جديدة" onAdd={(name) => post('/api/visitor-categories', { name, tier }).then(() => done('تمت إضافة الفئة')).catch(notify.apiError)}>
        <SelectField label="النوع" value={tier} onChange={(v) => setTier(v as VisitorTier)} options={(Object.keys(TIER_LABELS) as VisitorTier[]).map((t) => ({ value: t, label: TIER_LABELS[t] }))} minWidth={140} />
      </AddRow>
      <DataTable rows={rows} columns={cols} pageSize={10} emptyText="لا توجد فئات" />
    </SectionCard>
  );
}
