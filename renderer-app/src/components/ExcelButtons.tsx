import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import TemplateIcon from '@mui/icons-material/GridOnOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/endpoints';
import type { ExcelImportFile, ExcelWorkbookArg, ImportResult } from '@/api/types';
import { ToneChip } from '@/components/interactive';
import { errorsWorkbook, mapImportRows, submitInChunks, templateWorkbook, type ImportSpec, type MappedImport } from '@/lib/excel';
import { notify } from '@/lib/notify';

/** Export (when `build` is given) + optional import / template buttons for list pages. */
export function ExcelButtons({
  build,
  importSpec,
  disabled,
  size = 'small',
}: {
  /** Builds the workbook lazily so large tables are only mapped on click. */
  build?: () => ExcelWorkbookArg;
  importSpec?: ImportSpec;
  disabled?: boolean;
  size?: 'small' | 'medium';
}) {
  const [busy, setBusy] = useState<'export' | 'template' | 'pick' | null>(null);
  const [pending, setPending] = useState<{ file: ExcelImportFile; mapped: MappedImport } | null>(null);
  const save = async (kind: 'export' | 'template', arg: ExcelWorkbookArg) => {
    setBusy(kind);
    try {
      const saved = kind === 'export' ? await api.excelExport(arg) : await api.excelTemplate(arg);
      if (saved) notify.success(kind === 'export' ? 'تم حفظ ملف Excel' : 'تم حفظ القالب');
    } catch (e) {
      notify.apiError(e);
    } finally {
      setBusy(null);
    }
  };
  const pick = async () => {
    if (!importSpec) return;
    setBusy('pick');
    try {
      const file = await api.excelImport();
      if (file) setPending({ file, mapped: mapImportRows(file, importSpec) });
    } catch (e) {
      notify.apiError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {build && (
          <Button size={size} variant="tonal" startIcon={<DownloadIcon />} disabled={disabled || (busy !== null && busy !== 'export')} loading={busy === 'export'} onClick={() => void save('export', build())}>
            تصدير Excel
          </Button>
        )}
        {importSpec && (
          <>
            <Button size={size} variant="tonal" startIcon={<UploadIcon />} loading={busy === 'pick'} disabled={busy !== null && busy !== 'pick'} onClick={() => void pick()}>
              استيراد Excel
            </Button>
            <Button size={size} variant="text" startIcon={<TemplateIcon />} loading={busy === 'template'} disabled={busy !== null && busy !== 'template'} onClick={() => void save('template', templateWorkbook(importSpec))}>
              تحميل القالب
            </Button>
          </>
        )}
      </Stack>
      {pending && importSpec && <ImportDialog spec={importSpec} data={pending} onClose={() => setPending(null)} />}
    </>
  );
}

/** Preview (first rows + counts) -> submit in chunks -> result with per-row errors. */
export function ImportDialog({ spec, data, onClose }: { spec: ImportSpec; data: { file: ExcelImportFile; mapped: MappedImport }; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { mapped, file } = data;
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fields = spec.fields.filter((f) => mapped.matched.includes(f.key));
  const missingSoldierPhotos = spec.path === '/api/soldiers/import' && mapped.rows.some((row) => !Array.isArray(row.photos) || row.photos.length !== 4);
  const blocked = mapped.missingRequired.length > 0 || mapped.rows.length === 0 || missingSoldierPhotos;
  const submit = async () => {
    setProgress([0, mapped.rows.length]);
    try {
      const res = await submitInChunks(mapped.rows, (rows, id) => api.importRows(spec.path, rows, id), (d, t) => setProgress([d, t]));
      setResult(res);
      await queryClient.invalidateQueries();
    } catch (e) {
      notify.apiError(e);
    } finally {
      setProgress(null);
    }
  };
  const busy = progress !== null;
  if (result) {
    return (
      <Dialog open onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>نتيجة الاستيراد</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1}>
              <ToneChip tone="success" label={`تمت إضافة ${result.created}`} />
              <ToneChip tone="warning" label={`تم تخطي ${result.skipped}`} />
              <ToneChip tone={result.errors.length ? 'danger' : 'neutral'} label={`أخطاء ${result.errors.length}`} />
            </Stack>
            {result.errors.length > 0 && (
              <Table size="small" aria-label="أخطاء الاستيراد">
                <TableHead><TableRow><TableCell width={90}>الصف</TableCell><TableCell>الرسالة</TableCell></TableRow></TableHead>
                <TableBody>
                  {result.errors.slice(0, 100).map((e, i) => <TableRow key={i}><TableCell className="num">{e.row}</TableCell><TableCell>{e.message}</TableCell></TableRow>)}
                </TableBody>
              </Table>
            )}
            {result.errors.length > 100 && <Typography variant="caption">يظهر أول 100 خطأ؛ نزّل الملف للقائمة الكاملة.</Typography>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {result.errors.length > 0 && <Button variant="tonal" startIcon={<DownloadIcon />} onClick={() => void api.excelExport(errorsWorkbook(result)).catch(notify.apiError)}>تنزيل الأخطاء Excel</Button>}
          <Button variant="contained" onClick={onClose}>إغلاق</Button>
        </DialogActions>
      </Dialog>
    );
  }
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>معاينة الاستيراد — {file.fileName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <ToneChip tone="info" label={`${mapped.rows.length} صفًا للاستيراد`} icon={false} />
            <ToneChip tone="success" label={`${mapped.matched.length} عمودًا معروفًا`} icon={false} />
            {mapped.unknownHeaders.length > 0 && <ToneChip tone="warning" label={`أعمدة متجاهلة: ${mapped.unknownHeaders.join('، ')}`} icon={false} />}
          </Stack>
          {mapped.missingRequired.length > 0 && <Alert severity="error">أعمدة مطلوبة غير موجودة: {mapped.missingRequired.map((f) => f.header).join('، ')}</Alert>}
          {missingSoldierPhotos && <Alert severity="warning">صور العسكري الأربع إلزامية؛ جدول البيانات وحده لا يكفي لإنشاء ملف عسكري. استخدم «إضافة عسكري» لإدخال البيانات والصور وحفظ الملف كاملًا.</Alert>}
          {mapped.rows.length === 0 && mapped.missingRequired.length === 0 && <Alert severity="warning">الملف لا يحتوي على صفوف.</Alert>}
          <div style={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="معاينة الصفوف">
              <TableHead><TableRow>{fields.map((f) => <TableCell key={f.key}>{f.header}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {mapped.rows.slice(0, 8).map((r, i) => <TableRow key={i}>{fields.map((f) => <TableCell key={f.key}>{r[f.key] ?? '—'}</TableCell>)}</TableRow>)}
              </TableBody>
            </Table>
          </div>
          {mapped.rows.length > 8 && <Typography variant="caption">يعرض أول 8 صفوف من {mapped.rows.length}. يُرسل الملف على دفعات من 1000 صف.</Typography>}
          {busy && <LinearProgress variant="determinate" value={progress[1] ? (progress[0] / progress[1]) * 100 : 0} />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="tonal" onClick={onClose} disabled={busy}>إلغاء</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={blocked} loading={busy}>استيراد {mapped.rows.length} صفًا</Button>
      </DialogActions>
    </Dialog>
  );
}
