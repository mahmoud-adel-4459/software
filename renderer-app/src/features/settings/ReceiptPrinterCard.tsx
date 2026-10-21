import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { bridge, post, unwrap } from '@/api/client';
import type { UnitSettings } from '@/api/types';
import { SectionCard } from '@/components/basic';
import { RhfText } from '@/components/Fields';
import { notify } from '@/lib/notify';

const range = (min: number, max: number, what: string, unit = 'مم') => `${what} من ${min} إلى ${max} ${unit}`.trim();
const num = (min: number, max: number, what: string, unit?: string) =>
  z.coerce.number({ error: range(min, max, what, unit) }).min(min, range(min, max, what, unit)).max(max, range(min, max, what, unit));

export const receiptSchema = z
  .object({
    receiptWidthMm: num(48, 110, 'عرض الورق'),
    receiptPrintableWidthMm: num(40, 108, 'منطقة الطباعة'),
    receiptMarginMm: num(0, 10, 'الهامش'),
    receiptFontPt: num(7, 18, 'حجم الخط', 'نقطة'),
    receiptLineHeight: num(1, 2.2, 'تباعد الأسطر', ''),
    receiptBold: z.boolean(),
    receiptShowLogo: z.boolean(),
    receiptLogoMm: num(10, 40, 'حجم الشعار'),
    receiptHeightMode: z.enum(['auto', 'fixed']),
    receiptHeightMm: num(40, 400, 'ارتفاع الإيصال'),
    receiptCopies: z.coerce.number().int('عدد صحيح').min(1, 'من 1 إلى 3 نسخ').max(3, 'من 1 إلى 3 نسخ'),
    receiptFooter: z.string().max(120, 'حتى 120 حرفًا'),
    receiptTopFeedMm: num(0, 20, 'تغذية الأعلى'),
    receiptBottomFeedMm: num(0, 30, 'تغذية الأسفل'),
  })
  .superRefine((v, ctx) => {
    if (v.receiptPrintableWidthMm > v.receiptWidthMm)
      ctx.addIssue({ code: 'custom', path: ['receiptPrintableWidthMm'], message: 'منطقة الطباعة يجب ألا تتجاوز عرض الورق' });
    else if (v.receiptPrintableWidthMm - 2 * v.receiptMarginMm < 20)
      ctx.addIssue({ code: 'custom', path: ['receiptMarginMm'], message: 'الهامش كبير جدًا بالنسبة لمنطقة الطباعة' });
  });
export type ReceiptValues = z.input<typeof receiptSchema>;
type ReceiptNumbers = z.output<typeof receiptSchema>;

export const RECEIPT_DEFAULTS = {
  receiptWidthMm: 80, receiptPrintableWidthMm: 72, receiptMarginMm: 1, receiptFontPt: 11, receiptLineHeight: 1.4,
  receiptBold: true, receiptShowLogo: true, receiptLogoMm: 20, receiptHeightMode: 'auto' as const, receiptHeightMm: 150,
  receiptCopies: 1, receiptFooter: '', receiptTopFeedMm: 2, receiptBottomFeedMm: 8,
};
export const RECEIPT_KEYS = Object.keys(RECEIPT_DEFAULTS) as (keyof typeof RECEIPT_DEFAULTS)[];

/** The receipt keys of saved settings, defaults filled in (so another form's save never resets them). */
export function receiptFrom(s: UnitSettings): typeof RECEIPT_DEFAULTS {
  const out: Record<string, unknown> = {};
  for (const k of RECEIPT_KEYS) out[k] = s[k] ?? RECEIPT_DEFAULTS[k];
  return out as typeof RECEIPT_DEFAULTS;
}

export const RECEIPT_PRESETS = [
  { value: 'xp90', label: 'XP-90 — ورق 80 مم', values: { receiptWidthMm: 80, receiptPrintableWidthMm: 72, receiptMarginMm: 1, receiptFontPt: 11 } },
  { value: '58', label: 'ورق 58 مم', values: { receiptWidthMm: 58, receiptPrintableWidthMm: 48, receiptMarginMm: 1, receiptFontPt: 10 } },
  { value: 'custom', label: 'مخصص', values: {} },
];
export const presetOf = (v: Partial<Record<keyof ReceiptValues, unknown>>) =>
  RECEIPT_PRESETS.find((p) => p.value !== 'custom' && Object.entries(p.values).every(([k, x]) => Number(v[k as keyof ReceiptValues]) === x))?.value ?? 'custom';

const MM_PX = 3.2; // preview scale: CSS px per millimetre
const unit = (text: string, step = 1) => ({ input: { endAdornment: <InputAdornment position="end">{text}</InputAdornment> }, htmlInput: { step } });

/** Live mock of the thermal receipt: paper, printable area, content box, font, weight, logo, footer. */
export function ReceiptPreview({ values }: { values: ReceiptValues }) {
  const n = (k: keyof ReceiptValues, d: number) => {
    const x = Number(values[k]);
    return Number.isFinite(x) && x > 0 ? x : d;
  };
  const width = n('receiptWidthMm', 80);
  const printable = Math.min(width, n('receiptPrintableWidthMm', 72));
  const margin = Number(values.receiptMarginMm) >= 0 ? Number(values.receiptMarginMm) : 1;
  const content = Math.max(20, printable - 2 * margin);
  const k = MM_PX;
  const fontPx = n('receiptFontPt', 11) * (96 / 72) * (k / 3.7795);
  const bold = values.receiptBold !== false;
  const logo = n('receiptLogoMm', 20) * k;
  const fixed = values.receiptHeightMode === 'fixed';
  const row = (label: string, value: string) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: `${2 * k}px`, my: '2px' }}>
      <span>{label}</span>
      <b style={{ textAlign: 'end', overflowWrap: 'anywhere' }}>{value}</b>
    </Box>
  );
  const dash = '1px dashed black';
  return (
    <Box data-testid="receipt-preview" sx={{ overflowX: 'auto', pb: 1 }}>
      <Box
        sx={{
          position: 'relative', width: width * k, mx: 'auto', bgcolor: 'white', color: 'black', boxShadow: 3,
          pt: `${n('receiptTopFeedMm', 2) * k}px`, pb: `${n('receiptBottomFeedMm', 8) * k}px`,
          minHeight: fixed ? n('receiptHeightMm', 150) * k : undefined, direction: 'rtl',
        }}
      >
        <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: ((width - printable) / 2) * k, width: printable * k, outline: '1px dashed gray', pointerEvents: 'none' }} />
        <Box
          data-testid="receipt-preview-content"
          sx={{ width: content * k, mx: 'auto', fontSize: fontPx, lineHeight: Number(values.receiptLineHeight) || 1.4, fontWeight: bold ? 600 : 500, overflowWrap: 'anywhere' }}
        >
          <Box sx={{ textAlign: 'center', pb: '4px', borderBottom: dash, mb: '4px' }}>
            {values.receiptShowLogo !== false && (
              <Box sx={{ width: logo, height: logo, maxWidth: '100%', mx: 'auto', mb: '3px', border: '2px solid black', display: 'grid', placeItems: 'center', fontSize: 10 }}>شعار</Box>
            )}
            <b style={{ fontSize: '1.2em' }}>الكتيبة الثالثة مشاة</b>
            <div style={{ fontSize: '.85em' }}>المنطقة المركزية</div>
          </Box>
          <div style={{ textAlign: 'center' }}><b>إذن خروج ودخول رقم 15</b></div>
          <div style={{ textAlign: 'center', borderBottom: dash, paddingBottom: 4, marginBottom: 4 }}>جندي / محمد عبد الرحمن</div>
          {row('الرقم العسكري', '000012345')}
          {row('السرية', 'الأولى')}
          {row('سبب الخروج', 'زيارة عائلية')}
          <Box sx={{ textAlign: 'center', my: '4px', py: '3px', borderTop: dash, borderBottom: dash }}>
            <div style={{ fontSize: '.9em' }}>المبلغ</div>
            <b style={{ fontSize: '2.2em', lineHeight: 1.2, fontWeight: 800 }}>12.50 ج.م</b>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '4px', mt: '8px' }}>
            <span>توقيع الكاشير</span>
            <i style={{ flex: 1, borderBottom: '1px solid black', height: '1em' }} />
          </Box>
          {values.receiptFooter ? <Box sx={{ mt: '6px', pt: '4px', borderTop: dash, textAlign: 'center', fontSize: '.9em' }}>{values.receiptFooter}</Box> : null}
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1 }}>
        الورق {width} مم · الخط المتقطع = منطقة الطباعة {printable} مم · المحتوى {content} مم
      </Typography>
    </Box>
  );
}

/** «طابعة الإيصالات (XP-90)»: layout options, live preview, save and calibration print. */
export function ReceiptPrinterCard({ settings }: { settings: UnitSettings }) {
  const queryClient = useQueryClient();
  const { control, handleSubmit, watch, setValue, reset, trigger, formState } = useForm<ReceiptValues>({
    resolver: zodResolver(receiptSchema),
    defaultValues: receiptFrom(settings),
  });
  const values = watch();
  const preset = presetOf(values);
  const pickPreset = (value: string) => {
    const p = RECEIPT_PRESETS.find((x) => x.value === value);
    if (!p || value === 'custom') return;
    for (const [key, v] of Object.entries(p.values)) setValue(key as keyof ReceiptValues, v as never, { shouldDirty: true });
    void trigger();
  };
  const save = handleSubmit(async (raw) => {
    const v: ReceiptNumbers = receiptSchema.parse(raw);
    try {
      await post('/api/settings', { ...settings, ...v });
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
      reset(v);
      notify.success('تم حفظ إعدادات الإيصال');
    } catch (e) {
      notify.apiError(e);
    }
  });
  /** Saves pending edits first (the print path reads the saved settings), then opens the calibration receipt. */
  const calibrate = (mode?: 'preview') => async () => {
    try {
      if (formState.isDirty) {
        if (!(await trigger())) return notify.error('صحح قيم الإيصال أولًا');
        await save();
      }
      await unwrap(bridge().testPrint(mode ? { kind: 'receipt', mode } : { kind: 'receipt' }));
      if (!mode) notify.success('تم إرسال ورقة المعايرة');
    } catch (e) {
      notify.apiError(e);
    }
  };
  const field = (name: keyof ReceiptValues, label: string, helperText: string, unitText = 'مم', step = 1) => (
    <RhfText control={control} name={name} label={label} type="number" helperText={helperText} slotProps={unit(unitText, step)} size="small" />
  );
  const sw = (name: 'receiptBold' | 'receiptShowLogo', label: string) => (
    <Controller control={control} name={name} render={({ field: f }) => <FormControlLabel control={<Switch checked={Boolean(f.value)} onChange={(_e, c) => f.onChange(c)} />} label={label} />} />
  );
  return (
    <SectionCard title="طابعة الإيصالات (XP-90)">
      <Grid container data-testid="receipt-card" spacing={3}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2}>
            <Alert severity="info">اطبع «ورقة المعايرة» أولًا: إن قُصّ طرف المسطرة أو المستطيل فقلّل «منطقة الطباعة» (الـ XP-90 عادةً 72 مم على ورق 80 مم).</Alert>
            <TextField select size="small" label="إعداد جاهز" value={preset} onChange={(e) => pickPreset(e.target.value)} sx={{ maxWidth: 280 }}>
              {RECEIPT_PRESETS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
            </TextField>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>{field('receiptWidthMm', 'عرض الورق', 'عرض اللفة الفعلي (48–110)')}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field('receiptPrintableWidthMm', 'منطقة الطباعة', 'يجب ألا تتجاوز عرض الورق (40–108)')}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field('receiptMarginMm', 'الهامش الجانبي', 'مسافة إضافية داخل منطقة الطباعة (0–10)')}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field('receiptFontPt', 'حجم الخط', 'من 7 إلى 18', 'نقطة')}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field('receiptLineHeight', 'تباعد الأسطر', 'من 1.0 إلى 2.2', '×', 0.1)}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field('receiptLogoMm', 'حجم الشعار', 'من 10 إلى 40', 'مم')}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field('receiptTopFeedMm', 'تغذية الأعلى', 'فراغ قبل بداية الطباعة (0–20)')}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field('receiptBottomFeedMm', 'تغذية الأسفل', 'فراغ قبل القاطع (0–30)')}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{field('receiptCopies', 'عدد النسخ', 'من 1 إلى 3 (كل نسخة إيصال مستقل)', 'نسخة')}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  control={control}
                  name="receiptHeightMode"
                  render={({ field: f }) => (
                    <Box>
                      <Typography variant="caption" color="text.secondary">ارتفاع الإيصال</Typography>
                      <ToggleButtonGroup exclusive size="small" fullWidth value={f.value} onChange={(_e, v) => v && f.onChange(v)}>
                        <ToggleButton value="auto">تلقائي</ToggleButton>
                        <ToggleButton value="fixed">ثابت</ToggleButton>
                      </ToggleButtonGroup>
                      <Typography variant="caption" color="text.secondary">«ثابت» لا يقصّ المحتوى أبدًا؛ إن زاد المحتوى يُقاس تلقائيًا.</Typography>
                    </Box>
                  )}
                />
              </Grid>
              {values.receiptHeightMode === 'fixed' && <Grid size={{ xs: 12, sm: 6 }}>{field('receiptHeightMm', 'الارتفاع الثابت', 'من 40 إلى 400')}</Grid>}
            </Grid>
            <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 3 }}>
              {sw('receiptBold', 'خط عريض (تباين أعلى للطابعة الحرارية)')}
              {sw('receiptShowLogo', 'إظهار الشعار')}
            </Stack>
            <RhfText control={control} name="receiptFooter" label="نص أسفل الإيصال" size="small" helperText="اختياري — حتى 120 حرفًا" />
            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button variant="contained" onClick={save} loading={formState.isSubmitting}>حفظ</Button>
              <Button variant="tonal" onClick={calibrate()}>طباعة معايرة</Button>
              <Button variant="tonal" color="inherit" onClick={calibrate('preview')}>معاينة</Button>
            </Stack>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>معاينة حيّة (إذن خروج تجريبي)</Typography>
          <ReceiptPreview values={values} />
        </Grid>
      </Grid>
    </SectionCard>
  );
}
